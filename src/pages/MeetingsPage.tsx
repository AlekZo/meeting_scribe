import { MeetingRow } from "@/components/MeetingRow";
import { sampleMeetings, MEETING_CATEGORIES, MeetingCategory, TagRule } from "@/data/meetings";
import { loadMeetings, loadMeetingOverrides, loadSetting, saveSetting } from "@/lib/storage";
import { autoTag } from "@/lib/auto-tagger";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, X, Tag, CalendarIcon, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO, isSameDay, startOfDay, endOfDay } from "date-fns";

export default function MeetingsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<MeetingCategory | "all">(
    loadSetting<MeetingCategory | "all">("meetings_filter_category", "all")
  );
  const [activeStatus, setActiveStatus] = useState<string>(
    loadSetting<string>("meetings_filter_status", "all")
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const typeRules = loadSetting<TagRule[]>("type_rules", []);
  const categoryRules = loadSetting<TagRule[]>("category_rules", []);

  const allMeetings = [...sampleMeetings, ...loadMeetings()];

  const meetingsWithOverrides = allMeetings.map((m) => {
    const ov = loadMeetingOverrides(m.id);
    const tagged = m.segments.length > 0 ? autoTag(m.segments, typeRules, categoryRules) : { meetingType: undefined, autoCategories: [] };
    return {
      ...m,
      category: ov.category ?? m.category,
      tags: ov.tags ?? m.tags ?? [],
      title: ov.title ?? m.title,
      meetingType: ov.meetingType ?? m.meetingType ?? tagged.meetingType,
      autoCategories: ov.autoCategories ?? m.autoCategories ?? tagged.autoCategories,
    };
  });

  const filtered = meetingsWithOverrides.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      m.title.toLowerCase().includes(q) ||
      m.date.toLowerCase().includes(q) ||
      (m.tags || []).some((t: string) => t.toLowerCase().includes(q));
    const matchesCategory = activeCategory === "all" || m.category === activeCategory;
    const matchesStatus = activeStatus === "all" || m.status === activeStatus;
    let matchesDate = true;
    if (selectedDate) {
      try {
        const meetingDate = parseISO(m.date);
        matchesDate = isSameDay(meetingDate, selectedDate);
      } catch {
        matchesDate = true;
      }
    }
    return matchesSearch && matchesCategory && matchesStatus && matchesDate;
  });

  const handleCategoryChange = (cat: MeetingCategory | "all") => {
    setActiveCategory(cat);
    saveSetting("meetings_filter_category", cat);
  };

  const handleStatusChange = (status: string) => {
    setActiveStatus(status);
    saveSetting("meetings_filter_status", status);
  };

  // Count meetings per category
  const categoryCounts = new Map<string, number>();
  categoryCounts.set("all", meetingsWithOverrides.length);
  for (const cat of MEETING_CATEGORIES) {
    categoryCounts.set(cat, meetingsWithOverrides.filter((m) => m.category === cat).length);
  }

  const statuses = ["all", "completed", "transcribing", "pending", "error"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All recorded meetings and their transcription status
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search meetings or tags..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Category filter */}
        <div className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex flex-wrap items-center gap-1">
            {(["all", ...MEETING_CATEGORIES] as const).map((cat) => {
              const count = categoryCounts.get(cat) || 0;
              if (cat !== "all" && count === 0) return null;
              return (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat as MeetingCategory | "all")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  )}
                >
                  {cat === "all" ? "All" : cat}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium font-mono transition-colors capitalize",
                activeStatus === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Selected date indicator */}
        {selectedDate && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-primary font-medium">
              {format(selectedDate, "MMM d, yyyy")}
            </span>
            <button
              onClick={() => setSelectedDate(undefined)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Collapsible mini calendar */}
        <div className="hidden md:block shrink-0">
          <Collapsible defaultOpen>
            <div className="rounded-lg border border-border bg-card">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Calendar
                </div>
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=closed]>&]:rotate-[-90deg]" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border p-1">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(day) => {
                      if (day && selectedDate && isSameDay(day, selectedDate)) {
                        setSelectedDate(undefined);
                      } else {
                        setSelectedDate(day);
                      }
                    }}
                    modifiers={{
                      hasMeeting: meetingsWithOverrides.map((m) => {
                        try { return parseISO(m.date); } catch { return new Date(0); }
                      }),
                    }}
                    modifiersClassNames={{
                      hasMeeting: "font-bold text-primary",
                    }}
                    className="p-2 pointer-events-auto"
                  />
                  {selectedDate && (
                    <div className="px-3 pb-2 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {format(selectedDate, "MMM d, yyyy")}
                      </span>
                      <button
                        onClick={() => setSelectedDate(undefined)}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>

        {/* Meeting list */}
        <div className="flex-1 space-y-1 min-w-0">
          {filtered.map((m) => (
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
              category={m.category}
              tags={m.tags}
              meetingType={m.meetingType}
              autoCategories={m.autoCategories}
            />
          ))}
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">No meetings found</p>
          )}
        </div>
      </div>
    </div>
  );
}
