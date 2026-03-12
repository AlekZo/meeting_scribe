// Offline-first localStorage persistence layer

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
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

export function loadMeetings(): any[] {
  return loadSetting("meetings", []);
}

export function saveMeetings(meetings: any[]): void {
  saveSetting("meetings", meetings);
}

export function loadTranscripts(): Record<string, any> {
  return loadSetting("transcripts", {});
}

export function saveTranscript(meetingId: string, transcript: any): void {
  const all = loadTranscripts();
  all[meetingId] = transcript;
  saveSetting("transcripts", all);
}

export function loadActivityLog(): any[] {
  return loadSetting("activity_log", []);
}

export function appendActivity(entry: { type: string; message: string; timestamp?: string }): void {
  const log = loadActivityLog();
  log.unshift({ ...entry, timestamp: entry.timestamp || new Date().toISOString() });
  // Keep last 500 entries
  if (log.length > 500) log.length = 500;
  saveSetting("activity_log", log);
}

export function isOnline(): boolean {
  return navigator.onLine;
}
