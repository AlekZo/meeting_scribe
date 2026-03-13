import { useState, useCallback, useEffect, useRef } from "react";
import { FileAudio, Calendar, FileText, Activity, DollarSign, Zap, Upload, FileVideo, X, Globe, HardDrive, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { MeetingRow } from "@/components/MeetingRow";
import { Button } from "@/components/ui/button";
import { loadMeetings, saveMeetings, saveTranscriptSegments, loadSetting, appendActivity } from "@/lib/storage";
import { getTotalUsage } from "@/lib/openrouter";
import { cn } from "@/lib/utils";
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
import type { Meeting } from "@/data/meetings";

interface QueuedFile {
  file: File;
  id: string;
  language: string;
  status: "queued" | "uploading" | "uploaded" | "transcribing" | "completed" | "error";
  jobId?: string;
  error?: string;
  progress?: number;
}

const LANGUAGES = [
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

function detectLanguageFromName(filename: string): string {
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

export default function Dashboard() {
  const [allMeetings, setAllMeetings] = useState<Meeting[]>(() => loadMeetings());
  const recentMeetings = allMeetings.slice(0, 5);
  const usage = getTotalUsage();
  const totalBytes = allMeetings.reduce((sum, m) => sum + (m.fileSize || 0), 0);
  const formatTotalSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  const updateQueueItem = (id: string, updates: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(mp4|mkv|avi|mov|webm|mp3|wav|ogg|m4a|flac)$/i.test(f.name)
    );
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        id: crypto.randomUUID(),
        language: detectLanguageFromName(file.name),
        status: "queued" as const,
      })),
    ]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        id: crypto.randomUUID(),
        language: detectLanguageFromName(file.name),
        status: "queued" as const,
      })),
    ]);
  };

  const removeFile = (id: string) => {
    // Stop polling if active
    const interval = pollingRef.current.get(id);
    if (interval) {
      clearInterval(interval);
      pollingRef.current.delete(id);
    }
    setQueue((prev) => prev.filter((f) => f.id !== id));
  };

  const setLanguage = (id: string, lang: string) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, language: lang } : f)));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /** Poll for transcription completion */
  const pollJob = (queueId: string, jobId: string, fileName: string, language: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await getTranscriptionStatus(jobId);

        if (status.status === "processing") {
          updateQueueItem(queueId, {
            status: "transcribing",
            progress: undefined,
          });
        } else if (status.status === "completed") {
          clearInterval(interval);
          pollingRef.current.delete(queueId);

          // Fetch transcript
          try {
            const transcript = await getTranscript(jobId);
            const segments = convertSegments(transcript.segments);

            // Create meeting record
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

            // Save to storage
            const meetings = loadMeetings();
            meetings.unshift(meeting);
            saveMeetings(meetings);
            saveTranscriptSegments(jobId, segments);
            setAllMeetings(loadMeetings());

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
        // Don't stop polling on transient errors
        console.warn(`Poll error for ${jobId}:`, err.message);
      }
    }, 10_000); // Poll every 10 seconds

    pollingRef.current.set(queueId, interval);
  };

  /** Process all queued files */
  const handleStartTranscription = async () => {
    const queued = queue.filter((f) => f.status === "queued");
    if (queued.length === 0) return;

    const autoTranscribe = loadSetting("auto_transcribe", true);
    const diarization = loadSetting("whisper_diarization", true);
    setIsProcessing(true);

    for (const item of queued) {
      const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);

      // Step 1: Upload
      updateQueueItem(item.id, { status: "uploading" });
      appendActivity({ type: "upload", message: `Uploading ${item.file.name} (${formatSize(item.file.size)})` });

      try {
        const result = isVideo
          ? await uploadVideo(item.file, item.file.name.replace(/\.[^.]+$/, ""))
          : await uploadAudio(item.file, item.file.name.replace(/\.[^.]+$/, ""));

        const jobId = result.id;
        updateQueueItem(item.id, { status: "uploaded", jobId });
        appendActivity({ type: "upload", message: `Uploaded ${item.file.name} → job ${jobId}` });

        // Step 2: Start transcription (if auto-transcribe is on)
        if (autoTranscribe) {
          try {
            await startWithOomRetry(jobId, { language: item.language });
            updateQueueItem(item.id, { status: "transcribing" });
            appendActivity({ type: "transcription", message: `Transcription started: ${item.file.name}` });
            toast.info(`Transcription started: ${item.file.name}`);

            // Step 3: Poll for completion
            pollJob(item.id, jobId, item.file.name, item.language);
          } catch (err: any) {
            updateQueueItem(item.id, { status: "error", error: err.message });
            appendActivity({ type: "error", message: `Failed to start transcription for ${item.file.name}: ${err.message}` });
            toast.error(`Failed to start: ${err.message}`);
          }
        } else {
          // Just uploaded, add as pending meeting
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
          setAllMeetings(loadMeetings());
          toast.success(`Uploaded: ${item.file.name} (transcription not started)`);
        }
      } catch (err: any) {
        updateQueueItem(item.id, { status: "error", error: err.message });
        appendActivity({ type: "error", message: `Upload failed for ${item.file.name}: ${err.message}` });
        toast.error(`Upload failed: ${err.message}`);
      }
    }

    setIsProcessing(false);
  };

  const queuedCount = queue.filter((f) => f.status === "queued").length;
  const activeCount = queue.filter((f) => ["uploading", "uploaded", "transcribing"].includes(f.status)).length;

  const statusIcon = (status: QueuedFile["status"]) => {
    switch (status) {
      case "uploading":
      case "transcribing":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const statusLabel = (item: QueuedFile) => {
    switch (item.status) {
      case "uploading": return "Uploading…";
      case "uploaded": return "Uploaded";
      case "transcribing": return item.progress ? `Transcribing ${item.progress}%` : "Transcribing…";
      case "completed": return "Done";
      case "error": return item.error || "Error";
      default: return "";
    }
  };

  return (
    <div className="space-y-8 2xl:space-y-10">
      <div>
        <h1 className="text-2xl 2xl:text-3xl 3xl:text-4xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm 2xl:text-base text-muted-foreground">
          Overview and upload
        </p>
      </div>

      {/* Stats + Upload in a responsive grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 2xl:gap-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 2xl:gap-5 3xl:gap-6 auto-rows-min">
          <StatCard label="Total Meetings" value={allMeetings.length} icon={Calendar} />
          <StatCard label="Transcriptions" value={allMeetings.filter((m) => m.status === "completed").length} icon={FileText} />
          <StatCard label="Audio Files" value={allMeetings.filter((m) => m.mediaType === "audio").length} icon={FileAudio} />
          <StatCard label="Processing" value={allMeetings.filter((m) => m.status === "transcribing").length + activeCount} icon={Activity} />
          <StatCard label="Tokens Used" value={usage.totalTokens.toLocaleString()} icon={Zap} />
          <StatCard
            label="AI Cost"
            value={`$${usage.estimatedCost.toFixed(4)}`}
            icon={DollarSign}
            trend={usage.estimatedCost === 0 ? "Free models!" : undefined}
          />
          <StatCard label="Total Size" value={formatTotalSize(totalBytes)} icon={HardDrive} />
        </div>

        {/* Upload drop zone */}
        <div className="xl:w-72 2xl:w-80 3xl:w-96">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 xl:py-8 xl:h-full transition-all",
              dragOver
                ? "border-primary bg-primary/5 glow-primary"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
          >
            <Upload className={cn("mb-3 h-8 w-8", dragOver ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-medium text-card-foreground">
              Drop files or{" "}
              <label className="cursor-pointer text-primary hover:underline">
                browse
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".mp4,.mkv,.avi,.mov,.webm,.mp3,.wav,.ogg,.m4a,.flac"
                  onChange={handleFileSelect}
                />
              </label>
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground font-mono">
              MP4, MKV, AVI, MOV, WEBM, MP3, WAV, OGG, M4A, FLAC
            </p>
            <p className="mt-2 text-[9px] text-muted-foreground/70 px-4 text-center">
              Files are sent to Scriberr for transcription
            </p>
          </div>
        </div>
      </div>

      {/* Upload Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg 2xl:text-xl font-medium">
              Upload Queue ({queue.length})
              {activeCount > 0 && (
                <span className="ml-2 text-sm text-muted-foreground font-normal">
                  {activeCount} processing
                </span>
              )}
            </h2>
            <Button
              variant="default"
              size="sm"
              onClick={handleStartTranscription}
              disabled={queuedCount === 0 || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Processing…
                </>
              ) : (
                `Start Transcription${queuedCount > 0 ? ` (${queuedCount})` : ""}`
              )}
            </Button>
          </div>
          <div className="space-y-2">
            {queue.map((item) => {
              const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3 transition-colors",
                    item.status === "error"
                      ? "border-destructive/30 bg-destructive/5"
                      : item.status === "completed"
                        ? "border-success/30 bg-success/5"
                        : "border-border bg-card"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {statusIcon(item.status) || (isVideo ? (
                      <FileVideo className="h-4 w-4 text-info" />
                    ) : (
                      <FileAudio className="h-4 w-4 text-primary" />
                    ))}
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{item.file.name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground font-mono">{formatSize(item.file.size)}</p>
                        {item.status !== "queued" && (
                          <span className={cn(
                            "text-[10px] font-mono",
                            item.status === "error" ? "text-destructive" :
                            item.status === "completed" ? "text-success" :
                            "text-primary"
                          )}>
                            {statusLabel(item)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.status === "queued" && (
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <select
                          value={item.language}
                          onChange={(e) => setLanguage(item.id, e.target.value)}
                          className="h-7 rounded border border-border bg-background px-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-ring outline-none"
                        >
                          {LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {item.jobId && item.status === "completed" && (
                      <a
                        href={getAudioUrl(item.jobId)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary hover:underline font-mono"
                      >
                        View in Scriberr
                      </a>
                    )}
                    <button
                      onClick={() => removeFile(item.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Meetings */}
      <div>
        <h2 className="mb-4 text-lg 2xl:text-xl font-medium">Recent Meetings</h2>
        {recentMeetings.length > 0 ? (
          <div className="space-y-2">
            {recentMeetings.map((m) => (
              <MeetingRow
                key={m.id}
                id={m.id}
                title={m.title}
                date={m.date}
                duration={m.duration}
                status={m.status}
                source={m.source}
                mediaType={m.mediaType}
                calendarEventUrl={m.calendarEventUrl}
              />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No meetings yet. Upload a file to get started.
          </p>
        )}
      </div>
    </div>
  );
}
