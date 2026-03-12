import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { meetingSlug } from "@/lib/utils";
import { loadSetting, saveSetting } from "@/lib/storage";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  FileText,
  ChevronRight,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  History,
  Filter,
} from "lucide-react";
import type { Meeting } from "@/data/meetings";

interface MeetingSidebarProps {
  currentMeetingId?: string;
  allMeetings: Meeting[];
  seriesMeetings: Meeting[];
  hasSeriesMatches: boolean;
}

const statusIcon: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  completed: { icon: CheckCircle2, className: "text-success" },
  transcribing: { icon: Loader2, className: "text-info animate-spin" },
  error: { icon: AlertCircle, className: "text-destructive" },
  pending: { icon: Clock, className: "text-muted-foreground" },
};

function trackRecentMeeting(meetingId: string) {
  const recent = loadSetting<string[]>("recent_meetings", []);
  const updated = [meetingId, ...recent.filter((id) => id !== meetingId)].slice(0, 10);
  saveSetting("recent_meetings", updated);
}

function getRecentMeetings(): string[] {
  return loadSetting<string[]>("recent_meetings", []);
}

export function MeetingSidebar({
  currentMeetingId,
  allMeetings,
  seriesMeetings,
  hasSeriesMatches,
}: MeetingSidebarProps) {
  const [showSeriesOnly, setShowSeriesOnly] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);

  // Track current meeting as recently opened
  useEffect(() => {
    if (currentMeetingId) trackRecentMeeting(currentMeetingId);
  }, [currentMeetingId]);

  const recentIds = getRecentMeetings().filter((id) => id !== currentMeetingId);
  const recentMeetings = recentIds
    .map((id) => allMeetings.find((m) => m.id === id))
    .filter(Boolean) as Meeting[];

  const otherMeetings = allMeetings.filter((m) => m.id !== currentMeetingId);

  const timelineMeetings = showSeriesOnly && hasSeriesMatches
    ? seriesMeetings
    : otherMeetings;

  // Group by date
  const grouped = timelineMeetings.reduce<Record<string, Meeting[]>>((acc, m) => {
    const date = m.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(m);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <aside className="hidden xl:block w-72 sticky top-8 self-start max-h-[calc(100vh-4rem)] overflow-y-auto space-y-4">
      {/* Recent Meetings */}
      {recentMeetings.length > 0 && (
        <Collapsible open={recentOpen} onOpenChange={setRecentOpen}>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <div className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Recently Opened
                <span className="text-[10px] opacity-60">({recentMeetings.length})</span>
              </div>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", !recentOpen && "-rotate-90")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border px-2 py-2 space-y-1">
                {recentMeetings.slice(0, 5).map((m) => (
                  <MeetingLink key={m.id} meeting={m} />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Timeline */}
      <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {showSeriesOnly ? "Series Timeline" : "All Meetings"}
              <span className="text-[10px] opacity-60">({timelineMeetings.length})</span>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", !timelineOpen && "-rotate-90")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border">
              {/* Series toggle */}
              {hasSeriesMatches && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSeriesOnly(!showSeriesOnly); }}
                  className={cn(
                    "flex items-center gap-1.5 w-full px-3 py-2 text-[11px] font-medium border-b border-border transition-colors",
                    showSeriesOnly
                      ? "bg-primary/5 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                  )}
                >
                  <Filter className="h-3 w-3" />
                  {showSeriesOnly ? "Showing series only" : "Show series only"}
                </button>
              )}

              {/* Vertical timeline */}
              <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
                {sortedDates.map((date, dateIdx) => (
                  <div key={date}>
                    {/* Date header */}
                    <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm px-3 py-1.5 border-b border-border/50">
                      <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
                        {date}
                      </span>
                    </div>
                    {/* Meetings for this date */}
                    <div className="relative pl-6 pr-2 py-1">
                      {/* Vertical line */}
                      <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />

                      {grouped[date].map((m, idx) => {
                        const status = statusIcon[m.status] ?? statusIcon.pending;
                        const StatusIcon = status.icon;
                        const isCurrent = m.id === currentMeetingId;

                        return (
                          <div key={m.id} className="relative py-1">
                            {/* Timeline dot */}
                            <div className={cn(
                              "absolute left-[-14px] top-3 h-2.5 w-2.5 rounded-full border-2 border-card z-[1]",
                              isCurrent ? "bg-primary" : "bg-muted-foreground/40"
                            )} />

                            <NavLink
                              to={`/meetings/${meetingSlug(m.title, m.id)}`}
                              className={cn(
                                "block rounded-md px-2.5 py-2 transition-colors",
                                isCurrent
                                  ? "bg-primary/10 border border-primary/30"
                                  : "hover:bg-secondary/40"
                              )}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="min-w-0 flex-1">
                                  <p className={cn(
                                    "text-xs font-medium truncate",
                                    isCurrent ? "text-primary" : "text-card-foreground"
                                  )}>
                                    {m.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground font-mono">{m.duration}</span>
                                    <StatusIcon className={cn("h-2.5 w-2.5", status.className)} />
                                  </div>
                                </div>
                                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
                              </div>
                            </NavLink>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {timelineMeetings.length === 0 && (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    No meetings found
                  </p>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </aside>
  );
}

function MeetingLink({ meeting: m }: { meeting: Meeting }) {
  const status = statusIcon[m.status] ?? statusIcon.pending;
  const StatusIcon = status.icon;

  return (
    <NavLink
      to={`/meetings/${meetingSlug(m.title, m.id)}`}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
          isActive ? "bg-primary/10" : "hover:bg-secondary/40"
        )
      }
    >
      <StatusIcon className={cn("h-3 w-3 shrink-0", status.className)} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-card-foreground truncate">{m.title}</p>
        <p className="text-[9px] text-muted-foreground font-mono">{m.date} · {m.duration}</p>
      </div>
    </NavLink>
  );
}
