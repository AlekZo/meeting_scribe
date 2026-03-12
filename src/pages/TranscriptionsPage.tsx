import { useState } from "react";
import { MeetingPlayer } from "@/components/MeetingPlayer";
import { TranscriptSegment } from "@/components/MeetingPlayer";
import { sampleMeetings } from "@/data/meetings";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TranscriptionsPage() {
  const navigate = useNavigate();
  const completed = sampleMeetings.filter((m) => m.status === "completed" && m.segments.length > 0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = completed[selectedIndex];

  const [segments, setSegments] = useState<TranscriptSegment[]>(selected?.segments ?? []);

  const handleSelect = (idx: number) => {
    setSelectedIndex(idx);
    setSegments(completed[idx]?.segments ?? []);
  };

  const handleSpeakerRename = (oldName: string, newName: string) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.speaker === oldName ? { ...seg, speaker: newName } : seg
      )
    );
  };

  if (!selected) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        No completed transcriptions yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transcriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Play recordings and follow along with synced transcripts
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <MeetingPlayer
          title={selected.title}
          date={`${selected.date} · ${selected.duration}`}
          mediaType={selected.mediaType}
          segments={segments}
          onSpeakerRename={handleSpeakerRename}
        />

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Completed ({completed.length})
          </h2>
          {completed.map((m, i) => (
            <button
              key={m.id}
              onClick={() => handleSelect(i)}
              className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                selectedIndex === i
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card hover:bg-secondary/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className={`h-4 w-4 ${selectedIndex === i ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-sm font-medium text-card-foreground">{m.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">{m.date} · {m.duration}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
