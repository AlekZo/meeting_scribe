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
}

export function SpeakerTimeline({ segments, totalDuration, currentTime, onSeek }: SpeakerTimelineProps) {
  const speakers = useMemo(() => Array.from(new Set(segments.map((s) => s.speaker))), [segments]);

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
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Speaker Timeline</span>
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
    </div>
  );
}
