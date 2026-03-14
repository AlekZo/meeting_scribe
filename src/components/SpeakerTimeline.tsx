import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { TranscriptSegment } from "@/components/MeetingPlayer";

const SPEAKER_COLORS = [
  "bg-primary",
  "bg-info",
  "bg-warning",
  "bg-destructive",
  "bg-purple-400",
  "bg-pink-400",
];

interface SpeakerTimelineProps {
  segments: TranscriptSegment[];
  totalDuration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  meetingDate?: string;
}

/** Parse an ISO-ish date string and return a Date, or undefined */
function parseMeetingStart(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  } catch {}
  return undefined;
}

/** Format seconds offset from a start Date into HH:MM */
function formatClockTime(start: Date, offsetSec: number): string {
  const d = new Date(start.getTime() + offsetSec * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Format seconds as mm:ss or h:mm:ss */
function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Generate evenly-spaced tick positions */
function generateTicks(totalDuration: number, maxTicks = 6): number[] {
  if (totalDuration <= 0) return [];
  const interval = Math.ceil(totalDuration / maxTicks / 60) * 60; // round to nearest minute
  const ticks: number[] = [0];
  let t = interval;
  while (t < totalDuration) {
    ticks.push(t);
    t += interval;
  }
  if (ticks[ticks.length - 1] < totalDuration - interval * 0.3) {
    ticks.push(totalDuration);
  }
  return ticks;
}

export function SpeakerTimeline({ segments, totalDuration, currentTime, onSeek, meetingDate }: SpeakerTimelineProps) {
  const speakers = useMemo(() => Array.from(new Set(segments.map((s) => s.speaker))), [segments]);
  const meetingStart = useMemo(() => parseMeetingStart(meetingDate), [meetingDate]);
  const ticks = useMemo(() => generateTicks(totalDuration), [totalDuration]);

  if (segments.length === 0 || totalDuration === 0) return null;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(totalDuration, pct * totalDuration)));
  };

  const playheadPct = (currentTime / totalDuration) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Speaker Timeline</span>
          {meetingStart && (
            <span className="text-[10px] font-mono text-primary/80">
              {formatClockTime(meetingStart, currentTime)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {speakers.map((speaker, i) => (
            <div key={speaker} className="flex items-center gap-1">
              <div className={cn("h-2 w-2 rounded-full", SPEAKER_COLORS[i % SPEAKER_COLORS.length])} />
              <span className="text-[10px] font-mono text-muted-foreground">{speaker}</span>
            </div>
          ))}
        </div>
      </div>
      <div
        className="relative h-8 rounded-md bg-secondary/40 cursor-pointer overflow-hidden border border-border"
        onClick={handleClick}
      >
        {segments.map((seg, i) => {
          const left = (seg.startTime / totalDuration) * 100;
          const width = ((seg.endTime - seg.startTime) / totalDuration) * 100;
          const speakerIdx = speakers.indexOf(seg.speaker);
          return (
            <div
              key={i}
              className={cn(
                "absolute top-0.5 bottom-0.5 rounded-sm opacity-70 hover:opacity-100 transition-opacity",
                SPEAKER_COLORS[speakerIdx % SPEAKER_COLORS.length]
              )}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
              title={`${seg.speaker}: ${seg.text.slice(0, 60)}...`}
            />
          );
        })}
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground z-10 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
      {/* Time markers */}
      {ticks.length > 1 && (
        <div className="relative h-4">
          {ticks.map((t) => {
            const pct = (t / totalDuration) * 100;
            return (
              <span
                key={t}
                className="absolute text-[9px] font-mono text-muted-foreground -translate-x-1/2"
                style={{ left: `${Math.min(Math.max(pct, 2), 98)}%` }}
              >
                {meetingStart ? formatClockTime(meetingStart, t) : formatElapsed(t)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
