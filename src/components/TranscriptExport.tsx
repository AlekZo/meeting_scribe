import { TranscriptSegment } from "@/components/MeetingPlayer";
import { FileText, Subtitles, Braces, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function segmentsToTxt(segments: TranscriptSegment[], title?: string): string {
  const lines: string[] = [];
  if (title) {
    lines.push(title);
    lines.push("=".repeat(title.length));
    lines.push("");
  }
  let currentSpeaker = "";
  for (const seg of segments) {
    if (seg.speaker !== currentSpeaker) {
      if (currentSpeaker) lines.push("");
      currentSpeaker = seg.speaker;
      lines.push(`[${formatTime(seg.startTime)}] ${seg.speaker}:`);
    }
    lines.push(seg.text);
  }
  return lines.join("\n");
}

function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatSrtTime(seg.startTime)} --> ${formatSrtTime(seg.endTime)}\n${seg.speaker}: ${seg.text}\n`
    )
    .join("\n");
}

function segmentsToJson(segments: TranscriptSegment[], title?: string): string {
  return JSON.stringify(
    {
      title: title || "Untitled",
      segments: segments.map((seg) => ({
        speaker: seg.speaker,
        start: seg.startTime,
        end: seg.endTime,
        text: seg.text,
      })),
    },
    null,
    2
  );
}

interface TranscriptExportProps {
  segments: TranscriptSegment[];
  title?: string;
}

export function TranscriptExport({ segments, title }: TranscriptExportProps) {
  const [copied, setCopied] = useState(false);

  if (segments.length === 0) return null;

  const safeTitle = (title || "transcript").replace(/[^a-zA-Z0-9_-]/g, "_");

  const copyToClipboard = async () => {
    const text = segmentsToTxt(segments, title);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={copyToClipboard}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied!" : "Copy"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => downloadFile(segmentsToTxt(segments, title), `${safeTitle}.txt`, "text/plain")}
      >
        <FileText className="h-3.5 w-3.5" />
        TXT
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => downloadFile(segmentsToJson(segments, title), `${safeTitle}.json`, "application/json")}
      >
        <Braces className="h-3.5 w-3.5" />
        JSON
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => downloadFile(segmentsToSrt(segments), `${safeTitle}.srt`, "text/srt")}
      >
        <Subtitles className="h-3.5 w-3.5" />
        SRT
      </Button>
    </div>
  );
}
