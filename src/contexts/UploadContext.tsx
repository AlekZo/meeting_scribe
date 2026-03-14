import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { loadSetting as loadSettingDirect } from "@/lib/storage";
import { toast } from "sonner";
import {
  uploadAudio,
  uploadVideo,
  startTranscription,
  getTranscript,
  convertSegments,
  deleteScriberrJob,
} from "@/lib/scriberr";
import { notifyTranscriptionComplete, notifyTranscriptionError, notifyUploadStarted } from "@/lib/telegram";
import PollWorker from "@/workers/poll-worker?worker";
import { loadMeetings, saveMeetings, saveTranscriptSegments, loadSetting, appendActivity } from "@/lib/storage";
import { parseDateFromFilename, parseDateTimeFromFilename, matchCalendarEvent, syncTranscriptToDoc } from "@/lib/google-integration";
import type { CalendarEvent } from "@/lib/google-integration";
import type { Meeting } from "@/data/meetings";
import { isOnline } from "@/lib/storage";

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
  cancelJob: (meetingId: string) => Promise<void>;
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
  const pollingRef = useRef<Map<string, boolean>>(new Map()); // tracks active poll queue IDs
  const workerRef = useRef<Worker | null>(null);
  const onMeetingsChangedRef = useRef<(() => void) | undefined>();
  // Store job metadata for worker message handler
  const jobMetaRef = useRef<Map<string, { jobId: string; fileName: string; language: string }>>(new Map());

  // Initialize Web Worker for polling (immune to background tab throttling)
  useEffect(() => {
    const worker = new PollWorker();
    workerRef.current = worker;

    worker.onmessage = async (e) => {
      const msg = e.data;
      if (msg.type === "status") {
        const meta = jobMetaRef.current.get(msg.queueId);
        if (!meta) return;

        const status = msg.status;
        console.info(`[worker-poll] Job ${msg.jobId}: status=${status.status}`);

        if (status.status === "uploaded" || status.status === "pending" || status.status === "processing") {
          updateQueueItem(msg.queueId, { status: "transcribing", progress: undefined });
        } else if (status.status === "completed") {
          pollingRef.current.delete(msg.queueId);
          await handleJobCompleted(msg.queueId, msg.jobId, meta.fileName);
        } else if (status.status === "failed") {
          pollingRef.current.delete(msg.queueId);
          updateQueueItem(msg.queueId, { status: "error", error: status.error_message || "Transcription failed" });
          appendActivity({ type: "error", message: `Transcription failed: ${meta.fileName}` });
          notifyTranscriptionError(meta.fileName, status.error_message || "Unknown error");
          toast.error(`Transcription failed: ${meta.fileName}`);
          toast.error(`Transcription failed: ${meta.fileName}`);
        }
      } else if (msg.type === "network-error") {
        console.warn(`[worker-poll] Network error for ${msg.queueId}:`, msg.error);
        // Worker keeps polling — transient errors are OK
      }
    };

    return () => {
      worker.terminate();
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
    if (pollingRef.current.has(id)) {
      workerRef.current?.postMessage({ type: "stop", queueId: id });
      pollingRef.current.delete(id);
    }
    jobMetaRef.current.delete(id);
    setQueue((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /** Cancel a transcription job: stop polling, delete from Scriberr, update meeting status */
  const cancelJob = useCallback(async (meetingId: string) => {
    // Stop any active pollers for this meeting
    for (const [queueId, _] of pollingRef.current) {
      const meta = jobMetaRef.current.get(queueId);
      if (meta?.jobId === meetingId) {
        workerRef.current?.postMessage({ type: "stop", queueId });
        pollingRef.current.delete(queueId);
        jobMetaRef.current.delete(queueId);
      }
    }
    // Remove from queue UI
    setQueue((prev) => prev.filter((f) => f.jobId !== meetingId));

    // Delete from Scriberr server
    try {
      const deleted = await deleteScriberrJob(meetingId);
      if (deleted) {
        appendActivity({ type: "transcription", message: `Cancelled & deleted Scriberr job: ${meetingId}` });
      } else {
        console.warn(`[cancel] Scriberr delete returned false for ${meetingId}`);
      }
    } catch (err: any) {
      console.warn(`[cancel] Failed to delete Scriberr job ${meetingId}:`, err.message);
    }

    // Update local meeting status to "error" so user knows it was cancelled
    const meetings = loadMeetings();
    const idx = meetings.findIndex((m) => String(m.id) === String(meetingId));
    if (idx >= 0) {
      meetings[idx] = { ...meetings[idx], status: "error" };
      saveMeetings(meetings);
      onMeetingsChangedRef.current?.();
    }
  }, []);

  const setLanguage = useCallback((id: string, lang: string) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, language: lang } : f)));
  }, []);

  /** Get Scriberr connection config for the worker */
  const getWorkerConfig = useCallback(() => {
    const customUrl = loadSettingDirect<string>("scriberr_url", "");
    const protocol = loadSettingDirect<string>("scriberr_protocol", "http");
    const baseUrl = customUrl
      ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
      : "/scriberr";
    const apiKey = loadSettingDirect<string>("scriberr_api_key", "");
    const authMethod = loadSettingDirect<string>("scriberr_auth_method", "x-api-key");
    return { baseUrl, apiKey, authMethod };
  }, []);

  /** Handle completed transcription — fetch transcript, save meeting, sync */
  const handleJobCompleted = useCallback(async (queueId: string, jobId: string, fileName: string) => {
    try {
      const transcript = await getTranscript(jobId);
      const segments = convertSegments(transcript.segments);
      const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(fileName);
      const parsedDate = parseDateFromFilename(fileName);
      const meetingDate = parsedDate || new Date().toISOString().slice(0, 10);

      // Preserve calendar title if already set during calendar_sync stage
      const meetings = loadMeetings();
      const existingMeeting = meetings.find((m) => String(m.id) === String(jobId));
      const meetingTitle = existingMeeting?.title || transcript.title || fileName.replace(/\.[^.]+$/, "");

      const idx = meetings.findIndex((m) => String(m.id) === String(jobId));
      const updatedMeeting: Meeting = {
        ...(existingMeeting || {}), // Preserve calendar data, localMediaUrl, etc.
        id: jobId,
        title: meetingTitle,
        date: existingMeeting?.date || meetingDate,
        duration: transcript.duration
          ? `${Math.floor(transcript.duration / 60)}:${String(Math.floor(transcript.duration % 60)).padStart(2, "0")}`
          : "0:00",
        status: "completed",
        source: "Upload",
        mediaType: isVideo ? "video" : "audio",
        mediaSrc: existingMeeting?.localMediaUrl || existingMeeting?.mediaSrc,
        localMediaUrl: existingMeeting?.localMediaUrl,
        language: transcript.language,
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

      // Telegram notification
      notifyTranscriptionComplete(
        meetingTitle,
        segments.length,
        updatedMeeting.duration,
      );

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
  }, []);

  /** Start polling a job via the Web Worker */
  const pollJob = useCallback((queueId: string, jobId: string, fileName: string, language: string) => {
    jobMetaRef.current.set(queueId, { jobId, fileName, language });
    pollingRef.current.set(queueId, true);
    const { baseUrl, apiKey, authMethod } = getWorkerConfig();
    workerRef.current?.postMessage({
      type: "start",
      config: { jobId, queueId, baseUrl, apiKey, authMethod, intervalMs: 10_000 },
    });
  }, [getWorkerConfig]);

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

  // Re-attach polling when tab becomes visible again (handles laptop lid close, tab switch)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const meetings = loadMeetings();
        const transcribing = meetings.filter((m) => m.status === "transcribing");
        for (const meeting of transcribing) {
          const hasPoller = Array.from(pollingRef.current.keys()).some((key) => {
            const item = queue.find((f) => f.id === key);
            return item?.jobId === meeting.id;
          });
          if (!hasPoller) {
            const recoveryId = `visibility-${meeting.id}-${Date.now()}`;
            console.info(`[visibility] Re-attaching poller for job ${meeting.id}`);
            setQueue((prev) => {
              if (prev.some((f) => f.jobId === meeting.id)) return prev;
              return [...prev, {
                file: new File([], meeting.title || meeting.id),
                id: recoveryId,
                language: "auto",
                status: "transcribing" as const,
                jobId: meeting.id,
              }];
            });
            pollJob(recoveryId, meeting.id, meeting.title || meeting.id, "auto");
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [queue, pollJob]);

  const startTranscriptionFn = useCallback(async () => {
    const queued = queue.filter((f) => f.status === "queued");
    if (queued.length === 0) return;

    const autoTranscribe = loadSetting("auto_transcribe", true);
    setIsProcessing(true);

    // Process files sequentially to prevent GPU OOM from parallel WhisperX jobs.
    // Audio: /submit auto-starts transcription, so Scriberr queues internally.
    // Video: We call /start explicitly — wait for any active GPU job first.
    for (const item of queued) {
      const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);

      // ── STAGE: Calendar Sync (before upload) ──
      // Match filename timestamp to Google Calendar event for title + attendee hints.
      // Gracefully skips if offline, not configured, or no match found.
      let calendarTitle: string | undefined;
      let calendarAttendees: string[] | undefined;
      let calendarEventUrl: string | undefined;
      let calendarEventId: string | undefined;
      let meetingDate = new Date().toISOString().slice(0, 10);

      const calMatch = loadSetting("google_cal_match", true);
      if (calMatch && isOnline()) {
        try {
          const parsed = parseDateTimeFromFilename(item.file.name, item.file.lastModified);
          if (parsed) {
            meetingDate = parsed.date;
            const event = await matchCalendarEvent(item.file.name, parsed.date);
            if (event) {
              calendarTitle = event.title;
              calendarAttendees = event.attendees;
              calendarEventUrl = event.eventUrl;
              calendarEventId = event.eventId;
              appendActivity({ type: "google", message: `📅 Matched calendar: "${event.title}" (${event.attendees?.length || 0} attendees)` });
              toast.info(`📅 Matched: ${event.title}`);
            } else {
              console.info(`[calendar] No calendar match for ${item.file.name} on ${parsed.date}`);
            }
          }
        } catch (err: any) {
          console.warn("[calendar] Sync failed (continuing without):", err.message);
        }
      }

      const displayTitle = calendarTitle || item.file.name.replace(/\.[^.]+$/, "");

      updateQueueItem(item.id, { status: "uploading", uploadStartTime: Date.now(), uploadProgress: 0, uploadedBytes: 0 });
      appendActivity({ type: "upload", message: `Uploading ${item.file.name} (${formatSize(item.file.size)})` });
      notifyUploadStarted(item.file.name, (item.file.size / (1024 * 1024)).toFixed(1));

      try {
        // ── STAGE 1: Save media permanently to local server ──
        let localMediaUrl: string | undefined;
        try {
          const mediaFormData = new FormData();
          mediaFormData.append("file", item.file, item.file.name);
          const mediaRes = await fetch("/api/media/upload", { method: "POST", body: mediaFormData });
          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            localMediaUrl = mediaData.url;
            appendActivity({ type: "upload", message: `Media saved locally: ${mediaData.filename}` });
          } else {
            console.warn("[upload] Local media save failed, continuing with Scriberr-only");
          }
        } catch (localErr: any) {
          console.warn("[upload] Local media save error (continuing):", localErr.message);
        }

        // ── STAGE 2: Upload to Scriberr for transcription ──
        const onProgress = (loaded: number, total: number) => {
          updateQueueItem(item.id, {
            uploadProgress: Math.round((loaded / total) * 100),
            uploadedBytes: loaded,
          });
        };

        // Upload with retry (up to 3 attempts for network resilience)
        let result;
        const MAX_UPLOAD_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
          try {
            result = isVideo
              ? await uploadVideo(item.file, displayTitle, onProgress)
              : await uploadAudio(item.file, displayTitle, onProgress);
            break;
          } catch (uploadErr: any) {
            if (attempt === MAX_UPLOAD_RETRIES) throw uploadErr;
            console.warn(`[upload] Attempt ${attempt}/${MAX_UPLOAD_RETRIES} failed for ${item.file.name}: ${uploadErr.message}. Retrying in 5s…`);
            appendActivity({ type: "upload", message: `Upload retry ${attempt}/${MAX_UPLOAD_RETRIES} for ${item.file.name}` });
            updateQueueItem(item.id, { uploadProgress: 0, uploadedBytes: 0 });
            await new Promise((r) => setTimeout(r, 5000));
          }
        }

        const jobId = String(result!.id);
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
              title: displayTitle,
              date: meetingDate,
              duration: "0:00",
              status: "transcribing",
              source: "Upload",
              mediaType: isVid ? "video" : "audio",
              mediaSrc: localMediaUrl || undefined,
              localMediaUrl: localMediaUrl || undefined,
              fileSize: item.file.size,
              transcribeStartTime: Date.now(),
              whisperModel,
              whisperDevice,
              calendarAttendees,
              calendarEventUrl,
              calendarEventId,
              segments: [],
            };
            const currentMeetings = loadMeetings();
            currentMeetings.unshift(pendingMeeting);
            saveMeetings(currentMeetings);
            onMeetingsChangedRef.current?.();

            // Audio uploaded via /submit auto-starts transcription in Scriberr.
            // Only call /start for video uploads which use /upload-video.
            if (isVideo) {
              try {
                await startTranscription(jobId, { language: item.language });
                appendActivity({ type: "transcription", message: `Transcription started: ${item.file.name}` });
                toast.info(`Transcription started: ${item.file.name}`);
              } catch (err: any) {
                const isAlreadyRunning = err.message?.includes("currently processing or pending");
                if (isAlreadyRunning) {
                  console.info(`[upload] Job ${jobId} already processing, skipping start call`);
                } else {
                  updateQueueItem(item.id, { status: "error", error: err.message });
                  appendActivity({ type: "error", message: `Failed to start transcription for ${item.file.name}: ${err.message}` });
                  toast.error(`Failed to start: ${err.message}`);
                  continue;
                }
              }
            } else {
              // Audio: /submit already started transcription, go straight to polling
              console.info(`[upload] Audio job ${jobId} auto-started via /submit, skipping /start`);
              appendActivity({ type: "transcription", message: `Transcription auto-started: ${item.file.name}` });
              toast.info(`Transcription started: ${item.file.name}`);
            }

            updateQueueItem(item.id, { status: "transcribing" });
            pollJob(item.id, jobId, item.file.name, item.language);
          } catch (startErr: any) {
            updateQueueItem(item.id, { status: "error", error: startErr.message });
            appendActivity({ type: "error", message: `Transcription setup failed for ${item.file.name}: ${startErr.message}` });
            toast.error(`Failed: ${startErr.message}`);
          }
        } else {
          const meeting: Meeting = {
            id: jobId,
            title: displayTitle,
            date: meetingDate,
            duration: "0:00",
            status: "pending",
            source: "Upload",
            mediaType: isVideo ? "video" : "audio",
            mediaSrc: localMediaUrl || undefined,
            localMediaUrl: localMediaUrl || undefined,
            fileSize: item.file.size,
            calendarAttendees,
            calendarEventUrl,
            calendarEventId,
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
        cancelJob,
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
