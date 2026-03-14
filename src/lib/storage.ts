// Hybrid storage layer: localStorage for speed + server SQLite for persistence
// On load: fetch all from server → merge into localStorage
// On write: localStorage (immediate) + async POST to server
// Emits sync status events for UI indicator

import type { Meeting } from "@/data/meetings";
import type { TranscriptSegment } from "@/components/MeetingPlayer";
import { emitSyncStatus } from "@/components/SyncStatus";

const STORAGE_PREFIX = "meetscribe_";

// ── Server sync helpers ──

const API_BASE = "/api";

let serverAvailable: boolean | null = null;
let syncInitialized = false;
const pendingWrites = new Map<string, { timeout: ReturnType<typeof setTimeout>; value: string }>();

async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

/** Flush a single pending write immediately */
function flushWrite(key: string, value: string): void {
  try {
    navigator.sendBeacon(
      `${API_BASE}/store/${encodeURIComponent(key)}`,
      new Blob([JSON.stringify({ value })], { type: "application/json" })
    );
  } catch {
    // Best-effort
  }
}

/** Push a key to the server (debounced per key, with max delay guarantee) */
function syncToServer(key: string, value: string): void {
  if (serverAvailable === false) {
    emitSyncStatus("offline");
    return;
  }

  // Clear existing timeout for this key
  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing.timeout);

  emitSyncStatus("syncing");

  const timeout = setTimeout(async () => {
    pendingWrites.delete(key);
    try {
      await fetch(`${API_BASE}/store/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (pendingWrites.size === 0) {
        emitSyncStatus("saved");
      }
    } catch (err) {
      console.warn(`[storage] Failed to sync key "${key}" to server:`, err);
      emitSyncStatus("error", `Failed to sync: ${(err as Error).message}`);
    }
  }, 300);

  pendingWrites.set(key, { timeout, value });
}

/** Flush all pending writes on page unload */
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    pendingWrites.forEach(({ timeout, value }, key) => {
      clearTimeout(timeout);
      flushWrite(key, value);
    });
    pendingWrites.clear();
  });
}

/** Sync data from server into localStorage (server wins on conflicts via updated_at).
 *  Pass force=true to re-sync even if already initialized (e.g. on page navigation). */
export async function initServerSync(force = false): Promise<void> {
  if (syncInitialized && !force) return;

  const available = await checkServer();
  if (!available) {
    console.info("[storage] Server not available — using localStorage only");
    return;
  }

  syncInitialized = true;

  try {
    const res = await fetch(`${API_BASE}/store`);
    if (!res.ok) return;
    const data: Record<string, { value: string; updated_at: string }> = await res.json();
    let merged = 0;

    for (const [key, entry] of Object.entries(data)) {
      // Support both old format (plain string) and new format ({value, updated_at})
      const serverValue = typeof entry === "string" ? entry : entry.value;
      const serverTime = typeof entry === "object" && entry.updated_at ? entry.updated_at : null;

      const existing = localStorage.getItem(key);
      const localTime = localStorage.getItem(`${key}__ts`);

      if (!existing) {
        // Server has data that localStorage doesn't — pull it in
        localStorage.setItem(key, serverValue);
        if (serverTime) localStorage.setItem(`${key}__ts`, serverTime);
        merged++;
      } else if (serverTime && (!localTime || serverTime > localTime)) {
        // Server data is newer — overwrite local
        localStorage.setItem(key, serverValue);
        localStorage.setItem(`${key}__ts`, serverTime);
        merged++;
      }
      // If local is newer or no timestamps, local wins (offline changes)
    }

    // Push any localStorage keys the server doesn't have
    const serverKeys = new Set(Object.keys(data));
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && !key.endsWith("__ts") && !serverKeys.has(key)) {
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
    localStorage.setItem(`${fullKey}__ts`, new Date().toISOString());
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

export function deleteMeeting(meetingId: string): void {
  const meetings = loadMeetings().filter((m) => m.id !== meetingId);
  saveMeetings(meetings);
  // Clean up related data
  try {
    const txKey = STORAGE_PREFIX + `transcript_${meetingId}`;
    localStorage.removeItem(txKey);
    localStorage.removeItem(`${txKey}__ts`);
    const ovKey = STORAGE_PREFIX + `meeting_override_${meetingId}`;
    localStorage.removeItem(ovKey);
    localStorage.removeItem(`${ovKey}__ts`);
  } catch {}
}

export function loadTranscriptSegments(meetingId: string): TranscriptSegment[] | null {
  // Try new per-meeting key first, fall back to legacy shared key
  const perKey = loadSetting<TranscriptSegment[] | null>(`transcript_${meetingId}`, null);
  if (perKey) return perKey;
  // Legacy: check the old shared "transcripts" dictionary
  const all = loadSetting<Record<string, TranscriptSegment[]>>("transcripts", {});
  return all[meetingId] ?? null;
}

export function saveTranscriptSegments(meetingId: string, segments: TranscriptSegment[]): void {
  // Store under individual key to avoid 5MB localStorage limit
  saveSetting(`transcript_${meetingId}`, segments);
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

    // Clear existing meetscribe_ keys before restoring to avoid merge artifacts
    const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    keysToRemove.forEach(k => localStorage.removeItem(k));

    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(key, value as string);
      count++;
    }
    // Force reload so React picks up new localStorage data
    setTimeout(() => window.location.reload(), 500);
    return { restoredKeys: count };
  }

  // Server restore — upload zip
  const formData = new FormData();
  formData.append("backup", file);
  const res = await fetch(`${API_BASE}/restore`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Restore failed");
  const result = await res.json();

  // Re-sync from server to localStorage, then reload to pick up changes
  syncInitialized = false;
  await initServerSync();

  // Force reload so React state reflects restored data
  setTimeout(() => window.location.reload(), 500);

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
