import { Link } from "react-router-dom";
import { cn, meetingSlug } from "@/lib/utils";
import { Clock, CheckCircle2, Loader2, AlertCircle, ExternalLink, Video, Music, Tag, Layers } from "lucide-react";
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

const statusConfig: Record<MeetingStatus, { icon: typeof CheckCircle2; label: string; className: string; bgClass: string }> = {
  pending: { icon: Clock, label: "Pending", className: "text-warning", bgClass: "bg-warning/10" },
  transcribing: { icon: Loader2, label: "Transcribing", className: "text-info animate-spin", bgClass: "bg-info/10" },
  completed: { icon: CheckCircle2, label: "Completed", className: "text-success", bgClass: "bg-success/10" },
  error: { icon: AlertCircle, label: "Error", className: "text-destructive", bgClass: "bg-destructive/10" },
};

export function MeetingRow({ id, title, date, duration, status, source, mediaType, calendarEventUrl, category, tags, meetingType, autoCategories }: MeetingRowProps) {
  const { icon: StatusIcon, label, className, bgClass } = statusConfig[status];

  const hasClassification = !!(category || (tags && tags.length > 0) || (autoCategories && autoCategories.length > 0));

  return (
    <Link
      to={`/meetings/${meetingSlug(title, id)}`}
      className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:bg-secondary/40 hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background group"
    >
      {/* Media type icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary mt-0.5">
        {mediaType === "video" ? (
          <Video className="h-4 w-4 text-info" />
        ) : (
          <Music className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Line 1: Title + badges */}
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
            {title}
          </p>
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
        </div>

        {/* Line 2: Core metadata */}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="font-mono">{date}</span>
          <span className="text-border">&bull;</span>
          <span className="font-mono">{duration}</span>
          <span className="hidden sm:inline text-border">&bull;</span>
          <span className="hidden sm:inline rounded bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-secondary-foreground">
            {source}
          </span>
        </div>

        {/* Line 3: Classification tags (only if they exist) */}
        {hasClassification && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {category && (
              <span className="shrink-0 flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Tag className="h-2.5 w-2.5" />
                {category}
              </span>
            )}
            {autoCategories && autoCategories.length > 0 && (
              <>
                {autoCategories.slice(0, 3).map((cat) => (
                  <span key={cat} className="rounded-full border border-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-primary/80">
                    {cat}
                  </span>
                ))}
                {autoCategories.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{autoCategories.length - 3}</span>
                )}
              </>
            )}
            {tags && tags.length > 0 && (
              <>
                {tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                    #{tag}
                  </span>
                ))}
                {tags.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{tags.length - 3}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Status — right side */}
      <div className={cn("flex items-center gap-1.5 shrink-0 rounded-full px-2 py-1 text-[11px] font-medium", className, bgClass)}>
        <StatusIcon className="h-3 w-3" />
        <span className="hidden sm:inline">{label}</span>
      </div>
    </Link>
  );
}
