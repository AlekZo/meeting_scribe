import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { loadSetting as loadSettingDirect } from "@/lib/storage";
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
import { parseDateFromFilename, matchCalendarEvent, syncTranscriptToDoc } from "@/lib/google-integration";
import type { Meeting } from "@/data/meetings";

export interface QueuedFile {
  file: File;
  id: string;
  language: string;
  status: "queued" | "uploading" | "uploaded" | "transcribing" | "completed" | "error";
  jobId?: string;
  error?: string;
  progress?: number;
  uploadProgress?: number; // 0-100
  uploadedBytes?: number;
  uploadStartTime?: number; // Date.now() when upload started
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
        console.info(`[poll] Job ${jobId}: status=${status.status}`);

        if (status.status === "uploaded" || status.status === "pending" || status.status === "processing") {
          // All intermediate states — keep polling
          updateQueueItem(queueId, { status: "transcribing", progress: undefined });
        } else if (status.status === "completed") {
          clearInterval(interval);
          pollingRef.current.delete(queueId);

          try {
            const transcript = await getTranscript(jobId);
            const segments = convertSegments(transcript.segments);
            const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(fileName);
            let meetingTitle = fileName.replace(/\.[^.]+$/, "");
            const parsedDate = parseDateFromFilename(fileName);
            const meetingDate = parsedDate || new Date().toISOString().slice(0, 10);

            // Google Calendar matching
            const calMatch = loadSetting("google_cal_match", true);
            if (calMatch && parsedDate) {
              try {
                const event = await matchCalendarEvent(fileName, parsedDate);
                if (event) {
                  meetingTitle = event.title;
                  appendActivity({ type: "google", message: `Matched calendar event: "${meetingTitle}"` });
                  toast.info(`📅 Matched: ${meetingTitle}`);
                }
              } catch (err: any) {
                console.warn("[google] Calendar match error:", err);
              }
            }

            // Update existing meeting entry (created at upload time)
            const meetings = loadMeetings();
            const idx = meetings.findIndex((m) => String(m.id) === String(jobId));
            const updatedMeeting: Meeting = {
              id: jobId,
              title: meetingTitle,
              date: meetingDate,
              duration: transcript.duration
                ? `${Math.floor(transcript.duration / 60)}:${String(Math.floor(transcript.duration % 60)).padStart(2, "0")}`
                : "0:00",
              status: "completed",
              source: "Upload",
              mediaType: isVideo ? "video" : "audio",
              segments,
            };

            if (idx >= 0) {
              meetings[idx] = updatedMeeting;
            } else {
              meetings.unshift(updatedMeeting);
            }
            saveMeetings(meetings);
            saveTranscriptSegments(jobId, segments);
            onMeetingsChangedRef.current?.();

            updateQueueItem(queueId, { status: "completed" });
            appendActivity({ type: "transcription", message: `Transcription completed: ${meetingTitle} (${segments.length} segments)` });
            toast.success(`Transcription complete: ${meetingTitle}`);

            // Google Docs auto-sync
            const autoSync = loadSetting("google_auto_sync_docs", false);
            if (autoSync && segments.length > 0) {
              try {
                const docResult = await syncTranscriptToDoc(meetingTitle, segments);
                if (docResult) {
                  appendActivity({ type: "google", message: `Synced to Google Docs: ${docResult.url}` });
                  toast.success(`📄 Transcript synced to Google Docs`);
                }
              } catch (err: any) {
                console.warn("[google] Doc sync error:", err);
                appendActivity({ type: "error", message: `Google Docs sync failed: ${err.message}` });
              }
            }
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
        } else {
          // Unknown status — log and keep polling
          console.warn(`[poll] Job ${jobId}: unknown status "${status.status}", continuing to poll`);
        }
      } catch (err: any) {
        console.warn(`[poll] Error polling ${jobId}:`, err.message);
      }
    }, 10_000);

    pollingRef.current.set(queueId, interval);
  }, []);

  // Recovery: resume polling for any meetings stuck in "transcribing" status after restart
  const recoveryRanRef = useRef(false);
  useEffect(() => {
    if (recoveryRanRef.current) return;
    recoveryRanRef.current = true;

    const meetings = loadMeetings();
    const inProgress = meetings.filter((m) => m.status === "transcribing");
    if (inProgress.length === 0) return;

    console.info(`[recovery] Found ${inProgress.length} transcribing job(s), resuming polling…`);
    appendActivity({ type: "transcription", message: `Resuming ${inProgress.length} in-progress transcription(s) after restart` });

    for (const meeting of inProgress) {
      const recoveredItem: QueuedFile = {
        file: new File([], meeting.title || meeting.id),
        id: `recovery-${meeting.id}`,
        language: "auto",
        status: "transcribing",
        jobId: meeting.id,
      };
      setQueue((prev) => {
        if (prev.some((f) => f.jobId === meeting.id)) return prev;
        return [...prev, recoveredItem];
      });
      pollJob(`recovery-${meeting.id}`, meeting.id, meeting.title || meeting.id, "auto");
    }
  }, [pollJob]);

  const startTranscriptionFn = useCallback(async () => {
    const queued = queue.filter((f) => f.status === "queued");
    if (queued.length === 0) return;

    const autoTranscribe = loadSetting("auto_transcribe", true);
    setIsProcessing(true);

    for (const item of queued) {
      const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);

      updateQueueItem(item.id, { status: "uploading", uploadStartTime: Date.now(), uploadProgress: 0, uploadedBytes: 0 });
      appendActivity({ type: "upload", message: `Uploading ${item.file.name} (${formatSize(item.file.size)})` });

      try {
        const onProgress = (loaded: number, total: number) => {
          updateQueueItem(item.id, {
            uploadProgress: Math.round((loaded / total) * 100),
            uploadedBytes: loaded,
          });
        };
        const result = isVideo
          ? await uploadVideo(item.file, item.file.name.replace(/\.[^.]+$/, ""), onProgress)
          : await uploadAudio(item.file, item.file.name.replace(/\.[^.]+$/, ""), onProgress);

        const jobId = String(result.id);
        updateQueueItem(item.id, { status: "uploaded", jobId });
        appendActivity({ type: "upload", message: `Uploaded ${item.file.name} → job ${jobId}` });

        if (autoTranscribe) {
          try {
            // Create meeting entry immediately so it appears in the list
            const isVid = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);
            const whisperModel = loadSettingDirect("whisper_model", "large-v3");
            const whisperDevice = loadSettingDirect("whisper_device", "cuda");
            const pendingMeeting: Meeting = {
              id: jobId,
              title: item.file.name.replace(/\.[^.]+$/, ""),
              date: new Date().toISOString().slice(0, 10),
              duration: "0:00",
              status: "transcribing",
              source: "Upload",
              mediaType: isVid ? "video" : "audio",
              fileSize: item.file.size,
              transcribeStartTime: Date.now(),
              whisperModel,
              whisperDevice,
              segments: [],
            };
            const currentMeetings = loadMeetings();
            currentMeetings.unshift(pendingMeeting);
            saveMeetings(currentMeetings);
            onMeetingsChangedRef.current?.();

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
