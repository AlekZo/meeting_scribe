import { useParams, useNavigate, NavLink } from "react-router-dom";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { MeetingCategory, ActionItem, TagRule } from "@/data/meetings";
import { loadMeetings, loadMeetingOverrides, saveMeetingOverride, loadTranscriptSegments, loadSetting } from "@/lib/storage";
import { getAudioUrl } from "@/lib/scriberr";
import { autoTag } from "@/lib/auto-tagger";
import { meetingIdFromSlug, meetingSlug, cn } from "@/lib/utils";
import { callOpenRouter, callOpenRouterStreaming, trackMeetingUsage, getOpenRouterKey, getMeetingUsage, AIUsage, MissingApiKeyError, estimateCallCost, COST_WARNING_THRESHOLD } from "@/lib/openrouter";
import { toast } from "sonner";
import { MeetingPlayer, TranscriptSegment } from "@/components/MeetingPlayer";
import { ProcessingPipeline, PipelineStage } from "@/components/ProcessingPipeline";
import { TranscriptExport } from "@/components/TranscriptExport";
import { MeetingMetaMenu } from "@/components/MeetingMetaMenu";
import { MeetingSidebar } from "@/components/MeetingSidebar";
import { MeetingSummary } from "@/components/MeetingSummary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  FileText as FileTextIcon,
  ChevronRight,
  ChevronLeft,
  History,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Wand2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getModelForTask, getModelCatalog } from "@/lib/openrouter";

const statusToPipeline: Record<string, PipelineStage> = {
  pending: "queued",
  transcribing: "transcribing",
  completed: "completed",
  error: "failed",
};

// ── Editable field types ──
type EditableField = "title" | "date" | "duration" | "calUrl" | "docUrl" | null;

// ── Inline editable text component ──
function EditableText({
  value,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onConfirm,
  onCancel,
  className,
  inputClassName,
  placeholder,
  renderDisplay,
  type,
  validate,
}: {
  value: string;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  renderDisplay?: (value: string) => React.ReactNode;
  type?: string;
  validate?: (v: string) => boolean;
}) {
  const handleBlur = () => {
    const trimmed = editValue.trim();
    // If empty or invalid, treat blur as cancel
    if (!trimmed || (validate && !validate(trimmed))) {
      onCancel();
    } else {
      onConfirm();
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }} className="flex items-center gap-1">
        <Input
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          className={cn("h-7 text-xs bg-background font-mono px-1.5", inputClassName)}
          placeholder={placeholder}
          type={type}
          autoFocus
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        />
        <button type="submit" className="text-primary"><Check className="h-3 w-3" /></button>
        <button type="button" onClick={onCancel} className="text-muted-foreground"><X className="h-3 w-3" /></button>
      </form>
    );
  }

  return (
    <span
      onClick={onStartEdit}
      className={cn(
        "group/edit relative cursor-pointer rounded px-1 -mx-1 hover:bg-secondary/50 transition-colors inline-flex items-center gap-1",
        className
      )}
      title="Click to edit"
    >
      {renderDisplay ? renderDisplay(value) : value}
      <Pencil className="h-2.5 w-2.5 text-muted-foreground/30 group-hover/edit:text-muted-foreground transition-colors" />
    </span>
  );
}

// ── URL validator ──
function parseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export default function MeetingDetailPage() {
  const { id: slugParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const allMeetings = useMemo(() => loadMeetings(), []);

  const meeting = useMemo(() => {
    if (!slugParam) return undefined;
    // Direct match (exact slug = id)
    const direct = allMeetings.find((m) => String(m.id) === slugParam);
    if (direct) return direct;
    // Extract id from slug and match (use loose string comparison for numeric IDs)
    const extractedId = meetingIdFromSlug(slugParam);
    return allMeetings.find((m) => String(m.id) === extractedId);
  }, [allMeetings, slugParam]);
  const id = meeting?.id;
  const otherMeetings = allMeetings.filter((m) => m.id !== id);

  // Series navigation
  const seriesMeetings = useMemo(() => {
    if (!meeting) return [];
    const normalize = (t: string) =>
      t.replace(/\s*[-–—]\s*\d{4}[-/]\d{2}[-/]\d{2}.*$/, "")
        .replace(/\s*#\d+\s*$/, "")
        .replace(/\s*\(\d+\)\s*$/, "")
        .trim()
        .toLowerCase();
    const baseTitle = normalize(meeting.title);
    return allMeetings
      .filter((m) => {
        if (m.id === id) return false;
        const t = normalize(m.title);
        return (
          t === baseTitle ||
          m.title.toLowerCase() === meeting.title.toLowerCase() ||
          (baseTitle.length > 5 && (t.includes(baseTitle) || baseTitle.includes(t)))
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 50);
  }, [allMeetings, meeting, id]);

  const sortedSeries = useMemo(() => {
    if (!meeting || seriesMeetings.length === 0) return [];
    return [...seriesMeetings, meeting].sort((a, b) => a.date.localeCompare(b.date));
  }, [seriesMeetings, meeting]);

  const currentSeriesIdx = sortedSeries.findIndex((m) => m.id === id);
  const prevMeeting = currentSeriesIdx > 0 ? sortedSeries[currentSeriesIdx - 1] : null;
  const nextMeeting = currentSeriesIdx >= 0 && currentSeriesIdx < sortedSeries.length - 1 ? sortedSeries[currentSeriesIdx + 1] : null;

  // ── Consolidated form state ──
  const overrides = id ? loadMeetingOverrides(id) : {};
  const storedTranscript = id ? loadTranscriptSegments(id) : null;

  const [segments, setSegments] = useState<TranscriptSegment[]>(
    overrides.segments ?? storedTranscript ?? meeting?.segments ?? []
  );
  const safeSegments = segments || [];

  const [formData, setFormData] = useState({
    title: overrides.title ?? meeting?.title ?? "",
    date: overrides.date ?? meeting?.date ?? "",
    duration: overrides.duration ?? meeting?.duration ?? "",
    calUrl: overrides.calendarUrl ?? meeting?.calendarEventUrl ?? "",
    docUrl: overrides.googleDocUrl ?? "",
  });
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState("");

  const [category, setCategory] = useState<MeetingCategory | undefined>(
    overrides.category ?? meeting?.category
  );
  const [tags, setTags] = useState<string[]>(overrides.tags ?? meeting?.tags ?? []);

  // Auto-tag
  const typeRules = loadSetting<TagRule[]>("type_rules", []);
  const categoryRules = loadSetting<TagRule[]>("category_rules", []);
  const autoTagged = useMemo(
    () => safeSegments.length > 0 ? autoTag(safeSegments, typeRules, categoryRules) : { meetingType: undefined, autoCategories: [] },
    [safeSegments, typeRules, categoryRules]
  );

  const [meetingType, setMeetingType] = useState<string | undefined>(
    overrides.meetingType ?? meeting?.meetingType ?? autoTagged.meetingType
  );
  const [autoCategories, setAutoCategories] = useState<string[]>(
    overrides.autoCategories ?? meeting?.autoCategories ?? autoTagged.autoCategories
  );
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    overrides.actionItems ?? meeting?.actionItems ?? []
  );
  const [summary, setSummary] = useState<string | undefined>(overrides.summary ?? meeting?.summary);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [costEstimate, setCostEstimate] = useState<{ inputTokens: number; estimatedCost: number; modelLabel: string } | null>(null);

  // ── Editing helpers ──
  const startEdit = (field: EditableField) => {
    if (!field) return;
    setEditValue(formData[field]);
    setEditingField(field);
  };

  const confirmEdit = (field: EditableField) => {
    if (!field || editingField !== field) return;
    const val = editValue.trim();

    // URL fields need validation
    if (field === "calUrl" || field === "docUrl") {
      const parsed = parseUrl(val);
      if (parsed === null) {
        toast.error("Invalid URL format");
        return;
      }
      setFormData((prev) => ({ ...prev, [field]: parsed }));
      const storageKey = field === "calUrl" ? "calendarUrl" : "googleDocUrl";
      if (id) saveMeetingOverride(id, storageKey, parsed);
    } else {
      if (val) {
        setFormData((prev) => ({ ...prev, [field]: val }));
        if (id) saveMeetingOverride(id, field, val);
      }
    }
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  // ── Reset state on navigation ──
  useEffect(() => {
    const ov = id ? loadMeetingOverrides(id) : {};
    const stored = id ? loadTranscriptSegments(id) : null;
    const allM = loadMeetings();
    const m = allM.find((m) => String(m.id) === String(id));
    setSegments(ov.segments ?? stored ?? m?.segments ?? []);
    setFormData({
      title: ov.title ?? m?.title ?? "",
      date: ov.date ?? m?.date ?? "",
      duration: ov.duration ?? m?.duration ?? "",
      calUrl: ov.calendarUrl ?? m?.calendarEventUrl ?? "",
      docUrl: ov.googleDocUrl ?? "",
    });
    setCategory(ov.category ?? m?.category);
    setTags(ov.tags ?? m?.tags ?? []);
    setActionItems(ov.actionItems ?? m?.actionItems ?? []);
    setSummary(ov.summary ?? m?.summary);
    const segs = ov.segments ?? stored ?? m?.segments ?? [];
    const at = segs.length > 0 ? autoTag(segs, typeRules, categoryRules) : { meetingType: undefined, autoCategories: [] };
    setMeetingType(ov.meetingType ?? m?.meetingType ?? at.meetingType);
    setAutoCategories(ov.autoCategories ?? m?.autoCategories ?? at.autoCategories);
    setEditingField(null);
    setTranscriptSearch("");
  }, [id]);

  // ── Handlers ──
  const handleSpeakerRename = useCallback((oldName: string, newName: string) => {
    setSegments((prev) => {
      const updated = prev.map((seg) =>
        seg.speaker === oldName ? { ...seg, speaker: newName } : seg
      );
      if (id) saveMeetingOverride(id, "segments", updated);
      return updated;
    });
  }, [id]);

  const handleCategoryChange = (cat: MeetingCategory | undefined) => {
    setCategory(cat);
    if (id) saveMeetingOverride(id, "category", cat ?? null);
  };

  const handleTagsChange = (newTags: string[]) => {
    setTags(newTags);
    if (id) saveMeetingOverride(id, "tags", newTags);
  };

  const handleMeetingTypeChange = (type: string | undefined) => {
    setMeetingType(type);
    if (id) saveMeetingOverride(id, "meetingType", type ?? null);
  };

  const handleAutoCategoriesChange = (cats: string[]) => {
    setAutoCategories(cats);
    if (id) saveMeetingOverride(id, "autoCategories", cats);
  };

  const handleSuggestTitle = async () => {
    if (!safeSegments.length) return;
    setIsSuggestingTitle(true);
    try {
      const excerpt = safeSegments.slice(0, 30).map((s) => `[${s.speaker}]: ${s.text}`).join("\n");
      const result = await callOpenRouter("cleaning", [
        { role: "system", content: "You are a meeting title generator. Given a transcript excerpt, produce a short, descriptive meeting title (3-8 words). Reply with ONLY the title, no quotes, no explanation." },
        { role: "user", content: excerpt },
      ]);
      if (id) trackMeetingUsage(id, result.usage);
      const suggested = result.content.trim().replace(/^["']|["']$/g, "");
      if (suggested) {
        setFormData((prev) => ({ ...prev, title: suggested }));
        if (id) saveMeetingOverride(id, "title", suggested);
        toast.success(`Title suggested! (${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)})`);
      }
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) {
        toast.error("OpenRouter API key not configured.", {
          action: { label: "Go to Settings", onClick: () => navigate("/settings") },
        });
      } else {
        toast.error(e.message || "Failed to suggest title");
      }
    } finally {
      setIsSuggestingTitle(false);
    }
  };

  const handleGenerateSummary = async (skipCostCheck = false) => {
    if (!safeSegments.length) return;
    const transcript = safeSegments.map((s) => `[${s.speaker}]: ${s.text}`).join("\n");
    if (!skipCostCheck) {
      const estimate = estimateCallCost("summarization", transcript);
      if (estimate.estimatedCost > COST_WARNING_THRESHOLD) {
        setCostEstimate(estimate);
        return;
      }
    }
    setIsGenerating(true);
    try {
      const result = await callOpenRouterStreaming(
        "summarization",
        [
          {
            role: "system",
            content: `You are a meeting analyst. Given a transcript, produce a JSON object with:\n- "summary": a concise 2-4 sentence summary of the meeting\n- "actionItems": an array of objects with "assignee" (string) and "text" (string) for each action item discussed\n\nRespond ONLY with valid JSON, no markdown.`,
          },
          { role: "user", content: transcript },
        ],
        (streamedText) => setSummary(streamedText)
      );
      if (id) trackMeetingUsage(id, result.usage);
      try {
        const parsed = JSON.parse(result.content);
        const newSummary = parsed.summary ?? result.content;
        const newActions: ActionItem[] = (parsed.actionItems ?? []).map((a: any, i: number) => ({
          id: `gen_${Date.now()}_${i}`,
          assignee: a.assignee ?? "Unassigned",
          text: a.text ?? "",
          done: false,
        }));
        setSummary(newSummary);
        setActionItems(newActions);
        if (id) {
          saveMeetingOverride(id, "summary", newSummary);
          saveMeetingOverride(id, "actionItems", newActions);
        }
        toast.success(`Generated! Used ${result.usage.totalTokens.toLocaleString()} tokens ($${result.usage.estimatedCost.toFixed(4)})`);
      } catch {
        if (id) saveMeetingOverride(id, "summary", result.content);
        toast.success("Summary generated (could not parse action items)");
      }
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) {
        toast.error("OpenRouter API key not configured.", {
          action: { label: "Go to Settings", onClick: () => navigate("/settings") },
        });
      } else {
        toast.error(e.message || "Failed to generate summary");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleAction = (actionId: string, done: boolean) => {
    setActionItems((prev) => {
      const updated = prev.map((a) => (a.id === actionId ? { ...a, done } : a));
      if (id) saveMeetingOverride(id, "actionItems", updated);
      return updated;
    });
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
  const speakerCount = new Set(safeSegments.map((s) => s.speaker)).size;
  const wordCount = safeSegments.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
  const totalSegments = safeSegments.length;

  const durationParts = (meeting.duration || "0:00").split(":").map(Number);
  const durationSec =
    durationParts.length === 3
      ? (durationParts[0] || 0) * 3600 + (durationParts[1] || 0) * 60 + (durationParts[2] || 0)
      : durationParts.length === 2
        ? (durationParts[0] || 0) * 60 + (durationParts[1] || 0)
        : (durationParts[0] || 0);
  const safeDurationSec = isNaN(durationSec) ? 0 : durationSec;
  const estimatedSizeMB =
    safeDurationSec === 0
      ? "—"
      : meeting.mediaType === "video"
        ? (safeDurationSec * 2.5).toFixed(0)
        : (safeDurationSec * 0.125).toFixed(1);

  const filteredSegments = transcriptSearch
    ? safeSegments.filter((s) =>
        s.text.toLowerCase().includes(transcriptSearch.toLowerCase()) ||
        s.speaker.toLowerCase().includes(transcriptSearch.toLowerCase())
      )
    : safeSegments;

  const showPipeline = meeting.status !== "completed";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] 2xl:grid-cols-[1fr_320px] 3xl:grid-cols-[1fr_380px] gap-6 2xl:gap-8">
      {/* Main content */}
      <div className="space-y-6 2xl:space-y-8 min-w-0">
        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-5 pb-4 bg-background/95 backdrop-blur-sm border-b border-border">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-3">
            <NavLink to="/" className="hover:text-foreground transition-colors">Meetings</NavLink>
            <ChevronRight className="h-3 w-3" />
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium truncate max-w-[200px]">{formData.title}</span>
          </nav>

          <div className="flex items-start justify-between gap-4">
            {/* Left: Back + Title */}
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <button
                onClick={() => navigate(-1)}
                className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  {editingField === "title" ? (
                    <form onSubmit={(e) => { e.preventDefault(); confirmEdit("title"); }} className="flex items-center gap-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 text-xl font-semibold bg-background w-72"
                        autoFocus
                        onBlur={() => confirmEdit("title")}
                        onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                      />
                      <button type="submit" className="text-primary"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={cancelEdit} className="text-muted-foreground"><X className="h-4 w-4" /></button>
                    </form>
                  ) : (
                    <>
                      <h1
                        onClick={() => startEdit("title")}
                        className="text-2xl 2xl:text-3xl font-semibold tracking-tight cursor-pointer hover:text-primary/80 transition-colors group/title inline-flex items-center gap-2 truncate"
                        title="Click to edit"
                      >
                        {formData.title}
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground/30 group-hover/title:text-muted-foreground transition-colors shrink-0" />
                      </h1>
                      {safeSegments.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={handleSuggestTitle}
                                disabled={isSuggestingTitle}
                                className="flex items-center gap-1 shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                              >
                                {isSuggestingTitle ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                                AI Title
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs p-2.5 space-y-1">
                              <p className="text-xs">Suggest a meeting name from transcript</p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                Model: {getModelCatalog().find((m) => m.id === getModelForTask("cleaning"))?.label ?? getModelForTask("cleaning")}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </>
                  )}

                  {/* Media type badge */}
                  {meeting.mediaType === "video" ? (
                    <span className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-info shrink-0">Video</span>
                  ) : (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-primary shrink-0">Audio</span>
                  )}

                  {/* Series nav */}
                  {seriesMeetings.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              disabled={!prevMeeting}
                              onClick={() => prevMeeting && navigate(`/meetings/${meetingSlug(prevMeeting.title, prevMeeting.id)}`)}
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded border border-border transition-colors",
                                prevMeeting ? "text-muted-foreground hover:text-foreground hover:bg-secondary" : "text-muted-foreground/30 cursor-not-allowed"
                              )}
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          {prevMeeting && <TooltipContent side="bottom" className="text-xs">{prevMeeting.date}</TooltipContent>}
                        </Tooltip>
                      </TooltipProvider>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                            <History className="h-3 w-3" />
                            {currentSeriesIdx >= 0 ? `${currentSeriesIdx + 1}/${sortedSeries.length}` : `Series (${seriesMeetings.length + 1})`}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
                          <div className="px-3 py-1.5 border-b border-border">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                              Series · {sortedSeries.length} meetings
                            </p>
                          </div>
                          {sortedSeries.map((sm) => {
                            const isCurrent = sm.id === id;
                            return (
                              <DropdownMenuItem
                                key={sm.id}
                                onClick={() => !isCurrent && navigate(`/meetings/${meetingSlug(sm.title, sm.id)}`)}
                                className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer", isCurrent && "bg-primary/10")}
                              >
                                {sm.status === "completed" ? (
                                  <CheckCircle2 className={cn("h-3 w-3 shrink-0", isCurrent ? "text-primary" : "text-success")} />
                                ) : sm.status === "transcribing" ? (
                                  <Loader2 className="h-3 w-3 text-info animate-spin shrink-0" />
                                ) : sm.status === "error" ? (
                                  <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                                ) : (
                                  <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className={cn("text-xs font-mono", isCurrent && "text-primary font-medium")}>{sm.date}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground font-mono">{sm.duration}</span>
                                {isCurrent ? (
                                  <span className="text-[9px] text-primary font-medium">current</span>
                                ) : (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              disabled={!nextMeeting}
                              onClick={() => nextMeeting && navigate(`/meetings/${meetingSlug(nextMeeting.title, nextMeeting.id)}`)}
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded border border-border transition-colors",
                                nextMeeting ? "text-muted-foreground hover:text-foreground hover:bg-secondary" : "text-muted-foreground/30 cursor-not-allowed"
                              )}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          {nextMeeting && <TooltipContent side="bottom" className="text-xs">{nextMeeting.date}</TooltipContent>}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>

                {/* Source badge */}
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs font-mono">{meeting.source}</span>
                </div>
              </div>
            </div>

            {/* Right: Primary actions in header */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Error retry buttons */}
              {meeting.status === "error" && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry GPU
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry CPU
                  </Button>
                </>
              )}
              {meeting.status === "transcribing" && (
                <div className="ml-4 border-l border-border pl-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel transcription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will stop the current GPU transcription job. You'll need to re-upload the file to try again.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Running</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Cancel Transcription
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
              {safeSegments.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Identify Speakers</span>
                </Button>
              )}
              <TranscriptExport segments={safeSegments} title={formData.title} />
            </div>
          </div>
        </div>

        {/* ── Metadata Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
          {/* Left: Stats pill bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              {meeting.mediaType === "video" ? <FileVideo className="h-4 w-4 text-info" /> : <FileAudio className="h-4 w-4 text-primary" />}
              <span className="font-mono text-card-foreground">{meeting.mediaType === "video" ? "Video" : "Audio"}</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1.5 text-sm">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <EditableText
                value={formData.duration}
                isEditing={editingField === "duration"}
                editValue={editValue}
                onEditValueChange={setEditValue}
                onStartEdit={() => startEdit("duration")}
                onConfirm={() => confirmEdit("duration")}
                onCancel={cancelEdit}
                className="font-mono text-card-foreground"
                inputClassName="w-20"
                placeholder="1:23:45"
                validate={(v) => /^\d+:\d{2}(:\d{2})?$/.test(v)}
              />
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <EditableText
                value={formData.date}
                isEditing={editingField === "date"}
                editValue={editValue}
                onEditValueChange={setEditValue}
                onStartEdit={() => startEdit("date")}
                onConfirm={() => confirmEdit("date")}
                onCancel={cancelEdit}
                className="font-mono text-card-foreground"
                inputClassName="w-36"
                placeholder="2026-03-12"
                type="date"
                validate={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v)}
              />
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-2 text-sm">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-card-foreground">~{estimatedSizeMB} MB</span>
            </div>
            {speakerCount > 0 && (
              <>
                <div className="h-4 w-px bg-border hidden sm:block" />
                <div className="flex items-center gap-1.5 text-sm">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-card-foreground">{speakerCount}</span>
                </div>
              </>
            )}
            {totalSegments > 0 && (
              <>
                <div className="h-4 w-px bg-border hidden sm:block" />
                <span className="text-sm text-muted-foreground">{wordCount.toLocaleString()} words</span>
              </>
            )}
            {(() => {
              const usage = id ? getMeetingUsage(id) : null;
              return usage && usage.totalTokens > 0 ? (
                <>
                  <div className="h-4 w-px bg-border hidden sm:block" />
                  <div className="flex items-center gap-1.5 text-sm">
                    <Sparkles className="h-3.5 w-3.5 text-warning" />
                    <span className="font-mono text-card-foreground">${usage.estimatedCost.toFixed(4)}</span>
                  </div>
                </>
              ) : null;
            })()}
          </div>

          {/* Right: Links */}
          <div className="flex items-center gap-2 flex-wrap">
            {editingField === "calUrl" ? (
              <form onSubmit={(e) => { e.preventDefault(); confirmEdit("calUrl"); }} className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-8 text-xs bg-background w-64 font-mono"
                  placeholder="https://calendar.google.com/..."
                  autoFocus
                  onBlur={() => confirmEdit("calUrl")}
                  onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                />
                <button type="submit" className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={cancelEdit} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </form>
            ) : formData.calUrl ? (
              <div className="flex items-center gap-1">
                <a
                  href={formData.calUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Calendar
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={() => startEdit("calUrl")} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit("calUrl")}
                className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Link2 className="h-3.5 w-3.5" />
                Link Calendar
              </button>
            )}

            {editingField === "docUrl" ? (
              <form onSubmit={(e) => { e.preventDefault(); confirmEdit("docUrl"); }} className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-8 text-xs bg-background w-64 font-mono"
                  placeholder="https://docs.google.com/..."
                  autoFocus
                  onBlur={() => confirmEdit("docUrl")}
                  onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                />
                <button type="submit" className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={cancelEdit} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </form>
            ) : formData.docUrl ? (
              <div className="flex items-center gap-1">
                <a
                  href={formData.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <FileTextIcon className="h-3.5 w-3.5" />
                  Doc
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={() => startEdit("docUrl")} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit("docUrl")}
                className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <FileTextIcon className="h-3.5 w-3.5" />
                Link Doc
              </button>
            )}
          </div>
        </div>

        {/* Category & Tags */}
        <MeetingMetaMenu
          category={category}
          tags={tags}
          onCategoryChange={handleCategoryChange}
          onTagsChange={handleTagsChange}
          meetingType={meetingType}
          autoCategories={autoCategories}
          onMeetingTypeChange={handleMeetingTypeChange}
          onAutoCategoriesChange={handleAutoCategoriesChange}
        />

        {/* Pipeline — only show when not completed */}
        {showPipeline && (
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <ProcessingPipeline
              currentStage={pipelineStage}
              failedStage={meeting.status === "error" ? "transcribing" : undefined}
              onRetryStage={(stage) => {
                if (stage === "publishing") {
                  toast.info("Retrying publish to Google Sheets...");
                } else if (stage === "transcribing") {
                  toast.info("Retrying transcription via Scriberr...");
                } else {
                  toast.info(`Retrying ${stage}...`);
                }
              }}
            />
          </div>
        )}

        {/* AI Summary — borderless, flows into player */}
        <MeetingSummary
          summary={summary}
          actionItems={actionItems}
          onToggleAction={handleToggleAction}
          hasTranscript={safeSegments.length > 0}
          isGenerating={isGenerating}
          onGenerate={() => handleGenerateSummary()}
        />

        {/* Player — borderless canvas feel */}
        <MeetingPlayer
          title={formData.title}
          date={formData.date}
          mediaSrc={meeting.mediaSrc || getAudioUrl(meeting.id)}
          mediaType={meeting.mediaType}
          segments={safeSegments}
          onSpeakerRename={handleSpeakerRename}
          searchQuery={transcriptSearch}
          onSearchChange={setTranscriptSearch}
          searchResultCount={transcriptSearch ? filteredSegments.length : undefined}
        />
      </div>

      {/* Sidebar panel */}
      <MeetingSidebar
        currentMeetingId={id}
        allMeetings={allMeetings}
        seriesMeetings={seriesMeetings}
        hasSeriesMatches={seriesMeetings.length > 0}
      />

      {/* Cost confirmation dialog */}
      <AlertDialog open={!!costEstimate} onOpenChange={(open) => !open && setCostEstimate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>High API Cost Warning</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will process ~{costEstimate?.inputTokens.toLocaleString()} tokens using <span className="font-mono font-medium">{costEstimate?.modelLabel}</span>.</p>
              <p className="text-lg font-semibold text-foreground">Estimated cost: ${costEstimate?.estimatedCost.toFixed(2)}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setCostEstimate(null); handleGenerateSummary(true); }}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
