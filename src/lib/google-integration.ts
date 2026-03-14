// Google Calendar matching + Google Docs auto-sync
// Called after transcription completes to:
// 1. Parse date/time from filename → query Google Calendar → rename meeting
// 2. Push transcript to Google Docs

import { loadSetting } from "@/lib/storage";

const API_BASE = "/api";

/** Try to extract a date from the filename (common patterns) */
export function parseDateFromFilename(filename: string): string | null {
  // Remove extension
  const name = filename.replace(/\.[^.]+$/, "");

  // Match patterns like: 2026-03-12, 2026.03.12, 2026_03_12, 20260312
  const isoMatch = name.match(/(\d{4})[\-._]?(\d{2})[\-._]?(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(`${y}-${m}-${d}`);
    if (!isNaN(date.getTime())) return `${y}-${m}-${d}`;
  }

  // Match patterns like: 12-03-2026, 12.03.2026 (DD-MM-YYYY)
  const euMatch = name.match(/(\d{2})[\-._](\d{2})[\-._](\d{4})/);
  if (euMatch) {
    const [, d, m, y] = euMatch;
    const date = new Date(`${y}-${m}-${d}`);
    if (!isNaN(date.getTime())) return `${y}-${m}-${d}`;
  }

  return null;
}

/** Query Google Calendar for events on a given date and find the best match */
export async function matchCalendarEvent(
  filename: string,
  date: string,
): Promise<{ title: string; start: string; end: string; attendees: string[] } | null> {
  const calendarId = loadSetting("google_calendar_id", "primary");
  const timezone = loadSetting("timezone", "Europe/Moscow");

  try {
    const res = await fetch(
      `${API_BASE}/google/calendar/events?calendarId=${encodeURIComponent(calendarId)}&date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(timezone)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.events || data.events.length === 0) return null;

    // If only one event on that day, use it
    if (data.events.length === 1) return data.events[0];

    // Try fuzzy matching: check if any event title words appear in the filename
    const nameLower = filename.toLowerCase().replace(/[^a-zа-яёіїєґ0-9]/g, " ");
    let bestMatch = data.events[0];
    let bestScore = 0;

    for (const event of data.events) {
      const words = event.summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      const score = words.filter((w: string) => nameLower.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = event;
      }
    }

    return bestMatch;
  } catch (err) {
    console.warn("[google] Calendar match failed:", err);
    return null;
  }
}

/** Create a Google Doc with the meeting transcript */
export async function syncTranscriptToDoc(
  title: string,
  segments: { speaker: string; text: string; startTime: number; endTime: number }[],
): Promise<{ documentId: string; url: string } | null> {
  const folderId = loadSetting("google_drive_folder_id", "");

  // Format transcript as readable text
  const lines: string[] = [];
  lines.push(`Transcript: ${title}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("");

  for (const seg of segments) {
    const start = formatTime(seg.startTime);
    const speaker = seg.speaker || "Speaker";
    lines.push(`[${start}] ${speaker}:`);
    lines.push(seg.text);
    lines.push("");
  }

  const content = lines.join("\n");

  try {
    const res = await fetch(`${API_BASE}/google/docs/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Transcript - ${title}`, content, folderId: folderId || undefined }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.warn("[google] Doc create failed:", err.error);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[google] Doc sync failed:", err);
    return null;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
