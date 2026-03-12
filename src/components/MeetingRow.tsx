import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FileText, Clock, CheckCircle2, Loader2, AlertCircle, ExternalLink, Video, Music, Tag, Layers } from "lucide-react";
import { MeetingCategory } from "@/data/meetings";

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
  category?: MeetingCategory;
  tags?: string[];
  meetingType?: string;
  autoCategories?: string[];
}

const statusConfig: Record<MeetingStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  pending: { icon: Clock, label: "Pending", className: "text-warning" },
  transcribing: { icon: Loader2, label: "Transcribing", className: "text-info animate-spin" },
  completed: { icon: CheckCircle2, label: "Completed", className: "text-success" },
  error: { icon: AlertCircle, label: "Error", className: "text-destructive" },
};

export function MeetingRow({ id, title, date, duration, status, source, mediaType, calendarEventUrl, category, tags, meetingType, autoCategories }: MeetingRowProps) {
  const navigate = useNavigate();
  const { icon: StatusIcon, label, className } = statusConfig[status];

  return (
    <div
      onClick={() => navigate(`/meetings/${id}`)}
      className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2 transition-colors hover:bg-secondary/50 cursor-pointer group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary">
          {mediaType === "video" ? (
            <Video className="h-3.5 w-3.5 text-info" />
          ) : (
            <Music className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
        <p className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors truncate">{title}</p>
        {calendarEventUrl && (
          <a
            href={calendarEventUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-muted-foreground hover:text-info transition-colors"
            title="Open in Google Calendar"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {meetingType && (
          <span className="shrink-0 rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-medium text-info border border-info/20">
            {meetingType}
          </span>
        )}
        {category && (
          <span className="shrink-0 flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <Tag className="h-2.5 w-2.5" />
            {category}
          </span>
        )}
        {autoCategories && autoCategories.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {autoCategories.slice(0, 2).map((cat) => (
              <span key={cat} className="rounded-full border border-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-primary/80">
                {cat}
              </span>
            ))}
            {autoCategories.length > 2 && (
              <span className="text-[9px] text-muted-foreground">+{autoCategories.length - 2}</span>
            )}
          </div>
        )}
        {tags && tags.length > 0 && (
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                #{tag}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-[9px] text-muted-foreground">+{tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-4">
        <span className="text-[11px] text-muted-foreground font-mono hidden md:inline">{date}</span>
        <span className="text-[11px] text-muted-foreground font-mono">{duration}</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-secondary-foreground hidden lg:inline">
          {source}
        </span>
        <div className={cn("flex items-center gap-1 text-[11px] font-medium", className)}>
          <StatusIcon className="h-3 w-3" />
          <span className="hidden sm:inline">{label}</span>
        </div>
      </div>
    </div>
  );
}
