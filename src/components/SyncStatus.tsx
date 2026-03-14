// Sync status indicator — shows cloud sync state in the UI

import { useState, useEffect, useCallback } from "react";
import { Cloud, CloudOff, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type SyncStatus = "idle" | "syncing" | "saved" | "offline" | "error";

// Global sync status event system
const listeners = new Set<(status: SyncStatus, detail?: string) => void>();

export function emitSyncStatus(status: SyncStatus, detail?: string) {
  listeners.forEach((fn) => fn(status, detail));
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [detail, setDetail] = useState<string>();

  useEffect(() => {
    const handler = (s: SyncStatus, d?: string) => {
      setStatus(s);
      setDetail(d);
      // Auto-clear "saved" after 3s
      if (s === "saved") {
        setTimeout(() => setStatus("idle"), 3000);
      }
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return { status, detail };
}

export function SyncStatusIndicator() {
  const { status, detail } = useSyncStatus();

  const icon = (() => {
    switch (status) {
      case "syncing":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      case "saved":
        return <Check className="h-3.5 w-3.5 text-success" />;
      case "offline":
      case "error":
        return <CloudOff className="h-3.5 w-3.5 text-warning" />;
      default:
        return <Cloud className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
  })();

  const label = (() => {
    switch (status) {
      case "syncing": return "Saving…";
      case "saved": return "Saved";
      case "offline": return "Offline — changes saved locally";
      case "error": return detail || "Sync failed — changes saved locally";
      default: return "Connected";
    }
  })();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors cursor-default",
            status === "error" || status === "offline"
              ? "bg-warning/10"
              : ""
          )}>
            {icon}
            {(status === "offline" || status === "error") && (
              <span className="text-[10px] font-mono text-warning">Offline</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
