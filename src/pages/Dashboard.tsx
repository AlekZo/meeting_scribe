import { useState, useCallback } from "react";
import { FileAudio, Calendar, FileText, Activity, DollarSign, Zap, Upload, FileVideo, X, Globe, HardDrive } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { MeetingRow } from "@/components/MeetingRow";
import { Button } from "@/components/ui/button";
import { sampleMeetings } from "@/data/meetings";
import { getTotalUsage } from "@/lib/openrouter";
import { cn } from "@/lib/utils";

interface QueuedFile {
  file: File;
  id: string;
  language: string;
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
  // Strip extension
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
  const recentMeetings = sampleMeetings.slice(0, 5);
  const usage = getTotalUsage();
  const totalBytes = sampleMeetings.reduce((sum, m) => sum + (m.fileSize || 0), 0);
  const formatTotalSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(mp4|mkv|avi|mov|webm|mp3|wav|ogg|m4a|flac)$/i.test(f.name)
    );
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => ({ file, id: crypto.randomUUID(), language: detectLanguageFromName(file.name) })),
    ]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => ({ file, id: crypto.randomUUID(), language: detectLanguageFromName(file.name) })),
    ]);
  };

  const removeFile = (id: string) => setQueue((prev) => prev.filter((f) => f.id !== id));

  const setLanguage = (id: string, lang: string) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, language: lang } : f)));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          <StatCard label="Total Meetings" value={sampleMeetings.length} icon={Calendar} trend="+3 this week" />
          <StatCard label="Transcriptions" value={sampleMeetings.filter((m) => m.status === "completed").length} icon={FileText} />
          <StatCard label="Audio Files" value={sampleMeetings.filter((m) => m.mediaType === "audio").length} icon={FileAudio} />
          <StatCard label="Processing" value={sampleMeetings.filter((m) => m.status === "transcribing").length} icon={Activity} />
          <StatCard label="Tokens Used" value={usage.totalTokens.toLocaleString()} icon={Zap} />
          <StatCard
            label="AI Cost"
            value={`$${usage.estimatedCost.toFixed(4)}`}
            icon={DollarSign}
            trend={usage.estimatedCost === 0 ? "Free models!" : undefined}
          />
          <StatCard label="Total Size" value={formatTotalSize(totalBytes)} icon={HardDrive} />
        </div>

        {/* Upload drop zone — compact, right side on desktop */}
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
              Timestamps in filenames match Google Calendar events
            </p>
          </div>
        </div>
      </div>

      {/* Upload Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg 2xl:text-xl font-medium">Upload Queue ({queue.length})</h2>
            <Button variant="default" size="sm">
              Start Transcription
            </Button>
          </div>
          <div className="space-y-2">
            {queue.map((item) => {
              const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {isVideo ? (
                      <FileVideo className="h-4 w-4 text-info" />
                    ) : (
                      <FileAudio className="h-4 w-4 text-primary" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{formatSize(item.file.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
                    <button onClick={() => removeFile(item.id)} className="text-muted-foreground hover:text-destructive">
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
      </div>
    </div>
  );
}
