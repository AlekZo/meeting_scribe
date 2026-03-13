import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import {
  uploadAudio,
  uploadVideo,
  startWithOomRetry,
  getTranscriptionStatus,
  getTranscript,
  convertSegments,
  getAudioUrl,
} from "@/lib/scriberr";
import { loadMeetings, saveMeetings, saveTranscriptSegments, loadSetting, appendActivity } from "@/lib/storage";
import type { Meeting } from "@/data/meetings";

export interface QueuedFile {
  file: File;
  id: string;
  language: string;
  status: "queued" | "uploading" | "uploaded" | "transcribing" | "completed" | "error";
  jobId?: string;
  error?: string;
  progress?: number;
}

export const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "ru", label: "Russian" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "uk", label: "Ukrainian" },
  { code: "he", label: "Hebrew" },
];

export function detectLanguageFromName(filename: string): string {
  const name = filename.replace(/\.[^.]+$/, "").replace(/[_\-.\d]/g, " ");
  const letters = name.replace(/[^a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ\u3000-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\u0900-\u097F\u0590-\u05FF]/g, "");
  if (!letters) return "auto";

  const cyrillic = (letters.match(/[а-яА-ЯёЁіІїЇєЄґҐ]/g) || []).length;
  const latin = (letters.match(/[a-zA-Z]/g) || []).length;
  const cjk = (letters.match(/[\u3000-\u9FFF]/g) || []).length;
  const korean = (letters.match(/[\uAC00-\uD7AF]/g) || []).length;
  const arabic = (letters.match(/[\u0600-\u06FF]/g) || []).length;
  const devanagari = (letters.match(/[\u0900-\u097F]/g) || []).length;
  const hebrew = (letters.match(/[\u0590-\u05FF]/g) || []).length;

  const counts = [
    { lang: "ru", count: cyrillic },
    { lang: "en", count: latin },
    { lang: "ja", count: cjk },
    { lang: "ko", count: korean },
    { lang: "ar", count: arabic },
    { lang: "hi", count: devanagari },
    { lang: "he", count: hebrew },
  ];

  const best = counts.reduce((a, b) => (b.count > a.count ? b : a));
  return best.count > 0 ? best.lang : "auto";
}

interface UploadContextValue {
  queue: QueuedFile[];
  isProcessing: boolean;
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  setLanguage: (id: string, lang: string) => void;
  startTranscription: () => Promise<void>;
  activeCount: number;
  queuedCount: number;
  onMeetingsChanged?: () => void;
  setOnMeetingsChanged: (cb: (() => void) | undefined) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within UploadProvider");
  return ctx;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const onMeetingsChangedRef = useRef<(() => void) | undefined>();

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  const updateQueueItem = (id: string, updates: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const addFiles = useCallback((files: File[]) => {
    const mediaFiles = files.filter((f) =>
      /\.(mp4|mkv|avi|mov|webm|mp3|wav|ogg|m4a|flac)$/i.test(f.name)
    );
    setQueue((prev) => [
      ...prev,
      ...mediaFiles.map((file) => ({
        file,
        id: crypto.randomUUID(),
        language: detectLanguageFromName(file.name),
        status: "queued" as const,
      })),
    ]);
  }, []);

  const removeFile = useCallback((id: string) => {
    const interval = pollingRef.current.get(id);
    if (interval) {
      clearInterval(interval);
      pollingRef.current.delete(id);
    }
    setQueue((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const setLanguage = useCallback((id: string, lang: string) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, language: lang } : f)));
  }, []);

  const pollJob = useCallback((queueId: string, jobId: string, fileName: string, language: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await getTranscriptionStatus(jobId);

        if (status.status === "processing") {
          updateQueueItem(queueId, { status: "transcribing", progress: undefined });
        } else if (status.status === "completed") {
          clearInterval(interval);
          pollingRef.current.delete(queueId);

          try {
            const transcript = await getTranscript(jobId);
            const segments = convertSegments(transcript.segments);
            const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(fileName);
            const meeting: Meeting = {
              id: jobId,
              title: fileName.replace(/\.[^.]+$/, ""),
              date: new Date().toISOString().slice(0, 10),
              duration: transcript.duration
                ? `${Math.floor(transcript.duration / 60)}:${String(Math.floor(transcript.duration % 60)).padStart(2, "0")}`
                : "0:00",
              status: "completed",
              source: "Upload",
              mediaType: isVideo ? "video" : "audio",
              segments,
            };

            const meetings = loadMeetings();
            meetings.unshift(meeting);
            saveMeetings(meetings);
            saveTranscriptSegments(jobId, segments);
            onMeetingsChangedRef.current?.();

            updateQueueItem(queueId, { status: "completed" });
            appendActivity({ type: "transcription", message: `Transcription completed: ${fileName} (${segments.length} segments)` });
            toast.success(`Transcription complete: ${fileName}`);
          } catch (err: any) {
            updateQueueItem(queueId, { status: "error", error: err.message });
            appendActivity({ type: "error", message: `Failed to fetch transcript for ${fileName}: ${err.message}` });
          }
        } else if (status.status === "failed") {
          clearInterval(interval);
          pollingRef.current.delete(queueId);
          updateQueueItem(queueId, { status: "error", error: "Transcription failed" });
          appendActivity({ type: "error", message: `Transcription failed: ${fileName}` });
          toast.error(`Transcription failed: ${fileName}`);
        }
      } catch (err: any) {
        console.warn(`Poll error for ${jobId}:`, err.message);
      }
    }, 10_000);

    pollingRef.current.set(queueId, interval);
  }, []);

  const startTranscriptionFn = useCallback(async () => {
    const queued = queue.filter((f) => f.status === "queued");
    if (queued.length === 0) return;

    const autoTranscribe = loadSetting("auto_transcribe", true);
    setIsProcessing(true);

    for (const item of queued) {
      const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);

      updateQueueItem(item.id, { status: "uploading" });
      appendActivity({ type: "upload", message: `Uploading ${item.file.name} (${formatSize(item.file.size)})` });

      try {
        const result = isVideo
          ? await uploadVideo(item.file, item.file.name.replace(/\.[^.]+$/, ""))
          : await uploadAudio(item.file, item.file.name.replace(/\.[^.]+$/, ""));

        const jobId = result.id;
        updateQueueItem(item.id, { status: "uploaded", jobId });
        appendActivity({ type: "upload", message: `Uploaded ${item.file.name} → job ${jobId}` });

        if (autoTranscribe) {
          try {
            await startWithOomRetry(jobId, { language: item.language });
            updateQueueItem(item.id, { status: "transcribing" });
            appendActivity({ type: "transcription", message: `Transcription started: ${item.file.name}` });
            toast.info(`Transcription started: ${item.file.name}`);
            pollJob(item.id, jobId, item.file.name, item.language);
          } catch (err: any) {
            updateQueueItem(item.id, { status: "error", error: err.message });
            appendActivity({ type: "error", message: `Failed to start transcription for ${item.file.name}: ${err.message}` });
            toast.error(`Failed to start: ${err.message}`);
          }
        } else {
          const meeting: Meeting = {
            id: jobId,
            title: item.file.name.replace(/\.[^.]+$/, ""),
            date: new Date().toISOString().slice(0, 10),
            duration: "0:00",
            status: "pending",
            source: "Upload",
            mediaType: isVideo ? "video" : "audio",
            fileSize: item.file.size,
            segments: [],
          };
          const meetings = loadMeetings();
          meetings.unshift(meeting);
          saveMeetings(meetings);
          onMeetingsChangedRef.current?.();
          toast.success(`Uploaded: ${item.file.name} (transcription not started)`);
        }
      } catch (err: any) {
        updateQueueItem(item.id, { status: "error", error: err.message });
        appendActivity({ type: "error", message: `Upload failed for ${item.file.name}: ${err.message}` });
        toast.error(`Upload failed: ${err.message}`);
      }
    }

    setIsProcessing(false);
  }, [queue, pollJob]);

  const activeCount = queue.filter((f) => ["uploading", "uploaded", "transcribing"].includes(f.status)).length;
  const queuedCount = queue.filter((f) => f.status === "queued").length;

  return (
    <UploadContext.Provider
      value={{
        queue,
        isProcessing,
        addFiles,
        removeFile,
        setLanguage,
        startTranscription: startTranscriptionFn,
        activeCount,
        queuedCount,
        onMeetingsChanged: onMeetingsChangedRef.current,
        setOnMeetingsChanged: (cb) => { onMeetingsChangedRef.current = cb; },
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}
