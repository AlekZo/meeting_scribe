import { toast } from "sonner";
import { MeetingRow } from "@/components/MeetingRow";
import { MEETING_CATEGORIES, MeetingCategory, TagRule } from "@/data/meetings";
import { loadMeetings, loadMeetingOverrides, loadSetting, saveSetting, deleteMeeting } from "@/lib/storage";
import { autoTag } from "@/lib/auto-tagger";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, X, Tag, CalendarIcon, ChevronDown, FileSearch, Upload, FileVideo, FileAudio, Globe, Loader2, CheckCircle2, AlertCircle, Clock, ArrowUpFromLine } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO, isSameDay } from "date-fns";
import { useUpload, LANGUAGES } from "@/contexts/UploadContext";
import { getAudioUrl, getScriberrJobUrl } from "@/lib/scriberr";
import type { Meeting } from "@/data/meetings";

export default function MeetingsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<MeetingCategory | "all">(
    loadSetting<MeetingCategory | "all">("meetings_filter_category", "all")
  );
  const [activeStatus, setActiveStatus] = useState<string>(
    loadSetting<string>("meetings_filter_status", "all")
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [showUploadZone, setShowUploadZone] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [, setTick] = useState(0);

  // Upload context
  const upload = useUpload();
  const { queue, isProcessing, addFiles, removeFile, setLanguage, startTranscription, activeCount, queuedCount } = upload;

  // Tick every second to update elapsed time during uploads
  useEffect(() => {
    const hasActive = queue.some((f) => f.status === "uploading" || f.status === "transcribing");
    if (!hasActive) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [queue]);

  // Meetings data — refresh when uploads complete
  const [meetingsVersion, setMeetingsVersion] = useState(0);

  useEffect(() => {
    upload.setOnMeetingsChanged(() => setMeetingsVersion((v) => v + 1));
    return () => upload.setOnMeetingsChanged(undefined);
  }, [upload]);

  const typeRules = useMemo(() => loadSetting<TagRule[]>("type_rules", []), []);
  const categoryRules = useMemo(() => loadSetting<TagRule[]>("category_rules", []), []);
  const allMeetings = useMemo(() => loadMeetings(), [meetingsVersion]);

  const meetingsWithOverrides = useMemo(() => {
    return allMeetings.map((m) => {
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
  }, [allMeetings, typeRules, categoryRules]);

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

  const handleDeleteMeeting = useCallback((meetingId: string) => {
    deleteMeeting(meetingId);
    setMeetingsVersion((v) => v + 1);
    toast.success("Meeting deleted");
  }, []);

  // Count meetings per category
  const categoryCounts = new Map<string, number>();
  categoryCounts.set("all", meetingsWithOverrides.length);
  for (const cat of MEETING_CATEGORIES) {
    categoryCounts.set(cat, meetingsWithOverrides.filter((m) => m.category === cat).length);
  }

  const statuses = ["all", "completed", "transcribing", "pending", "error"];

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "uploading":
      case "transcribing":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const statusLabel = (item: typeof queue[0]) => {
    switch (item.status) {
      case "uploading": {
        const pct = item.uploadProgress ?? 0;
        return `Uploading ${pct}%`;
      }
      case "uploaded": return "Uploaded";
      case "transcribing": return item.progress ? `Transcribing ${item.progress}%` : "Transcribing…";
      case "completed": return "Done";
      case "error": return item.error || "Error";
      default: return "";
    }
  };

  const formatElapsed = (startTime?: number) => {
    if (!startTime) return "";
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatSpeed = (item: typeof queue[0]) => {
    if (!item.uploadStartTime || !item.uploadedBytes) return "";
    const elapsed = (Date.now() - item.uploadStartTime) / 1000;
    if (elapsed < 0.5) return "";
    const speed = item.uploadedBytes / elapsed;
    if (speed > 1024 * 1024) return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(speed / 1024).toFixed(0)} KB/s`;
  };

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
      {/* Upload drop zone — dismissible, integrated at top */}
      {(showUploadZone || queue.length > 0) && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "relative flex items-center justify-center gap-4 rounded-lg border-2 border-dashed py-6 transition-all",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border bg-card/50 hover:border-muted-foreground/30"
            )}
          >
            <Upload className={cn("h-6 w-6 shrink-0", dragOver ? "text-primary" : "text-muted-foreground")} />
            <div>
              <p className="text-sm font-medium text-card-foreground">
                Drop audio/video files here or{" "}
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
              <p className="text-[10px] text-muted-foreground font-mono">
                MP4 · MKV · AVI · MOV · WEBM · MP3 · WAV · OGG · M4A · FLAC
              </p>
            </div>
            {queue.length === 0 && (
              <button
                onClick={() => setShowUploadZone(false)}
                className="absolute top-2 right-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                title="Hide upload zone"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Upload Queue */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Queue ({queue.length})
                  {activeCount > 0 && (
                    <span className="ml-1.5 text-xs text-primary">{activeCount} processing</span>
                  )}
                </span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={startTranscription}
                  disabled={queuedCount === 0 || isProcessing}
                  className="h-7 text-xs"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    `Start${queuedCount > 0 ? ` (${queuedCount})` : ""}`
                  )}
                </Button>
              </div>
              {queue.map((item) => {
                const isVideo = /\.(mp4|mkv|avi|mov|webm)$/i.test(item.file.name);
                const isUploading = item.status === "uploading";
                const isActive = isUploading || item.status === "transcribing";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 transition-colors",
                      item.status === "error"
                        ? "border-destructive/30 bg-destructive/5"
                        : item.status === "completed"
                          ? "border-success/30 bg-success/5"
                          : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {statusIcon(item.status) || (isVideo ? (
                          <FileVideo className="h-3.5 w-3.5 text-info shrink-0" />
                        ) : (
                          <FileAudio className="h-3.5 w-3.5 text-primary shrink-0" />
                        ))}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-card-foreground truncate">{item.file.name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[10px] text-muted-foreground font-mono">{formatSize(item.file.size)}</p>
                            {item.status !== "queued" && (
                              <span className={cn(
                                "text-[10px] font-mono",
                                item.status === "error" ? "text-destructive" :
                                item.status === "completed" ? "text-success" :
                                "text-primary"
                              )}>
                                {statusLabel(item)}
                              </span>
                            )}
                            {isActive && item.uploadStartTime && (
                              <>
                                <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatElapsed(item.uploadStartTime)}
                                </span>
                                {isUploading && formatSpeed(item) && (
                                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                                    <ArrowUpFromLine className="h-2.5 w-2.5" />
                                    {formatSpeed(item)}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === "queued" && (
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3 text-muted-foreground" />
                            <select
                              value={item.language}
                              onChange={(e) => setLanguage(item.id, e.target.value)}
                              className="h-6 rounded border border-border bg-background px-1.5 text-[10px] font-mono text-foreground focus:ring-1 focus:ring-ring outline-none"
                            >
                              {LANGUAGES.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                  {lang.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {item.jobId && item.status === "completed" && (() => {
                          const link = getScriberrJobUrl(item.jobId);
                          return link ? (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-primary hover:underline font-mono"
                            >
                              Scriberr
                            </a>
                          ) : null;
                        })()}
                        <button
                          onClick={() => removeFile(item.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {isUploading && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${item.uploadProgress ?? 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                          {item.uploadProgress ?? 0}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Show upload zone button when hidden */}
      {!showUploadZone && queue.length === 0 && (
        <button
          onClick={() => setShowUploadZone(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Upload className="h-3 w-3" />
          Show upload zone
        </button>
      )}

      {/* Header row with title + calendar */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl 2xl:text-3xl 3xl:text-4xl font-semibold tracking-tight">Meetings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {allMeetings.length} meetings · {allMeetings.filter((m) => m.status === "completed").length} transcribed
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
            transcribeStartTime={m.transcribeStartTime}
            whisperModel={m.whisperModel}
            whisperDevice={m.whisperDevice}
            onDelete={handleDeleteMeeting}
          />
        ))}
        {filtered.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg bg-secondary/10">
            <FileSearch className="h-8 w-8 text-muted-foreground/50 mb-3" />
            <h3 className="text-sm font-medium text-foreground">No meetings found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {allMeetings.length === 0
                ? "Drop a file above to get started, or import from Excel in Settings."
                : "No meetings match your current search or filter criteria."}
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
