import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FileText, Clock, CheckCircle2, Loader2, AlertCircle, ExternalLink, Video, Music } from "lucide-react";

export type MeetingStatus = "pending" | "transcribing" | "completed" | "error";

interface MeetingRowProps {
  id: string;
  title: string;
  date: string;
  duration: string;
  status: MeetingStatus;
  source: string;
  mediaType?: "audio" | "video";
  calendarEventUrl?: string;
}

const statusConfig: Record<MeetingStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  pending: { icon: Clock, label: "Pending", className: "text-warning" },
  transcribing: { icon: Loader2, label: "Transcribing", className: "text-info animate-spin" },
  completed: { icon: CheckCircle2, label: "Completed", className: "text-success" },
  error: { icon: AlertCircle, label: "Error", className: "text-destructive" },
};

export function MeetingRow({ id, title, date, duration, status, source, mediaType, calendarEventUrl }: MeetingRowProps) {
  const navigate = useNavigate();
  const { icon: StatusIcon, label, className } = statusConfig[status];

  return (
    <div
      onClick={() => navigate(`/meetings/${id}`)}
      className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:bg-secondary/50 cursor-pointer group"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-secondary">
          {mediaType === "video" ? (
            <Video className="h-4 w-4 text-info" />
          ) : (
            <Music className="h-4 w-4 text-primary" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors">{title}</p>
            {calendarEventUrl && (
              <a
                href={calendarEventUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-info transition-colors"
                title="Open in Google Calendar"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{date} · {duration}</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-mono text-secondary-foreground">
          {source}
        </span>
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", className)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {label}
        </div>
      </div>
    </div>
  );
}
