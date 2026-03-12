// Hybrid storage layer: localStorage for speed + server SQLite for persistence
// On load: fetch all from server → merge into localStorage
// On write: localStorage (immediate) + async POST to server

import type { Meeting } from "@/data/meetings";
import type { TranscriptSegment } from "@/components/MeetingPlayer";

const STORAGE_PREFIX = "meetscribe_";

// ── Server sync helpers ──

const API_BASE = "/api";

let serverAvailable: boolean | null = null;
let syncInitialized = false;
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

/** Push a key to the server (debounced per key) */
function syncToServer(key: string, value: string): void {
  if (serverAvailable === false) return;

  // Debounce: batch rapid writes to the same key
  if (pendingWrites.has(key)) clearTimeout(pendingWrites.get(key)!);
  pendingWrites.set(
    key,
    setTimeout(async () => {
      pendingWrites.delete(key);
      try {
        await fetch(`${API_BASE}/store/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
      } catch (err) {
        console.warn(`[storage] Failed to sync key "${key}" to server:`, err);
      }
    }, 300)
  );
}

/** Initial sync: pull all data from server into localStorage */
export async function initServerSync(): Promise<void> {
  if (syncInitialized) return;
  syncInitialized = true;

  const available = await checkServer();
  if (!available) {
    console.info("[storage] Server not available — using localStorage only");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/store`);
    if (!res.ok) return;
    const data: Record<string, string> = await res.json();
    let merged = 0;

    for (const [key, value] of Object.entries(data)) {
      const existing = localStorage.getItem(key);
      if (!existing) {
        // Server has data that localStorage doesn't — pull it in
        localStorage.setItem(key, value);
        merged++;
      }
      // If both have data, localStorage wins (user may have made offline changes)
      // But if localStorage has data the server doesn't, push it up
    }

    // Push any localStorage keys the server doesn't have
    const serverKeys = new Set(Object.keys(data));
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && !serverKeys.has(key)) {
        const value = localStorage.getItem(key);
        if (value) syncToServer(key, value);
      }
    }

    console.info(`[storage] Server sync complete. Merged ${merged} keys from server.`);
  } catch (err) {
    console.warn("[storage] Initial sync failed:", err);
  }
}

// ── Public API (same interface as before) ──

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
  const fullKey = STORAGE_PREFIX + key;
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(fullKey, serialized);
    syncToServer(fullKey, serialized);
  } catch (e) {
    console.warn("Storage write failed:", e);
  }
}

// Per-meeting overrides
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
  if (log.length > 500) log.length = 500;
  saveSetting("activity_log", log);
}

export function isOnline(): boolean {
  return navigator.onLine;
}

// ── Backup/Restore helpers (called from UI) ──

export async function downloadBackup(): Promise<void> {
  const available = await checkServer();
  if (!available) {
    // Fallback: export localStorage as JSON
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        data[key] = localStorage.getItem(key) || "";
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meetscribe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // Server backup — download zip
  const res = await fetch(`${API_BASE}/backup`);
  if (!res.ok) throw new Error("Backup download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] || `meetscribe-backup.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadRestore(file: File): Promise<{ restoredKeys: number }> {
  const available = await checkServer();

  if (!available) {
    // Fallback: import JSON into localStorage
    const text = await file.text();
    const data = JSON.parse(text);
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(key, value as string);
      count++;
    }
    return { restoredKeys: count };
  }

  // Server restore — upload zip
  const formData = new FormData();
  formData.append("backup", file);
  const res = await fetch(`${API_BASE}/restore`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Restore failed");
  const result = await res.json();

  // Re-sync from server to localStorage
  syncInitialized = false;
  await initServerSync();

  return result;
}

export async function getServerInfo(): Promise<{ available: boolean; dbSize?: number; version?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/info`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { available: false };
    const data = await res.json();
    return { available: true, dbSize: data.dbSize, version: data.version };
  } catch {
    return { available: false };
  }
}
