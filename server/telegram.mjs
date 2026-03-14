// Telegram Bot integration for MeetScribe
// Handles: connection testing, outgoing notifications, incoming audio polling

const TG_API = "https://api.telegram.org";

function getBotUrl(token) {
  return `${TG_API}/bot${token}`;
}

/** Send a text message to a Telegram chat */
async function sendMessage(token, chatId, text, parseMode = "HTML") {
  const res = await fetch(`${getBotUrl(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result;
}

/** Download a file from Telegram by file_id */
async function downloadFile(token, fileId) {
  // Step 1: get file path
  const res = await fetch(`${getBotUrl(token)}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`getFile failed: ${data.description}`);

  const filePath = data.result.file_path;

  // Step 2: download binary
  const dlRes = await fetch(`${TG_API}/file/bot${token}/${filePath}`);
  if (!dlRes.ok) throw new Error(`File download failed: ${dlRes.status}`);

  return {
    buffer: Buffer.from(await dlRes.arrayBuffer()),
    fileName: filePath.split("/").pop() || "telegram_audio",
    fileSize: data.result.file_size,
  };
}

/** Register Telegram routes on the Express app */
export function registerTelegramRoutes(app, db) {
  // ── Test connection ──
  app.post("/api/telegram/test", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Missing bot token" });

    try {
      const r = await fetch(`${getBotUrl(token)}/getMe`);
      const data = await r.json();
      if (!data.ok) return res.status(401).json({ error: data.description });
      res.json({ ok: true, bot: data.result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Send notification ──
  app.post("/api/telegram/notify", async (req, res) => {
    const { token, chatIds, message } = req.body;
    if (!token || !message) return res.status(400).json({ error: "Missing token or message" });

    const ids = Array.isArray(chatIds) ? chatIds : (chatIds || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ error: "No chat IDs specified" });

    const results = [];
    for (const chatId of ids) {
      try {
        const result = await sendMessage(token, chatId, message);
        results.push({ chatId, ok: true, messageId: result.message_id });
      } catch (err) {
        results.push({ chatId, ok: false, error: err.message });
      }
    }
    res.json({ results });
  });

  // ── Poll for incoming updates (voice messages, audio files) ──
  // Uses long polling with offset tracking stored in SQLite
  app.post("/api/telegram/poll", async (req, res) => {
    const { token, allowedChatIds } = req.body;
    if (!token) return res.status(400).json({ error: "Missing bot token" });

    try {
      // Get stored offset
      const row = db.prepare("SELECT value FROM store WHERE key = 'tg_update_offset'").get();
      const offset = row ? parseInt(row.value, 10) : 0;

      const r = await fetch(`${getBotUrl(token)}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offset,
          timeout: 5, // short poll for server-side; frontend will call periodically
          allowed_updates: ["message"],
        }),
      });

      const data = await r.json();
      if (!data.ok) return res.status(502).json({ error: data.description });

      const updates = data.result || [];
      if (updates.length === 0) return res.json({ audioFiles: [], newOffset: offset });

      // Filter to allowed chat IDs if configured
      const allowed = allowedChatIds?.length > 0
        ? new Set(allowedChatIds.map(String))
        : null;

      const audioFiles = [];

      for (const update of updates) {
        const msg = update.message;
        if (!msg) continue;

        // Check chat ID allowlist
        if (allowed && !allowed.has(String(msg.chat.id))) continue;

        // Extract audio file_id from voice messages, audio files, or documents
        let fileId = null;
        let fileName = null;
        let mimeType = null;

        if (msg.voice) {
          fileId = msg.voice.file_id;
          fileName = `voice_${msg.message_id}.ogg`;
          mimeType = msg.voice.mime_type || "audio/ogg";
        } else if (msg.audio) {
          fileId = msg.audio.file_id;
          fileName = msg.audio.file_name || `audio_${msg.message_id}.mp3`;
          mimeType = msg.audio.mime_type || "audio/mpeg";
        } else if (msg.document) {
          const docMime = msg.document.mime_type || "";
          if (docMime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac|mp4|mkv|avi|mov|webm)$/i.test(msg.document.file_name || "")) {
            fileId = msg.document.file_id;
            fileName = msg.document.file_name || `file_${msg.message_id}`;
            mimeType = docMime;
          }
        } else if (msg.video_note) {
          fileId = msg.video_note.file_id;
          fileName = `videonote_${msg.message_id}.mp4`;
          mimeType = "video/mp4";
        }

        if (fileId) {
          audioFiles.push({
            fileId,
            fileName,
            mimeType,
            chatId: msg.chat.id,
            chatTitle: msg.chat.title || msg.chat.first_name || String(msg.chat.id),
            messageId: msg.message_id,
            date: msg.date,
            caption: msg.caption || null,
          });
        }
      }

      // Update offset
      const newOffset = Math.max(...updates.map((u) => u.update_id)) + 1;
      db.prepare(
        "INSERT INTO store (key, value, updated_at) VALUES ('tg_update_offset', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      ).run(String(newOffset));

      res.json({ audioFiles, newOffset });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Download a Telegram file by file_id ──
  app.post("/api/telegram/download", async (req, res) => {
    const { token, fileId } = req.body;
    if (!token || !fileId) return res.status(400).json({ error: "Missing token or fileId" });

    try {
      const { buffer, fileName, fileSize } = await downloadFile(token, fileId);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("X-File-Size", String(fileSize || buffer.length));
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Send a reply to a specific chat (for interactive responses) ──
  app.post("/api/telegram/reply", async (req, res) => {
    const { token, chatId, text, replyToMessageId } = req.body;
    if (!token || !chatId || !text) return res.status(400).json({ error: "Missing required fields" });

    try {
      const body = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      };
      if (replyToMessageId) body.reply_to_message_id = replyToMessageId;

      const r = await fetch(`${getBotUrl(token)}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.ok) return res.status(502).json({ error: data.description });
      res.json({ ok: true, messageId: data.result.message_id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
