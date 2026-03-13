import { MeetingRow } from "@/components/MeetingRow";
import { MEETING_CATEGORIES, MeetingCategory, TagRule } from "@/data/meetings";
import { loadMeetings, loadMeetingOverrides, loadSetting, saveSetting } from "@/lib/storage";
import { autoTag } from "@/lib/auto-tagger";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, X, Tag, CalendarIcon, ChevronDown, FileSearch } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO, isSameDay } from "date-fns";

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

  const allMeetings = loadMeetings();

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

  // Deduplicate meeting dates for calendar highlights
  const meetingDates = useMemo(() => {
    const seen = new Set<string>();
    const dates: Date[] = [];
    for (const m of meetingsWithOverrides) {
      if (!seen.has(m.date)) {
        seen.add(m.date);
        try {
          dates.push(parseISO(m.date));
        } catch {}
      }
    }
    return dates;
  }, [meetingsWithOverrides]);

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

  const clearAllFilters = () => {
    setSearch("");
    setActiveCategory("all");
    setActiveStatus("all");
    setSelectedDate(undefined);
    saveSetting("meetings_filter_category", "all");
    saveSetting("meetings_filter_status", "all");
  };

  const hasActiveFilters = search || activeCategory !== "all" || activeStatus !== "all" || selectedDate;

  // Count meetings per category
  const categoryCounts = new Map<string, number>();
  categoryCounts.set("all", meetingsWithOverrides.length);
  for (const cat of MEETING_CATEGORIES) {
    categoryCounts.set(cat, meetingsWithOverrides.filter((m) => m.category === cat).length);
  }

  const statuses = ["all", "completed", "transcribing", "pending", "error"];

  // Shared calendar component
  const calendarContent = (
    <>
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
          hasMeeting: meetingDates,
        }}
        modifiersStyles={{
          hasMeeting: {
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            textDecorationThickness: "2px",
          },
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
    </>
  );

  return (
    <div className="space-y-6 2xl:space-y-8">
      {/* Header row with title + calendar */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl 2xl:text-3xl 3xl:text-4xl font-semibold tracking-tight">Meetings</h1>
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
          <div className="flex flex-wrap items-center gap-4 mt-4">
            {/* Category filter */}
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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

            <div className="hidden sm:block h-4 w-px bg-border" />

            {/* Status filter */}
            <div className="flex flex-wrap items-center gap-1">
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

            <div className="hidden sm:block h-4 w-px bg-border" />

            {/* Mobile date filter (popover) */}
            <div className="md:hidden">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                    <CalendarIcon className="h-3 w-3" />
                    {selectedDate ? format(selectedDate, "MMM d") : "Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  {calendarContent}
                </PopoverContent>
              </Popover>
            </div>

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
        </div>

        {/* Calendar — top-right, collapsed by default (desktop only) */}
        <div className="hidden md:block shrink-0">
          <Collapsible>
            <div className="rounded-lg border border-border bg-card">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Calendar
                  {selectedDate && (
                    <span className="text-[10px] font-mono text-primary ml-1">
                      {format(selectedDate, "MMM d")}
                    </span>
                  )}
                </div>
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=closed]>&]:rotate-[-90deg]" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border p-1">
                  {calendarContent}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      </div>

      {/* Meeting list */}
      <div className="space-y-1">
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
          <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg bg-secondary/10">
            <FileSearch className="h-8 w-8 text-muted-foreground/50 mb-3" />
            <h3 className="text-sm font-medium text-foreground">No meetings found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              We couldn't find any meetings matching your current search or filter criteria.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearAllFilters}
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
