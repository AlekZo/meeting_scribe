import { useState, useEffect, useRef, useCallback } from "react";
import { loadSetting, saveSetting, appendActivity } from "@/lib/storage";

const MEDIA_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|mp3|wav|ogg|m4a|flac)$/i;
const POLL_INTERVAL = 5000; // 5 seconds

export interface DetectedFile {
  name: string;
  size: number;
  lastModified: number;
  handle: FileSystemFileHandle;
}

export function useFolderWatcher() {
  const [watching, setWatching] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(
    loadSetting<string | null>("watch_folder_name", null)
  );
  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [knownFiles, setKnownFiles] = useState<Set<string>>(
    new Set(loadSetting<string[]>("watch_known_files", []))
  );
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scanFolder = useCallback(async () => {
    const dirHandle = dirHandleRef.current;
    if (!dirHandle) return;

    try {
      // File System Access API permission check (Chrome/Edge)
      const dirAny = dirHandle as any;
      const perm = await dirAny.queryPermission({ mode: "read" });
      if (perm !== "granted") {
        console.warn("Folder permission lost; stopping watcher.");
        if (mountedRef.current) setWatching(false);
        return;
      }

      const newFiles: DetectedFile[] = [];
      const diskFileNames = new Set<string>();

      for await (const entry of dirHandle.values()) {
        if (!mountedRef.current) return; // Abort if unmounted
        if (entry.kind !== "file") continue;
        diskFileNames.add(entry.name);
        if (!MEDIA_EXTENSIONS.test(entry.name)) continue;

        // Skip getFile() for files already known — avoids O(N) disk I/O
        const knownByName = Array.from(knownFiles).some((k) => k.startsWith(entry.name + "|"));
        if (knownByName) continue;

        try {
          const file = await entry.getFile();
          // Skip files being written (modified in last 3 seconds)
          const age = Date.now() - file.lastModified;
          if (age < 3000) continue;

          const key = `${entry.name}|${file.size}`;
          if (!knownFiles.has(key)) {
            newFiles.push({
              name: entry.name,
              size: file.size,
              lastModified: file.lastModified,
              handle: entry,
            });
          }
        } catch (fileErr) {
          // File was deleted/renamed between iteration and getFile() — skip it
          console.warn(`Skipping inaccessible file "${entry.name}":`, fileErr);
        }
      }

      if (!mountedRef.current) return; // Abort if unmounted during iteration

      setDetectedFiles((prev) => {
        // Remove entries that no longer exist on disk
        let updated = prev.filter((f) => diskFileNames.has(f.name));
        // Update existing or append new files
        for (const nf of newFiles) {
          const existingIdx = updated.findIndex((f) => f.name === nf.name);
          if (existingIdx >= 0) {
            updated[existingIdx] = nf;
          } else {
            updated.push(nf);
          }
        }
        return updated;
      });
    } catch (err) {
      console.error("Folder scan error:", err);
    }
  }, [knownFiles]);

  const pickFolder = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      dirHandleRef.current = dirHandle;
      setFolderName(dirHandle.name);
      saveSetting("watch_folder_name", dirHandle.name);
      setDetectedFiles([]);
      setWatching(true);
      appendActivity({ type: "folder_watch", message: `Started watching folder: ${dirHandle.name}` });
      scanFolder();
    } catch {
      // User cancelled
    }
  };

  const markProcessed = (file: DetectedFile) => {
    const key = `${file.name}|${file.size}`;
    setKnownFiles((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveSetting("watch_known_files", Array.from(next));
      return next;
    });
    setDetectedFiles((prev) => prev.filter((f) => f.name !== file.name));
  };

  const dismissFile = (fileName: string) => {
    setDetectedFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const stopWatching = () => {
    setWatching(false);
    dirHandleRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const clearHistory = () => {
    setKnownFiles(new Set());
    setDetectedFiles([]);
    saveSetting("watch_known_files", []);
  };

  // Polling loop
  useEffect(() => {
    if (watching) {
      intervalRef.current = setInterval(scanFolder, POLL_INTERVAL);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [watching, scanFolder]);

  return {
    watching,
    folderName,
    detectedFiles,
    knownFilesCount: knownFiles.size,
    pickFolder,
    stopWatching,
    markProcessed,
    dismissFile,
    clearHistory,
  };
}
