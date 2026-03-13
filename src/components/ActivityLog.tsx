import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Send,
  Bot,
  Calendar,
  Cpu,
} from "lucide-react";

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: "upload" | "transcription" | "rename" | "telegram" | "calendar" | "sheets" | "error" | "system";
  message: string;
  status: "success" | "error" | "info" | "warning" | "processing";
  details?: string;
}

const typeIcons = {
  upload: Upload,
  transcription: Cpu,
  rename: FileText,
  telegram: Bot,
  calendar: Calendar,
  sheets: FileText,
  error: AlertCircle,
  system: RefreshCw,
};

const statusColors = {
  success: "text-success",
  error: "text-destructive",
  info: "text-info",
  warning: "text-warning",
  processing: "text-primary",
};

export const sampleActivity: ActivityEvent[] = [
  { id: "1", timestamp: "2026-03-12 14:32:05", type: "upload", message: "Sprint Planning - Q1 2026.mp4 uploaded to Scriberr", status: "success" },
  { id: "2", timestamp: "2026-03-12 14:32:08", type: "transcription", message: "Transcription started (CUDA, large-v3, bs=4, float16)", status: "processing" },
  { id: "3", timestamp: "2026-03-12 14:35:22", type: "transcription", message: "Transcription completed — 14 segments, 3 speakers, 1,247 words", status: "success" },
  { id: "4", timestamp: "2026-03-12 14:35:24", type: "system", message: "Cleaning raw WhisperX output — merging continuous segments", status: "info" },
  { id: "5", timestamp: "2026-03-12 14:35:30", type: "system", message: "AI speaker identification via OpenRouter (gpt-4o-mini)", status: "processing" },
  { id: "6", timestamp: "2026-03-12 14:35:45", type: "system", message: "Speakers identified: SPEAKER_00→Alex Chen, SPEAKER_01→Sarah Kim, SPEAKER_02→Dev Patel", status: "success" },
  { id: "7", timestamp: "2026-03-12 14:35:47", type: "telegram", message: "Transcript sent to Telegram chat", status: "success" },
  { id: "8", timestamp: "2026-03-12 14:35:50", type: "sheets", message: "Meeting log published to Google Sheets (Meeting_Logs tab)", status: "success" },
  { id: "9", timestamp: "2026-03-11 17:45:00", type: "telegram", message: "Voice message received from Telegram — 32:10 duration", status: "info" },
  { id: "10", timestamp: "2026-03-11 17:45:02", type: "calendar", message: "Matched to Google Calendar: Design Review (17:00-17:45)", status: "success" },
  { id: "11", timestamp: "2026-03-11 17:45:05", type: "rename", message: "File renamed: voice_msg_20260311.ogg → Design Review_2026-03-11_17-00-00.ogg", status: "success" },
  { id: "12", timestamp: "2026-03-11 17:45:08", type: "upload", message: "Design Review uploaded to Scriberr", status: "success" },
  { id: "13", timestamp: "2026-03-10 09:15:22", type: "error", message: "GPU OOM detected for Product Roadmap Discussion. Retrying on CPU...", status: "error", details: "CUDA failed with error out of memory. Falling back to CPU with int8 compute." },
  { id: "14", timestamp: "2026-03-10 09:15:25", type: "transcription", message: "Retrying transcription on CPU (int8, bs=1)", status: "warning" },
  { id: "15", timestamp: "2026-03-10 09:32:00", type: "error", message: "CPU transcription also failed — file may be corrupted", status: "error" },
];

export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="space-y-1">
      {events.map((event) => {
        const Icon = typeIcons[event.type] || RefreshCw;
        const statusColor = statusColors[event.status] || "text-muted-foreground";
        return (
          <div
            key={event.id}
            className="flex items-start gap-3 rounded-md px-4 py-2.5 hover:bg-secondary/30 transition-colors"
          >
            <div className={cn("mt-0.5", statusColor)}>
              {event.status === "processing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-card-foreground">{event.message}</p>
              {event.details && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{event.details}</p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap mt-0.5">
              {event.timestamp}
            </span>
          </div>
        );
      })}
    </div>
  );
}
