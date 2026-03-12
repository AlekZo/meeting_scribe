import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FolderOpen, FolderSync, Eye, EyeOff, FileVideo, X, ArrowRight, Trash2 } from "lucide-react";
import { useFolderWatcher } from "@/hooks/use-folder-watcher";
import { loadSetting, saveSetting } from "@/lib/storage";
import { useState } from "react";

export default function FolderWatchSection() {
  const {
    watching,
    folderName,
    detectedFiles,
    knownFilesCount,
    pickFolder,
    stopWatching,
    markProcessed,
    dismissFile,
    clearHistory,
  } = useFolderWatcher();

  const [autoProcess, setAutoProcess] = useState(
    loadSetting("watch_auto_process", false)
  );
  const [minSizeMB, setMinSizeMB] = useState(
    loadSetting("watch_min_size_mb", 1)
  );

  const isSupported = "showDirectoryPicker" in window;

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (!isSupported) {
    return (
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <FolderSync className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-medium">Folder Watcher</h2>
        </div>
        <p className="text-xs text-destructive">
          File System Access API is not supported in this browser. Use Chrome or Edge for folder watching.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderSync className="h-4 w-4 text-primary" />
          <h2 className="text-base font-medium">Folder Watcher</h2>
          {watching && (
            <span className="flex items-center gap-1 text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded font-mono">
              <Eye className="h-2.5 w-2.5" /> watching
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Monitor a local folder (e.g. OBS output) for new recordings. When a file finishes writing, it's queued for transcription.
      </p>

      {/* Folder picker */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={pickFolder} className="gap-1.5 text-xs">
          <FolderOpen className="h-3 w-3" />
          {folderName ? "Change Folder" : "Select Folder"}
        </Button>
        {watching && (
          <Button variant="ghost" size="sm" onClick={stopWatching} className="gap-1.5 text-xs text-muted-foreground">
            <EyeOff className="h-3 w-3" />
            Stop
          </Button>
        )}
        {folderName && (
          <span className="text-xs font-mono text-muted-foreground">
            📂 {folderName}
          </span>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-process new files</p>
            <p className="text-xs text-muted-foreground">Automatically send to Scriberr when detected</p>
          </div>
          <Switch
            checked={autoProcess}
            onCheckedChange={(v) => { setAutoProcess(v); saveSetting("watch_auto_process", v); }}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Min file size (MB)</Label>
          <Input
            type="number"
            value={minSizeMB}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinSizeMB(v);
              saveSetting("watch_min_size_mb", v);
            }}
            className="mt-1 w-24 bg-background font-mono text-sm"
            min={0}
            step={0.5}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Ignore files smaller than this (skip test clips, etc.)
          </p>
        </div>
      </div>

      {/* Stats */}
      {knownFilesCount > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{knownFilesCount} file(s) already processed</span>
          <Button variant="ghost" size="sm" onClick={clearHistory} className="gap-1 text-xs h-7">
            <Trash2 className="h-3 w-3" />
            Clear history
          </Button>
        </div>
      )}

      {/* Detected files */}
      {detectedFiles.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-medium text-foreground">
            New recordings detected ({detectedFiles.length})
          </h3>
          {detectedFiles.map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <FileVideo className="h-4 w-4 text-info" />
                <div>
                  <p className="text-sm font-medium text-foreground">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {formatSize(f.size)} · {new Date(f.lastModified).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1 text-xs h-7"
                  onClick={() => markProcessed(f)}
                >
                  <ArrowRight className="h-3 w-3" />
                  Process
                </Button>
                <button
                  onClick={() => dismissFile(f.name)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
