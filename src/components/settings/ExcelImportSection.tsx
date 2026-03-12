import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { loadMeetings, saveMeetings, saveMeetingOverride } from "@/lib/storage";
import type { Meeting } from "@/data/meetings";
import * as XLSX from "xlsx";

interface ParsedRow {
  date: string;
  title: string;
  meetingType: string;
  speakers: string[];
  summary: string;
  tags: string[];
  videoUrl: string;
  scriberrUrl: string;
  googleDocUrl: string;
  status: string;
}

function parseExcelDate(val: any): string {
  if (!val) return new Date().toISOString().split("T")[0];
  // Excel serial number
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  // String date
  const str = String(val).trim();
  // Try ISO
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  // Try DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    // Assume M/D/Y
    return `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }
  return str.slice(0, 10);
}

function parseSpeakers(val: any): string[] {
  if (!val) return [];
  return String(val)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSummary(val: any): string {
  if (!val) return "";
  let raw = String(val).trim();
  // Try extracting summary from JSON-like content
  try {
    // Clean up: handle unquoted keys
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned.replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
    if (parsed.summary) return parsed.summary;
  } catch {
    // Try regex extract
    const match = raw.match(/summary[:\s]*["']?(.+?)["']?\s*[,}]/s);
    if (match) return match[1].trim();
  }
  return raw.slice(0, 500);
}

function parseStatus(val: any): Meeting["status"] {
  if (!val) return "completed";
  const s = String(val).toLowerCase().trim();
  if (s.includes("process") || s.includes("transcrib")) return "transcribing";
  if (s.includes("pend") || s.includes("queue")) return "pending";
  if (s.includes("error") || s.includes("fail")) return "error";
  return "completed";
}

// Column name mapping (flexible)
const COL_MAP: Record<string, string[]> = {
  date: ["date & time", "date", "datetime", "дата", "дата и время"],
  title: ["meeting name", "title", "name", "название", "имя встречи"],
  meetingType: ["meeting type", "type", "тип", "тип встречи"],
  speakers: ["speakers", "speaker", "спикеры", "участники"],
  summary: ["summary", "описание", "резюме", "саммари"],
  tags: ["project tag", "tags", "tag", "тег", "теги", "проект"],
  videoUrl: ["video source link", "video link", "video url", "видео"],
  scriberrUrl: ["scribber link", "scriberr link", "scriberr", "scribber"],
  googleDocUrl: ["transcript drive doc", "google doc", "doc link", "документ"],
  status: ["status", "статус"],
};

function findColumn(headers: string[], field: string): number {
  const aliases = COL_MAP[field] ?? [field];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (aliases.some((a) => h.includes(a))) return i;
  }
  return -1;
}

function rowToMeeting(row: any[], headers: string[], index: number): Meeting | null {
  const get = (field: string) => {
    const idx = findColumn(headers, field);
    return idx >= 0 ? row[idx] : undefined;
  };

  const title = get("title");
  if (!title) return null;

  const date = parseExcelDate(get("date"));
  const speakers = parseSpeakers(get("speakers"));
  const summary = parseSummary(get("summary"));
  const tags = get("tags") ? String(get("tags")).split(",").map((t: string) => t.trim()).filter(Boolean) : [];

  const meeting: Meeting = {
    id: `import_${Date.now()}_${index}`,
    title: String(title).trim(),
    date,
    duration: "0:00",
    status: parseStatus(get("status")),
    source: "Upload",
    mediaType: "video",
    meetingType: get("meetingType") ? String(get("meetingType")).trim() : undefined,
    tags,
    summary: summary || undefined,
    segments: speakers.map((sp, i) => ({
      speaker: sp,
      startTime: i * 10,
      endTime: (i + 1) * 10,
      text: "",
    })),
  };

  return meeting;
}

export default function ExcelImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; fileName: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [rawData, setRawData] = useState<{ headers: string[]; rows: any[][] } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (data.length < 2) {
        toast.error("File has no data rows");
        return;
      }

      const headers = data[0].map((h: any) => String(h));
      const rows = data.slice(1).filter((r) => r.some((c: any) => c !== ""));

      setRawData({ headers, rows });

      // Parse preview
      const parsed: ParsedRow[] = rows.slice(0, 100).map((row) => {
        const get = (field: string) => {
          const idx = findColumn(headers, field);
          return idx >= 0 ? row[idx] : undefined;
        };
        return {
          date: parseExcelDate(get("date")),
          title: String(get("title") ?? "").trim(),
          meetingType: String(get("meetingType") ?? "").trim(),
          speakers: parseSpeakers(get("speakers")),
          summary: parseSummary(get("summary")).slice(0, 80),
          tags: get("tags") ? String(get("tags")).split(",").map((t: string) => t.trim()).filter(Boolean) : [],
          videoUrl: String(get("videoUrl") ?? "").trim(),
          scriberrUrl: String(get("scriberrUrl") ?? "").trim(),
          googleDocUrl: String(get("googleDocUrl") ?? "").trim(),
          status: String(get("status") ?? "").trim(),
        };
      });

      setPreview({ rows: parsed, fileName: file.name });
    } catch (err) {
      toast.error("Failed to parse Excel file");
      console.error(err);
    }
    // Reset input
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = () => {
    if (!rawData) return;
    setImporting(true);

    try {
      const existing = loadMeetings();
      const newMeetings: Meeting[] = [];

      rawData.rows.forEach((row, i) => {
        const m = rowToMeeting(row, rawData.headers, i);
        if (m) {
          newMeetings.push(m);
          // Store extra links as overrides
          const get = (field: string) => {
            const idx = findColumn(rawData.headers, field);
            return idx >= 0 ? row[idx] : undefined;
          };
          const videoUrl = get("videoUrl") ? String(get("videoUrl")).trim() : "";
          const scriberrUrl = get("scriberrUrl") ? String(get("scriberrUrl")).trim() : "";
          const googleDocUrl = get("googleDocUrl") ? String(get("googleDocUrl")).trim() : "";
          if (videoUrl) saveMeetingOverride(m.id, "videoUrl", videoUrl);
          if (scriberrUrl) saveMeetingOverride(m.id, "scriberrUrl", scriberrUrl);
          if (googleDocUrl) saveMeetingOverride(m.id, "googleDocUrl", googleDocUrl);
        }
      });

      saveMeetings([...existing, ...newMeetings]);
      toast.success(`Imported ${newMeetings.length} meetings`);
      setPreview(null);
      setRawData(null);
    } catch (err) {
      toast.error("Import failed");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-success" />
        <h2 className="text-base font-medium">Import from Excel</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Import meetings from an Excel (.xlsx) file. Expected columns: Date & Time, Meeting Name, Meeting Type, Speakers, Summary, Project Tag, Video Source Link, Scribber Link, Transcript Drive Doc, Status
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFile}
        className="hidden"
      />

      {!preview ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Select Excel File
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-3.5 w-3.5 text-success" />
              <span className="text-sm font-medium">{preview.fileName}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {preview.rows.length} meeting{preview.rows.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() => { setPreview(null); setRawData(null); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Preview table */}
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-secondary">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Speakers</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Tags</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Links</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">{row.date}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate">{row.title}</td>
                    <td className="px-2 py-1.5">
                      {row.meetingType && (
                        <span className="rounded bg-info/15 px-1.5 py-0.5 text-[9px] font-medium text-info">{row.meetingType}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.speakers.length}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        {row.tags.slice(0, 2).map((t) => (
                          <span key={t} className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-mono">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      {row.status.toLowerCase().includes("process") ? (
                        <span className="text-info">●</span>
                      ) : (
                        <span className="text-success">●</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        {row.videoUrl && <span className="text-[9px] text-muted-foreground" title={row.videoUrl}>🎬</span>}
                        {row.scriberrUrl && <span className="text-[9px] text-muted-foreground" title={row.scriberrUrl}>📝</span>}
                        {row.googleDocUrl && <span className="text-[9px] text-muted-foreground" title={row.googleDocUrl}>📄</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-2" onClick={handleImport} disabled={importing}>
              {importing ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Import {preview.rows.length} Meetings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPreview(null); setRawData(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
