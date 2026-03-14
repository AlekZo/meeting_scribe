// Google Calendar matching + Google Docs auto-sync
// Called after transcription completes to:
// 1. Parse date/time from filename → query Google Calendar → rename meeting
// 2. Push transcript to Google Docs

import { loadSetting } from "@/lib/storage";

const API_BASE = "/api";

/** Try to extract a date from the filename (common patterns) */
export function parseDateFromFilename(filename: string): string | null {
  const name = filename.replace(/\.[^.]+$/, "");

  // ISO: 2026-03-12, 2026.03.12, 2026_03_12, 20260312
  const isoMatch = name.match(/(\d{4})[\-._]?(\d{2})[\-._]?(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(`${y}-${m}-${d}`);
    if (!isNaN(date.getTime())) return `${y}-${m}-${d}`;
  }

  // EU: 22.01.2026, 22-01-2026, 22/01/2026 (DD-MM-YYYY)
  const euMatch = name.match(/(\d{2})[\-._\/](\d{2})[\-._\/](\d{4})/);
  if (euMatch) {
    const [, d, m, y] = euMatch;
    const date = new Date(`${y}-${m}-${d}`);
    if (!isNaN(date.getTime())) return `${y}-${m}-${d}`;
  }

  // DD_Mon_YY: 18_Feb_26
  const monMatch = name.match(/(\d{1,2})_(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)_(\d{2})/i);
  if (monMatch) {
    const months: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const d = monMatch[1].padStart(2, "0");
    const m = months[monMatch[2].toLowerCase()];
    const y = `20${monMatch[3]}`;
    if (m) return `${y}-${m}-${d}`;
  }

  // Short: YYMMDDHHMM (10 digits)
  const shortMatch = name.match(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (shortMatch) {
    const [, yy, mo, dd] = shortMatch;
    const y = `20${yy}`;
    const date = new Date(`${y}-${mo}-${dd}`);
    if (!isNaN(date.getTime())) return `${y}-${mo}-${dd}`;
  }

  return null;
}

/** Extract datetime with time component from filename for precise calendar matching.
 *  Supports ISO, EU (DD.MM.YYYY), DD_Mon_YY, and YYMMDDHHMM patterns.
 *  If no date found in filename, falls back to File.lastModified when available. */
export function parseDateTimeFromFilename(
  filename: string,
  fileLastModified?: number,
): { date: string; timeUtc?: string } | null {
  const name = filename.replace(/\.[^.]+$/, "");

  // 1. ISO with time: 2026-02-19_14-30-00, 2026.02.19.14.30.00, 20260219_143000
  const dtMatch = name.match(/(\d{4})[\-._]?(\d{2})[\-._]?(\d{2})[\-._\s]?(\d{2})[\-._:]?(\d{2})[\-._:]?(\d{2})?/);
  if (dtMatch) {
    const [, y, mo, d, h, mi, s = "00"] = dtMatch;
    const date = `${y}-${mo}-${d}`;
    return { date, timeUtc: `${h}:${mi}:${s}` };
  }

  // 2. EU with optional time: 22-01-2026_14-30-00 or 22.01.2026
  const euDtMatch = name.match(/(\d{2})[\-._\/](\d{2})[\-._\/](\d{4})(?:[\-._T\s](\d{2})[\-._:](\d{2})(?:[\-._:](\d{2}))?)?/);
  if (euDtMatch) {
    const [, dd, mm, yyyy, h, mi, s] = euDtMatch;
    const date = `${yyyy}-${mm}-${dd}`;
    if (h && mi) return { date, timeUtc: `${h}:${mi}:${s || "00"}` };
    return { date };
  }

  // 3. DD_Mon_YY: 18_Feb_26
  const monMatch = name.match(/(\d{1,2})_(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)_(\d{2})/i);
  if (monMatch) {
    const months: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const d = monMatch[1].padStart(2, "0");
    const m = months[monMatch[2].toLowerCase()];
    const y = `20${monMatch[3]}`;
    if (m) return { date: `${y}-${m}-${d}` };
  }

  // 4. Short YYMMDDHHMM (10 digits)
  const shortMatch = name.match(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (shortMatch) {
    const [, yy, mo, dd, hh, mi] = shortMatch;
    const y = `20${yy}`;
    const testDate = new Date(`${y}-${mo}-${dd}`);
    if (!isNaN(testDate.getTime())) {
      return { date: `${y}-${mo}-${dd}`, timeUtc: `${hh}:${mi}:00` };
    }
  }

  // 5. Fallback: date-only from filename
  const dateOnly = parseDateFromFilename(filename);
  if (dateOnly) return { date: dateOnly };

  // 6. OS Timestamp Fallback: use File.lastModified when no date in filename
  if (fileLastModified) {
    const dt = new Date(fileLastModified);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const h = String(dt.getHours()).padStart(2, "0");
      const mi = String(dt.getMinutes()).padStart(2, "0");
      const s = String(dt.getSeconds()).padStart(2, "0");
      console.info(`[google] No date in filename "${filename}", falling back to OS timestamp: ${y}-${m}-${d} ${h}:${mi}:${s}`);
      return { date: `${y}-${m}-${d}`, timeUtc: `${h}:${mi}:${s}` };
    }
  }

  return null;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  attendees: string[];
  eventId?: string;
  eventUrl?: string;
  accepted?: boolean;
}

/** Query Google Calendar for events on a given date and find the best match.
 *  Returns null gracefully if offline, not configured, or no match found. */
export async function matchCalendarEvent(
  filename: string,
  date: string,
): Promise<CalendarEvent | null> {
  const calendarId = loadSetting("google_calendar_id", "primary");
  const timezone = loadSetting("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

  try {
    const res = await fetch(
      `${API_BASE}/google/calendar/events?calendarId=${encodeURIComponent(calendarId)}&date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(timezone)}`,
      { signal: AbortSignal.timeout(8000) },
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
      const words = (event.title || event.summary || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      let score = words.filter((w: string) => nameLower.includes(w)).length;
      // Prefer accepted events over tentative/declined
      if (event.accepted) score += 2;
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

/** Get all matching calendar events (for UI disambiguation when multiple matches) */
export async function getCalendarEvents(date: string): Promise<CalendarEvent[]> {
  const calendarId = loadSetting("google_calendar_id", "primary");
  const timezone = loadSetting("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

  try {
    const res = await fetch(
      `${API_BASE}/google/calendar/events?calendarId=${encodeURIComponent(calendarId)}&date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(timezone)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.events ?? [];
  } catch {
    return [];
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
