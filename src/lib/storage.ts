// Offline-first localStorage persistence layer

import type { Meeting } from "@/data/meetings";
import type { TranscriptSegment } from "@/components/MeetingPlayer";

const STORAGE_PREFIX = "meetscribe_";

export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveSetting<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn("Storage quota exceeded or write failed:", e);
  }
}

// Per-meeting overrides (title, calendarUrl, segments)
export function loadMeetingOverrides(meetingId: string): Record<string, any> {
  return loadSetting(`meeting_override_${meetingId}`, {});
}

export function saveMeetingOverride(meetingId: string, key: string, value: any): void {
  const overrides = loadMeetingOverrides(meetingId);
  overrides[key] = value;
  saveSetting(`meeting_override_${meetingId}`, overrides);
}

export function loadMeetings(): Meeting[] {
  return loadSetting<Meeting[]>("meetings", []);
}

export function saveMeetings(meetings: Meeting[]): void {
  saveSetting("meetings", meetings);
}

export function loadTranscriptSegments(meetingId: string): TranscriptSegment[] | null {
  const all = loadSetting<Record<string, TranscriptSegment[]>>("transcripts", {});
  return all[meetingId] ?? null;
}

export function saveTranscriptSegments(meetingId: string, segments: TranscriptSegment[]): void {
  const all = loadSetting<Record<string, TranscriptSegment[]>>("transcripts", {});
  all[meetingId] = segments;
  saveSetting("transcripts", all);
}

export function loadActivityLog(): any[] {
  return loadSetting("activity_log", []);
}

export function appendActivity(entry: { type: string; message: string; timestamp?: string }): void {
  const raw = loadActivityLog();
  const log = Array.isArray(raw) ? raw : [];
  log.unshift({ ...entry, timestamp: entry.timestamp || new Date().toISOString() });
  // Keep last 500 entries
  if (log.length > 500) log.length = 500;
  saveSetting("activity_log", log);
}

export function isOnline(): boolean {
  return navigator.onLine;
}
