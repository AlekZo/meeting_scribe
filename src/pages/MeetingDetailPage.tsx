import { useParams, useNavigate } from "react-router-dom";
import { useState, useCallback } from "react";
import { sampleMeetings } from "@/data/meetings";
import { MeetingPlayer, TranscriptSegment } from "@/components/MeetingPlayer";
import { ProcessingPipeline, PipelineStage } from "@/components/ProcessingPipeline";
import { TranscriptExport } from "@/components/TranscriptExport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  RefreshCw,
  XCircle,
  Sparkles,
  Pencil,
  Check,
  X,
  FileVideo,
  FileAudio,
  HardDrive,
  Clock,
  Users,
  Link2,
} from "lucide-react";

const statusToPipeline: Record<string, PipelineStage> = {
  pending: "queued",
  transcribing: "transcribing",
  completed: "completed",
  error: "failed",
};

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const meeting = sampleMeetings.find((m) => m.id === id);

  const [segments, setSegments] = useState<TranscriptSegment[]>(
    meeting?.segments ?? []
  );
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  const [calendarUrl, setCalendarUrl] = useState(meeting?.calendarEventUrl ?? "");
  const [isEditingCal, setIsEditingCal] = useState(false);
  const [editCalValue, setEditCalValue] = useState("");

  const handleSpeakerRename = useCallback((oldName: string, newName: string) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.speaker === oldName ? { ...seg, speaker: newName } : seg
      )
    );
  }, []);

  const startEditTitle = () => {
    setEditTitleValue(title);
    setIsEditingTitle(true);
  };
  const confirmTitle = () => {
    if (editTitleValue.trim()) setTitle(editTitleValue.trim());
    setIsEditingTitle(false);
  };

  const startEditCal = () => {
    setEditCalValue(calendarUrl);
    setIsEditingCal(true);
  };
  const confirmCal = () => {
    setCalendarUrl(editCalValue.trim());
    setIsEditingCal(false);
  };

  if (!meeting) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">Meeting not found</p>
        <Button variant="outline" onClick={() => navigate("/meetings")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Meetings
        </Button>
      </div>
    );
  }

  const pipelineStage = statusToPipeline[meeting.status] || "queued";

  // Compute metadata
  const speakerCount = new Set(segments.map((s) => s.speaker)).size;
  const wordCount = segments.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
  const totalSegments = segments.length;

  // Parse duration string to get a rough file size estimate
  const durationParts = meeting.duration.split(":").map(Number);
  const durationSec =
    durationParts.length === 3
      ? durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]
      : durationParts[0] * 60 + (durationParts[1] || 0);
  const estimatedSizeMB =
    meeting.mediaType === "video"
      ? (durationSec * 2.5).toFixed(0) // ~2.5 MB/s for video
      : (durationSec * 0.125).toFixed(1); // ~1 Mbps for audio

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate(-1)}
            className="mt-1 flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              {isEditingTitle ? (
                <form onSubmit={(e) => { e.preventDefault(); confirmTitle(); }} className="flex items-center gap-2">
                  <Input
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    className="h-8 text-xl font-semibold bg-background w-72"
                    autoFocus
                    onBlur={confirmTitle}
                  />
                  <button type="submit" className="text-primary"><Check className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setIsEditingTitle(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
                </form>
              ) : (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                  <button onClick={startEditTitle} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {meeting.mediaType === "video" ? (
                <span className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-info">Video</span>
              ) : (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-primary">Audio</span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="font-mono">{meeting.date}</span>
              <span className="font-mono">{meeting.duration}</span>
              <span className="rounded bg-secondary px-2 py-0.5 text-xs font-mono">{meeting.source}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditingCal ? (
            <form onSubmit={(e) => { e.preventDefault(); confirmCal(); }} className="flex items-center gap-2">
              <Input
                value={editCalValue}
                onChange={(e) => setEditCalValue(e.target.value)}
                className="h-8 text-xs bg-background w-72 font-mono"
                placeholder="https://calendar.google.com/..."
                autoFocus
                onBlur={confirmCal}
              />
              <button type="submit" className="text-primary"><Check className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setIsEditingCal(false)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
            </form>
          ) : calendarUrl ? (
            <div className="flex items-center gap-1.5">
              <a
                href={calendarUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" />
                Google Calendar
                <ExternalLink className="h-3 w-3" />
              </a>
              <button onClick={startEditCal} className="text-muted-foreground hover:text-foreground transition-colors">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={startEditCal}
              className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />
              Link Calendar Event
            </button>
          )}
        </div>
      </div>

      {/* Media Metadata */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          {meeting.mediaType === "video" ? <FileVideo className="h-4 w-4 text-info" /> : <FileAudio className="h-4 w-4 text-primary" />}
          <span className="text-muted-foreground">Type:</span>
          <span className="font-mono text-card-foreground">{meeting.mediaType === "video" ? "Video" : "Audio"}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Duration:</span>
          <span className="font-mono text-card-foreground">{meeting.duration}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2 text-sm">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Est. Size:</span>
          <span className="font-mono text-card-foreground">~{estimatedSizeMB} MB</span>
        </div>
        {speakerCount > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Speakers:</span>
              <span className="font-mono text-card-foreground">{speakerCount}</span>
            </div>
          </>
        )}
        {totalSegments > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Segments:</span>
              <span className="font-mono text-card-foreground">{totalSegments}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Words:</span>
              <span className="font-mono text-card-foreground">{wordCount.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {/* Pipeline */}
      <ProcessingPipeline
        currentStage={pipelineStage}
        failedStage={meeting.status === "error" ? "transcribing" : undefined}
      />

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {meeting.status === "error" && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry (GPU)
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry (CPU)
              </Button>
            </>
          )}
          {meeting.status === "transcribing" && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
          {segments.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Identify Speakers (AI)
            </Button>
          )}
        </div>
        <TranscriptExport segments={segments} title={title} />
      </div>

      {/* Player */}
      <MeetingPlayer
        title={title}
        date={`${meeting.date} · ${meeting.duration}`}
        mediaType={meeting.mediaType}
        segments={segments}
        onSpeakerRename={handleSpeakerRename}
      />
    </div>
  );
}
