import { useState, useCallback } from "react";
import { Upload, FileAudio, FileVideo, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function UploadPage() {
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
      ...files.map((file) => ({ file, id: crypto.randomUUID(), language: "auto" })),
    ]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => ({ file, id: crypto.randomUUID(), language: "auto" })),
    ]);
  };

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  };

  const setLanguage = (id: string, lang: string) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, language: lang } : f)));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload audio or video files for transcription
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-16 transition-all",
          dragOver
            ? "border-primary bg-primary/5 glow-primary"
            : "border-border bg-card hover:border-muted-foreground/30"
        )}
      >
        <Upload className={cn("mb-4 h-10 w-10", dragOver ? "text-primary" : "text-muted-foreground")} />
        <p className="text-sm font-medium text-card-foreground">
          Drop files here or{" "}
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
        <p className="mt-1 text-xs text-muted-foreground font-mono">
          MP4, MKV, AVI, MOV, WEBM, MP3, WAV, OGG, M4A, FLAC
        </p>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Timestamps in filenames (e.g. 2026-03-12_14-30-00) will be used to match Google Calendar events
        </p>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Queue ({queue.length})</h2>
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
                    {/* Language selector */}
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
    </div>
  );
}
