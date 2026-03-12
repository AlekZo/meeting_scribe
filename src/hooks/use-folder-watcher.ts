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

  const scanFolder = useCallback(async () => {
    const dirHandle = dirHandleRef.current;
    if (!dirHandle) return;

    try {
      // File System Access API permission check (Chrome/Edge)
      const dirAny = dirHandle as any;
      const perm = await dirAny.queryPermission({ mode: "read" });
      if (perm !== "granted") {
        const req = await dirAny.requestPermission({ mode: "read" });
        if (req !== "granted") {
          setWatching(false);
          return;
        }
      }

      const newFiles: DetectedFile[] = [];
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== "file") continue;
        if (!MEDIA_EXTENSIONS.test(entry.name)) continue;

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
      }

      if (newFiles.length > 0) {
        setDetectedFiles((prev) => {
          const existingNames = new Set(prev.map((f) => f.name));
          const truly = newFiles.filter((f) => !existingNames.has(f.name));
          return [...prev, ...truly];
        });
      }
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
