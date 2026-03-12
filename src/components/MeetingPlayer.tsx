import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  User,
  Pencil,
  Check,
  Video,
  Music,
  ChevronsDown,
  Search,
  X,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { SpeakerTimeline } from "@/components/SpeakerTimeline";

export interface TranscriptSegment {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface MeetingPlayerProps {
  title: string;
  date: string;
  mediaSrc?: string;
  mediaType?: "audio" | "video";
  segments: TranscriptSegment[];
  onSpeakerRename?: (oldName: string, newName: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchResultCount?: number;
}

function HighlightedText({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-warning/30 text-foreground rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function getSpeakerColorIndex(speaker: string, allSpeakers: string[]): number {
  return allSpeakers.indexOf(speaker) % 6;
}

const colorClasses = [
  { text: "text-primary", bg: "bg-primary/10" },
  { text: "text-info", bg: "bg-info/10" },
  { text: "text-warning", bg: "bg-warning/10" },
  { text: "text-destructive", bg: "bg-destructive/10" },
  { text: "text-purple-400", bg: "bg-purple-400/10" },
  { text: "text-pink-400", bg: "bg-pink-400/10" },
];

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function MeetingPlayer({ title, date, mediaSrc, mediaType = "audio", segments, onSpeakerRename, searchQuery, onSearchChange, searchResultCount }: MeetingPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Scrubbing state — prevents slider thumb fighting
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(true);
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unique speakers for consistent coloring
  const allSpeakers = Array.from(new Set(segments.map((s) => s.speaker)));

  useEffect(() => {
    const idx = segments.findIndex(
      (s) => currentTime >= s.startTime && currentTime < s.endTime
    );
    if (idx !== activeIndex) setActiveIndex(idx);
  }, [currentTime, segments, activeIndex]);

  // Auto-scroll to active segment (only if autoScroll is enabled)
  useEffect(() => {
    if (!autoScroll) return;
    if (activeSegmentRef.current && transcriptRef.current) {
      const container = transcriptRef.current;
      const el = activeSegmentRef.current;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeIndex, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleTranscriptScroll = useCallback(() => {
    if (!autoScroll) return;
    // Debounce — only disable if user is actively scrolling (not programmatic)
    userScrolledRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (userScrolledRef.current) {
        setAutoScroll(false);
        userScrolledRef.current = false;
      }
    }, 150);
  }, [autoScroll]);

  const handleTimeUpdate = useCallback(() => {
    if (mediaRef.current && !isScrubbing) setCurrentTime(mediaRef.current.currentTime);
  }, [isScrubbing]);

  const handleLoadedMetadata = useCallback(() => {
    if (mediaRef.current) setDuration(mediaRef.current.duration);
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  const togglePlay = () => {
    if (!mediaRef.current) {
      setIsPlaying((p) => !p);
      return;
    }
    if (isPlaying) mediaRef.current.pause();
    else mediaRef.current.play();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekTo(Math.max(0, currentTime - 5));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(Math.min(duration, currentTime + 5));
          break;
        case "m":
        case "M":
          setIsMuted((prev) => {
            const next = !prev;
            if (mediaRef.current) mediaRef.current.muted = next;
            return next;
          });
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Demo playback — use wall-clock time to prevent drift
  const demoDuration = segments.length > 0 ? segments[segments.length - 1].endTime + 5 : 60;
  useEffect(() => {
    if (!mediaSrc && isPlaying && !isScrubbing) {
      if (duration === 0) setDuration(demoDuration);
      const startWall = Date.now();
      const startOffset = currentTime;
      const interval = setInterval(() => {
        const elapsed = (Date.now() - startWall) / 1000;
        const newTime = startOffset + elapsed;
        if (newTime >= demoDuration) {
          setIsPlaying(false);
          setCurrentTime(0);
        } else {
          setCurrentTime(newTime);
        }
      }, 250);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaSrc, isPlaying, segments, isScrubbing]);

  const seekTo = (time: number) => {
    setCurrentTime(time);
    if (mediaRef.current) mediaRef.current.currentTime = time;
  };

  // Scrubbing handlers
  const handleSeekChange = (val: number[]) => {
    setIsScrubbing(true);
    setScrubTime(val[0]);
  };

  const handleSeekCommit = (val: number[]) => {
    setIsScrubbing(false);
    seekTo(val[0]);
  };

  const handleVolume = (val: number[]) => {
    setVolume(val[0]);
    setIsMuted(val[0] === 0);
    if (mediaRef.current) mediaRef.current.volume = val[0] / 100;
  };

  const skip = (delta: number) => seekTo(Math.max(0, Math.min(duration, currentTime + delta)));

  const startRename = (speaker: string) => {
    setEditingSpeaker(speaker);
    setEditValue(speaker);
  };

  const confirmRename = () => {
    if (editingSpeaker && editValue.trim() && editValue.trim() !== editingSpeaker) {
      onSpeakerRename?.(editingSpeaker, editValue.trim());
    }
    setEditingSpeaker(null);
    setEditValue("");
  };

  const totalDuration = duration || (segments.length > 0 ? segments[segments.length - 1].endTime + 5 : 0);
  const displayTime = isScrubbing ? scrubTime : currentTime;

  // Memoize grouped segments to avoid re-rendering on every currentTime tick
  const groupedSegments = useMemo(() => {
    const groups: { speaker: string; segments: (TranscriptSegment & { index: number })[] }[] = [];
    segments.forEach((seg, i) => {
      const last = groups[groups.length - 1];
      if (last && last.speaker === seg.speaker) {
        last.segments.push({ ...seg, index: i });
      } else {
        groups.push({ speaker: seg.speaker, segments: [{ ...seg, index: i }] });
      }
    });
    return groups;
  }, [segments]);

  const isVideo = mediaType === "video";

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden" tabIndex={0} role="region" aria-label="Media player">
      {/* Video area */}
      {isVideo && (
        <div className="relative aspect-video bg-background flex items-center justify-center">
          {mediaSrc ? (
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={mediaSrc}
              className="h-full w-full"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={handlePlay}
              onPause={handlePause}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Video className="h-12 w-12" />
              <span className="text-sm font-mono">Video Player — Demo Mode</span>
            </div>
          )}
        </div>
      )}

      {/* Audio element (hidden) */}
      {!isVideo && mediaSrc && (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={mediaSrc}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
        />
      )}

      {/* Audio visual indicator when no video */}
      {!isVideo && !mediaSrc && (
        <div className="flex items-center justify-center gap-3 bg-secondary/20 py-6 text-muted-foreground">
          <Music className="h-8 w-8" />
          <span className="text-sm font-mono">Audio Player — Demo Mode</span>
        </div>
      )}

      {/* Player controls */}
      <div className="border-b border-border bg-secondary/30 px-5 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-card-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground font-mono">{date}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-mono uppercase",
              isVideo ? "bg-info/10 text-info" : "bg-primary/10 text-primary"
            )}>
              {isVideo ? "Video" : "Audio"}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatTime(displayTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        </div>

        <Slider
          value={[displayTime]}
          max={totalDuration || 100}
          step={0.5}
          onValueChange={handleSeekChange}
          onValueCommit={handleSeekCommit}
          className="cursor-pointer"
        />

        {/* Speaker Timeline */}
        <SpeakerTimeline
          segments={segments}
          totalDuration={totalDuration}
          currentTime={displayTime}
          onSeek={seekTo}
          meetingDate={date}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={() => skip(-10)} title="Rewind 10s (←)" className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
              <SkipBack className="h-4 w-4" />
            </button>
            <button onClick={togglePlay} title={isPlaying ? "Pause (Space)" : "Play (Space)"} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <button onClick={() => skip(10)} title="Forward 10s (→)" className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
              <SkipForward className="h-4 w-4" />
            </button>
            <span className="hidden lg:inline text-[9px] text-muted-foreground/50 font-mono ml-1">Space · ← → · M</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Transcript search */}
            {onSearchChange && segments.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery ?? ""}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search transcript..."
                    className="h-7 w-40 pl-7 pr-7 text-[11px] bg-background"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => onSearchChange("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                {searchResultCount !== undefined && searchQuery && (
                  <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                    {searchResultCount} found
                  </span>
                )}
              </div>
            )}

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const next = !isMuted;
                setIsMuted(next);
                if (mediaRef.current) mediaRef.current.muted = next;
              }} className="text-muted-foreground hover:text-foreground transition-colors">
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <div className="w-20">
                <Slider value={[isMuted ? 0 : volume]} max={100} step={1} onValueChange={handleVolume} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Speaker legend with rename */}
      {allSpeakers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5 bg-secondary/10">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Speakers:</span>
          {allSpeakers.map((speaker, idx) => {
            const ci = getSpeakerColorIndex(speaker, allSpeakers);
            const colors = colorClasses[ci];
            const isEditing = editingSpeaker === speaker;
            return (
              <div key={`speaker-${idx}`} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1", colors.bg)}>
                <User className={cn("h-3 w-3", colors.text)} />
                {isEditing ? (
                  <form onSubmit={(e) => { e.preventDefault(); confirmRename(); }} className="flex items-center gap-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-5 w-24 border-0 bg-transparent px-1 py-0 text-xs font-medium focus-visible:ring-0"
                      autoFocus
                      onBlur={confirmRename}
                    />
                    <button type="submit" className={cn("h-3.5 w-3.5", colors.text)}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span onDoubleClick={() => startRename(speaker)} className={cn("text-xs font-medium cursor-pointer", colors.text)} title="Double-click to rename">{speaker}</span>
                    <button onClick={() => startRename(speaker)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Transcript */}
      <div className="relative">
        {/* Auto-scroll resume button */}
        {!autoScroll && isPlaying && (
          <button
            onClick={() => setAutoScroll(true)}
            className="absolute top-2 right-4 z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[10px] font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
          >
            <ChevronsDown className="h-3 w-3" />
            Resume auto-scroll
          </button>
        )}
        <div
          ref={transcriptRef}
          onScroll={isPlaying ? handleTranscriptScroll : undefined}
          className="max-h-[420px] 2xl:max-h-[560px] 3xl:max-h-[720px] overflow-y-auto scroll-smooth"
        >
          {segments.length === 0 && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              No transcript available yet
            </div>
          )}
          {groupedSegments.map((group, gi) => (
            <div key={gi} className="border-b border-border last:border-0">
              {group.segments.map((seg) => {
                const isActive = seg.index === activeIndex;
                const ci = getSpeakerColorIndex(seg.speaker, allSpeakers);
                const colors = colorClasses[ci];
                return (
                  <div
                    key={seg.index}
                    ref={isActive ? activeSegmentRef : undefined}
                    onClick={() => seekTo(seg.startTime)}
                    className={cn(
                      "flex gap-4 px-5 py-2.5 cursor-pointer transition-all duration-200",
                      isActive
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : "border-l-2 border-l-transparent hover:bg-secondary/30"
                    )}
                  >
                    <div className="flex w-28 shrink-0 items-start gap-2 pt-0.5">
                      {seg.index === group.segments[0].index ? (
                        <>
                          <div className={cn("flex h-5 w-5 items-center justify-center rounded-full", colors.bg)}>
                            <User className={cn("h-3 w-3", colors.text)} />
                          </div>
                          <span className={cn("text-xs font-medium truncate", colors.text)}>
                            {seg.speaker}
                          </span>
                        </>
                      ) : (
                        <div className="w-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-relaxed transition-colors duration-200", isActive ? "text-foreground" : "text-muted-foreground")}>
                        <HighlightedText text={seg.text} query={searchQuery} />
                      </p>
                    </div>
                    <div className="flex w-14 shrink-0 items-start justify-end pt-0.5">
                      <span className={cn("text-[10px] font-mono transition-colors", isActive ? "text-primary" : "text-muted-foreground/60")}>
                        {formatTime(seg.startTime)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
