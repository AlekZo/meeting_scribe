// Telegram integration client — calls the Express backend routes

import { loadSetting } from "@/lib/storage";

const API_BASE = "/api/telegram";

function getConfig() {
  const token = loadSetting<string>("tg_bot_token", "");
  const chatIdRaw = loadSetting<string>("tg_chat_id", "");
  const chatIds = chatIdRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const enabled = loadSetting<boolean>("tg_enabled", false);
  return { token, chatIds, enabled };
}

/** Test bot connection — returns bot info or throws */
export async function testBotConnection(): Promise<{ username: string; firstName: string }> {
  const { token } = getConfig();
  if (!token) throw new Error("Bot token not configured");

  const res = await fetch(`${API_BASE}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Connection failed");
  return { username: data.bot.username, firstName: data.bot.first_name };
}

/** Send a notification message to all configured chat IDs */
export async function sendNotification(message: string): Promise<void> {
  const { token, chatIds, enabled } = getConfig();
  if (!enabled || !token || chatIds.length === 0) return;

  try {
    const res = await fetch(`${API_BASE}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatIds, message }),
    });
    if (!res.ok) {
      const data = await res.json();
      console.warn("[telegram] Notification failed:", data.error);
    }
  } catch (err) {
    console.warn("[telegram] Notification error:", err);
  }
}

/** Send a transcription completion notification */
export function notifyTranscriptionComplete(title: string, segmentCount: number, duration: string): void {
  const msg =
    `✅ <b>Transcription Complete</b>\n\n` +
    `📝 <b>${escapeHtml(title)}</b>\n` +
    `⏱ Duration: ${duration}\n` +
    `💬 ${segmentCount} segments`;
  sendNotification(msg);
}

/** Send a transcription error notification */
export function notifyTranscriptionError(fileName: string, error: string): void {
  const msg =
    `❌ <b>Transcription Failed</b>\n\n` +
    `📁 ${escapeHtml(fileName)}\n` +
    `⚠️ ${escapeHtml(error)}`;
  sendNotification(msg);
}

/** Send an upload started notification */
export function notifyUploadStarted(fileName: string, sizeMB: string): void {
  const msg =
    `📤 <b>Upload Started</b>\n\n` +
    `📁 ${escapeHtml(fileName)}\n` +
    `💾 Size: ${sizeMB} MB`;
  sendNotification(msg);
}

export interface TelegramAudioFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  chatId: number;
  chatTitle: string;
  messageId: number;
  date: number;
  caption: string | null;
}

/** Poll for incoming audio files from Telegram */
export async function pollIncomingAudio(): Promise<TelegramAudioFile[]> {
  const { token, chatIds, enabled } = getConfig();
  if (!enabled || !token) return [];

  try {
    const res = await fetch(`${API_BASE}/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, allowedChatIds: chatIds }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.audioFiles || [];
  } catch {
    return [];
  }
}

/** Download a Telegram file and return it as a File object for the upload queue */
export async function downloadTelegramFile(fileId: string, fileName: string): Promise<File> {
  const { token } = getConfig();
  if (!token) throw new Error("Bot token not configured");

  const res = await fetch(`${API_BASE}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, fileId }),
  });
  if (!res.ok) throw new Error("Failed to download file from Telegram");

  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type });
}

/** Send a reply to a specific Telegram chat */
export async function sendReply(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
  const { token } = getConfig();
  if (!token) return;

  await fetch(`${API_BASE}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, chatId, text, replyToMessageId }),
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
