import express from "express";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import multer from "multer";
import { Readable } from "stream";
import os from "os";
import { registerGoogleRoutes } from "./google.mjs";
import { registerTelegramRoutes } from "./telegram.mjs";

const DATA_DIR = process.env.DATA_DIR || "/data";
const MEDIA_DIR = path.join(DATA_DIR, "media");
const PORT = process.env.PORT || 3001;

// Ensure data directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "meetscribe.db");
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

const app = express();
app.use(express.json({ limit: "5mb" }));

// Use disk storage instead of memory to avoid RAM spikes on large uploads
const uploadDir = path.join(os.tmpdir(), "meetscribe-uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// ── Serve permanent media files ──
app.use("/api/media", express.static(MEDIA_DIR));

// ── Health ──
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", dbPath, dataDir: DATA_DIR, mediaDir: MEDIA_DIR });
});

// ── Upload media to permanent storage ──
app.post("/api/media/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const permanentPath = path.join(MEDIA_DIR, req.file.filename);
    fs.renameSync(req.file.path, permanentPath);
    res.json({
      ok: true,
      url: `/api/media/${req.file.filename}`,
      filename: req.file.filename,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete a media file ──
app.delete("/api/media/:filename", (req, res) => {
  try {
    const filePath = path.join(MEDIA_DIR, path.basename(req.params.filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get all key-value pairs ──
app.get("/api/store", (_req, res) => {
  try {
    const rows = db.prepare("SELECT key, value, updated_at FROM store").all();
    const data = {};
    for (const row of rows) {
      data[row.key] = { value: row.value, updated_at: row.updated_at };
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get single key ──
app.get("/api/store/:key", (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM store WHERE key = ?").get(req.params.key);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ key: req.params.key, value: row.value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Set key-value ──
app.put("/api/store/:key", (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: "Missing value" });
    db.prepare(
      "INSERT INTO store (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).run(req.params.key, typeof value === "string" ? value : JSON.stringify(value));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk set (for initial sync or restore) ──
app.post("/api/store/bulk", (req, res) => {
  try {
    const entries = req.body;
    const upsert = db.prepare(
      "INSERT INTO store (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    );
    const tx = db.transaction((items) => {
      for (const [key, value] of Object.entries(items)) {
        upsert.run(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    });
    tx(entries);
    res.json({ ok: true, count: Object.keys(entries).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete key ──
app.delete("/api/store/:key", (req, res) => {
  try {
    db.prepare("DELETE FROM store WHERE key = ?").run(req.params.key);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clear all data ──
app.delete("/api/store", (_req, res) => {
  try {
    db.prepare("DELETE FROM store").run();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Backup: download as zip (safe WAL snapshot) ──
app.get("/api/backup", async (_req, res) => {
  try {
    const rows = db.prepare("SELECT key, value FROM store").all();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="meetscribe-backup-${timestamp}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    // Categorize keys into folders
    const settings = {};
    const meetings = {};
    const overrides = {};
    const transcripts = {};
    let activityLog = null;

    for (const row of rows) {
      const key = row.key;
      const value = row.value;

      if (key === "meetscribe_activity_log") {
        activityLog = value;
      } else if (key === "meetscribe_meetings") {
        try {
          const arr = JSON.parse(value);
          if (Array.isArray(arr)) {
            for (const m of arr) {
              meetings[m.id || `meeting_${Object.keys(meetings).length}`] = JSON.stringify(m, null, 2);
            }
          }
        } catch {
          meetings["_raw"] = value;
        }
      } else if (key.startsWith("meetscribe_meeting_override_")) {
        const meetingId = key.replace("meetscribe_meeting_override_", "");
        overrides[meetingId] = value;
      } else if (key === "meetscribe_transcripts") {
        try {
          const obj = JSON.parse(value);
          for (const [mid, segs] of Object.entries(obj)) {
            transcripts[mid] = JSON.stringify(segs, null, 2);
          }
        } catch {
          transcripts["_raw"] = value;
        }
      } else {
        const settingKey = key.replace("meetscribe_", "");
        settings[settingKey] = value;
      }
    }

    // Write JSON files into archive
    archive.append(JSON.stringify(settings, null, 2), { name: "settings.json" });

    if (activityLog) {
      archive.append(activityLog, { name: "activity.json" });
    }

    for (const [id, data] of Object.entries(meetings)) {
      archive.append(data, { name: `meetings/${id}.json` });
    }

    for (const [id, data] of Object.entries(overrides)) {
      archive.append(data, { name: `overrides/${id}.json` });
    }

    for (const [id, data] of Object.entries(transcripts)) {
      archive.append(data, { name: `transcripts/${id}.json` });
    }

    // Safe WAL-aware database snapshot using better-sqlite3's .backup()
    const snapshotPath = path.join(DATA_DIR, "snapshot.db");
    await db.backup(snapshotPath);
    archive.file(snapshotPath, { name: "meetscribe.db" });

    archive.on("end", () => {
      // Clean up snapshot after archive is fully sent
      try { fs.unlinkSync(snapshotPath); } catch {}
    });

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Restore: upload zip backup (from disk, not memory) ──
app.post("/api/restore", upload.single("backup"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const entries = {};
    const meetingsArr = [];
    const transcriptsObj = {};

    const stream = fs.createReadStream(req.file.path);
    const zip = stream.pipe(unzipper.Parse({ forceStream: true }));

    for await (const entry of zip) {
      const filePath = entry.path;

      // Skip the raw .db file — we restore from JSON dumps for safety
      if (filePath === "meetscribe.db") {
        entry.autodrain();
        continue;
      }

      const content = (await entry.buffer()).toString("utf8");

      if (filePath === "settings.json") {
        try {
          const parsed = JSON.parse(content);
          for (const [k, v] of Object.entries(parsed)) {
            entries[`meetscribe_${k}`] = typeof v === "string" ? v : JSON.stringify(v);
          }
        } catch {}
      } else if (filePath === "activity.json") {
        entries["meetscribe_activity_log"] = content;
      } else if (filePath.startsWith("meetings/") && filePath.endsWith(".json")) {
        try {
          meetingsArr.push(JSON.parse(content));
        } catch {}
      } else if (filePath.startsWith("overrides/") && filePath.endsWith(".json")) {
        const meetingId = path.basename(filePath, ".json");
        entries[`meetscribe_meeting_override_${meetingId}`] = content;
      } else if (filePath.startsWith("transcripts/") && filePath.endsWith(".json")) {
        const meetingId = path.basename(filePath, ".json");
        try {
          transcriptsObj[meetingId] = JSON.parse(content);
        } catch {}
      } else {
        entry.autodrain();
      }
    }

    // Merge meetings array
    if (meetingsArr.length > 0) {
      entries["meetscribe_meetings"] = JSON.stringify(meetingsArr);
    }

    // Merge transcripts object
    if (Object.keys(transcriptsObj).length > 0) {
      entries["meetscribe_transcripts"] = JSON.stringify(transcriptsObj);
    }

    // Upsert all entries
    const upsert = db.prepare(
      "INSERT INTO store (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    );
    const tx = db.transaction((items) => {
      for (const [key, value] of Object.entries(items)) {
        upsert.run(key, value);
      }
    });
    tx(entries);

    // Clean up uploaded temp file
    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({ ok: true, restoredKeys: Object.keys(entries).length });
  } catch (err) {
    // Clean up on error too
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// ── App info ──
app.get("/api/info", (_req, res) => {
  const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  res.json({
    name: pkg.name,
    version: pkg.version || "1.0.0",
    dataDir: DATA_DIR,
    dbSize: fs.statSync(dbPath).size,
  });
});

// ── Storage info: list files in data volume ──
app.get("/api/storage", (_req, res) => {
  try {
    const walkDir = (dir, prefix = "") => {
      const results = [];
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const relPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.isDirectory()) {
          results.push(...walkDir(path.join(dir, item.name), relPath));
        } else {
          const stat = fs.statSync(path.join(dir, item.name));
          results.push({
            path: relPath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
      return results;
    };

    const files = walkDir(DATA_DIR);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    res.json({
      dataDir: DATA_DIR,
      totalSize,
      fileCount: files.length,
      files,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Google integration ──
registerGoogleRoutes(app, DATA_DIR, upload);

// ── Telegram bot integration ──
registerTelegramRoutes(app, db);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MeetScribe API server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Database: ${dbPath}`);
});
