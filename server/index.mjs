import express from "express";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import multer from "multer";
import { Readable } from "stream";

const DATA_DIR = process.env.DATA_DIR || "/data";
const PORT = process.env.PORT || 3001;

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

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
app.use(express.json({ limit: "50mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ── Health ──
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", dbPath, dataDir: DATA_DIR });
});

// ── Get all key-value pairs ──
app.get("/api/store", (_req, res) => {
  try {
    const rows = db.prepare("SELECT key, value FROM store").all();
    const data = {};
    for (const row of rows) {
      data[row.key] = row.value;
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
    const entries = req.body; // { key: value, ... }
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

// ── Backup: download as zip with folder structure ──
app.get("/api/backup", (_req, res) => {
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
        // Parse meetings array and write each separately
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
        // Parse transcripts object
        try {
          const obj = JSON.parse(value);
          for (const [mid, segs] of Object.entries(obj)) {
            transcripts[mid] = JSON.stringify(segs, null, 2);
          }
        } catch {
          transcripts["_raw"] = value;
        }
      } else {
        // Everything else is a setting
        const settingKey = key.replace("meetscribe_", "");
        settings[settingKey] = value;
      }
    }

    // Write files into archive
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

    // Include raw SQLite DB copy for full fidelity
    archive.file(dbPath, { name: "meetscribe.db" });

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Restore: upload zip backup ──
app.post("/api/restore", upload.single("backup"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const entries = {};
    const settings = {};
    const meetingsArr = [];
    const transcriptsObj = {};

    const stream = Readable.from(req.file.buffer);
    const zip = stream.pipe(unzipper.Parse({ forceStream: true }));

    for await (const entry of zip) {
      const filePath = entry.path;
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

    res.json({ ok: true, restoredKeys: Object.keys(entries).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── App info (for version tracking on updates) ──
app.get("/api/info", (_req, res) => {
  const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  res.json({
    name: pkg.name,
    version: pkg.version || "1.0.0",
    dataDir: DATA_DIR,
    dbSize: fs.statSync(dbPath).size,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MeetScribe API server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Database: ${dbPath}`);
});
