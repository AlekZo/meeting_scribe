// Google Calendar + Google Docs integration via service account
import { google } from "googleapis";
import fs from "fs";
import path from "path";

const SA_PATH_ENV = process.env.GOOGLE_SA_PATH;

/**
 * Load service account credentials from the data directory.
 * Users upload the JSON key file via the Settings UI → POST /api/google/service-account
 */
function loadServiceAccount(dataDir) {
  const saPath = SA_PATH_ENV || path.join(dataDir, "google-service-account.json");
  if (!fs.existsSync(saPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(saPath, "utf8"));
  } catch {
    return null;
  }
}

function getAuth(dataDir, scopes) {
  const creds = loadServiceAccount(dataDir);
  if (!creds) throw new Error("Google service account not configured. Upload your JSON key in Settings → Google.");
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes,
  });
}

// ── Route installer ──
export function registerGoogleRoutes(app, dataDir, upload) {
  // Upload service account JSON
  app.post("/api/google/service-account", upload.single("sa"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    try {
      // Validate JSON
      const content = fs.readFileSync(req.file.path, "utf8");
      const parsed = JSON.parse(content);
      if (!parsed.client_email || !parsed.private_key) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Invalid service account JSON: missing client_email or private_key" });
      }
      const dest = path.join(dataDir, "google-service-account.json");
      fs.copyFileSync(req.file.path, dest);
      fs.unlinkSync(req.file.path);
      res.json({ ok: true, email: parsed.client_email });
    } catch (err) {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(400).json({ error: `Invalid JSON: ${err.message}` });
    }
  });

  // Check if service account is configured
  app.get("/api/google/status", (_req, res) => {
    const creds = loadServiceAccount(dataDir);
    res.json({
      configured: !!creds,
      email: creds?.client_email || null,
    });
  });

  // Remove service account
  app.delete("/api/google/service-account", (_req, res) => {
    const saPath = path.join(dataDir, "google-service-account.json");
    try { fs.unlinkSync(saPath); } catch {}
    res.json({ ok: true });
  });

  // ── Google Calendar: fetch events around a date ──
  app.get("/api/google/calendar/events", async (req, res) => {
    try {
      const { calendarId = "primary", date, timezone = "UTC" } = req.query;
      const auth = getAuth(dataDir, ["https://www.googleapis.com/auth/calendar.readonly"]);
      const cal = google.calendar({ version: "v3", auth });

      // If date provided, search ±1 day around it
      let timeMin, timeMax;
      if (date) {
        const d = new Date(date);
        timeMin = new Date(d.getTime() - 24 * 60 * 60 * 1000).toISOString();
        timeMax = new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString();
      } else {
        // Default: today ± 1 day
        const now = new Date();
        timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      }

      const response = await cal.events.list({
        calendarId,
        timeMin,
        timeMax,
        timeZone: timezone,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });

      const events = (response.data.items || []).map((e) => ({
        id: e.id,
        summary: e.summary || "(No title)",
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        description: e.description || "",
        attendees: (e.attendees || []).map((a) => a.email),
        location: e.location || "",
        htmlLink: e.htmlLink,
      }));

      res.json({ events, total: events.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Google Docs: create a document with transcript ──
  app.post("/api/google/docs/create", express_json_parse, async (req, res) => {
    try {
      const { title, content, folderId } = req.body;
      if (!title || !content) return res.status(400).json({ error: "title and content required" });

      const auth = getAuth(dataDir, [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.file",
      ]);

      const docs = google.docs({ version: "v1", auth });
      const drive = google.drive({ version: "v3", auth });

      // Create the document
      const doc = await docs.documents.create({
        requestBody: { title },
      });

      const docId = doc.data.documentId;

      // Insert content
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        },
      });

      // Move to folder if specified
      if (folderId) {
        try {
          const file = await drive.files.get({ fileId: docId, fields: "parents" });
          const previousParents = (file.data.parents || []).join(",");
          await drive.files.update({
            fileId: docId,
            addParents: folderId,
            removeParents: previousParents,
            fields: "id, parents",
          });
        } catch (moveErr) {
          console.warn("Could not move doc to folder:", moveErr.message);
        }
      }

      res.json({
        ok: true,
        documentId: docId,
        url: `https://docs.google.com/document/d/${docId}/edit`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Test connection ──
  app.get("/api/google/test", async (req, res) => {
    try {
      const { calendarId = "primary" } = req.query;
      const auth = getAuth(dataDir, ["https://www.googleapis.com/auth/calendar.readonly"]);
      const cal = google.calendar({ version: "v3", auth });

      // Try to list 1 event as a connection test
      await cal.events.list({
        calendarId,
        maxResults: 1,
        timeMin: new Date().toISOString(),
      });

      res.json({ ok: true, message: "Google Calendar connection successful" });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

// Middleware helper - express.json() may already be applied globally but
// we declare a no-op so the route handler doesn't crash
const express_json_parse = (req, res, next) => next();
