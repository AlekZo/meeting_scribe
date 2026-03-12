import { useParams, useNavigate, NavLink } from "react-router-dom";
import { useState, useCallback, useEffect, useMemo } from "react";
import { sampleMeetings, MeetingCategory, ActionItem, TagRule } from "@/data/meetings";
import { loadMeetings, loadMeetingOverrides, saveMeetingOverride, loadTranscriptSegments, loadSetting } from "@/lib/storage";
import { autoTag } from "@/lib/auto-tagger";
import { callOpenRouter, trackMeetingUsage, getOpenRouterKey, getMeetingUsage, AIUsage } from "@/lib/openrouter";
import { toast } from "sonner";
import { MeetingPlayer, TranscriptSegment } from "@/components/MeetingPlayer";
import { ProcessingPipeline, PipelineStage } from "@/components/ProcessingPipeline";
import { TranscriptExport } from "@/components/TranscriptExport";
import { MeetingMetaMenu } from "@/components/MeetingMetaMenu";
import { MeetingSummary } from "@/components/MeetingSummary";
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
  Search,
  FileText as FileTextIcon,
  FileText,
  ChevronRight,
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

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const allMeetings = useMemo(() => [...sampleMeetings, ...loadMeetings()], []);
  const meeting = allMeetings.find((m) => m.id === id);
  const otherMeetings = allMeetings.filter((m) => m.id !== id);

  // Series: meetings with the same (or very similar) title
  const seriesMeetings = useMemo(() => {
    if (!meeting) return [];
    const baseTitle = meeting.title.replace(/\s*[-–—]\s*\d{4}[-/]\d{2}[-/]\d{2}.*$/, "").trim().toLowerCase();
    return allMeetings
      .filter((m) => {
        if (m.id === id) return false;
        const t = m.title.replace(/\s*[-–—]\s*\d{4}[-/]\d{2}[-/]\d{2}.*$/, "").trim().toLowerCase();
        return t === baseTitle || m.title.toLowerCase() === meeting.title.toLowerCase();
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [allMeetings, meeting, id]);

  // Load persisted overrides
  const overrides = id ? loadMeetingOverrides(id) : {};

  // Load segments: overrides > separate transcript store > meeting.segments
  const storedTranscript = id ? loadTranscriptSegments(id) : null;
  const [segments, setSegments] = useState<TranscriptSegment[]>(
    overrides.segments ?? storedTranscript ?? meeting?.segments ?? []
  );
  const safeSegments = segments || [];
  const [title, setTitle] = useState(overrides.title ?? meeting?.title ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  const [calendarUrl, setCalendarUrl] = useState(overrides.calendarUrl ?? meeting?.calendarEventUrl ?? "");
  const [isEditingCal, setIsEditingCal] = useState(false);
  const [editCalValue, setEditCalValue] = useState("");

  const [googleDocUrl, setGoogleDocUrl] = useState(overrides.googleDocUrl ?? "");
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [editDocValue, setEditDocValue] = useState("");

  const [category, setCategory] = useState<MeetingCategory | undefined>(
    overrides.category ?? meeting?.category
  );
  const [tags, setTags] = useState<string[]>(
    overrides.tags ?? meeting?.tags ?? []
  );

  // Auto-tag from rules
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

  // Action items
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    overrides.actionItems ?? meeting?.actionItems ?? []
  );

  const [summary, setSummary] = useState<string | undefined>(overrides.summary ?? meeting?.summary);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);

  const handleSuggestTitle = async () => {
    if (!safeSegments.length) return;
    if (!getOpenRouterKey()) {
      toast.error("OpenRouter API key not configured. Go to Settings.");
      return;
    }
    setIsSuggestingTitle(true);
    try {
      const excerpt = safeSegments.slice(0, 30).map((s) => `[${s.speaker}]: ${s.text}`).join("\n");
      const result = await callOpenRouter("cleaning", [
        {
          role: "system",
          content: "You are a meeting title generator. Given a transcript excerpt, produce a short, descriptive meeting title (3-8 words). Reply with ONLY the title, no quotes, no explanation.",
        },
        { role: "user", content: excerpt },
      ]);
      if (id) trackMeetingUsage(id, result.usage);
      const suggested = result.content.trim().replace(/^["']|["']$/g, "");
      if (suggested) {
        setTitle(suggested);
        if (id) saveMeetingOverride(id, "title", suggested);
        toast.success(`Title suggested! (${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)})`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to suggest title");
    } finally {
      setIsSuggestingTitle(false);
    }
  };

  // Transcript search
  const [transcriptSearch, setTranscriptSearch] = useState("");

  // Reset state when navigating between meetings
  useEffect(() => {
    const ov = id ? loadMeetingOverrides(id) : {};
    const stored = id ? loadTranscriptSegments(id) : null;
    const allM = [...sampleMeetings, ...loadMeetings()];
    const m = allM.find((m) => m.id === id);
    setSegments(ov.segments ?? stored ?? m?.segments ?? []);
    setTitle(ov.title ?? m?.title ?? "");
    setCalendarUrl(ov.calendarUrl ?? m?.calendarEventUrl ?? "");
    setGoogleDocUrl(ov.googleDocUrl ?? "");
    setCategory(ov.category ?? m?.category);
    setTags(ov.tags ?? m?.tags ?? []);
    setActionItems(ov.actionItems ?? m?.actionItems ?? []);
    const segs = ov.segments ?? stored ?? m?.segments ?? [];
    const at = segs.length > 0 ? autoTag(segs, typeRules, categoryRules) : { meetingType: undefined, autoCategories: [] };
    setMeetingType(ov.meetingType ?? m?.meetingType ?? at.meetingType);
    setAutoCategories(ov.autoCategories ?? m?.autoCategories ?? at.autoCategories);
    setIsEditingTitle(false);
    setIsEditingCal(false);
    setTranscriptSearch("");
  }, [id]);

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

  const handleGenerateSummary = async () => {
    if (!safeSegments.length) return;
    if (!getOpenRouterKey()) {
      toast.error("OpenRouter API key not configured. Go to Settings to add it.");
      return;
    }
    setIsGenerating(true);
    try {
      const transcript = safeSegments.map((s) => `[${s.speaker}]: ${s.text}`).join("\n");
      const result = await callOpenRouter("summarization", [
        {
          role: "system",
          content: `You are a meeting analyst. Given a transcript, produce a JSON object with:
- "summary": a concise 2-4 sentence summary of the meeting
- "actionItems": an array of objects with "assignee" (string) and "text" (string) for each action item discussed

Respond ONLY with valid JSON, no markdown.`,
        },
        { role: "user", content: transcript },
      ]);
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
        setSummary(result.content);
        if (id) saveMeetingOverride(id, "summary", result.content);
        toast.success("Summary generated (could not parse action items)");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate summary");
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

  const startEditTitle = () => {
    setEditTitleValue(title);
    setIsEditingTitle(true);
  };
  const confirmTitle = () => {
    if (!isEditingTitle) return;
    const newTitle = editTitleValue.trim();
    if (newTitle) {
      setTitle(newTitle);
      if (id) saveMeetingOverride(id, "title", newTitle);
    }
    setIsEditingTitle(false);
  };

  const startEditCal = () => {
    setEditCalValue(calendarUrl);
    setIsEditingCal(true);
  };
  const confirmCal = () => {
    if (!isEditingCal) return;
    const raw = editCalValue.trim();
    let safeUrl = "";
    if (raw) {
      try {
        const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          safeUrl = parsed.href;
        }
      } catch { /* invalid URL */ }
    }
    setCalendarUrl(safeUrl);
    if (id) saveMeetingOverride(id, "calendarUrl", safeUrl);
    setIsEditingCal(false);
  };

  const startEditDoc = () => {
    setEditDocValue(googleDocUrl);
    setIsEditingDoc(true);
  };
  const confirmDoc = () => {
    if (!isEditingDoc) return;
    const raw = editDocValue.trim();
    let safeUrl = "";
    if (raw) {
      try {
        const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          safeUrl = parsed.href;
        }
      } catch { /* invalid URL */ }
    }
    setGoogleDocUrl(safeUrl);
    if (id) saveMeetingOverride(id, "googleDocUrl", safeUrl);
    setIsEditingDoc(false);
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

  // Filter segments for transcript search
  const filteredSegments = transcriptSearch
    ? safeSegments.filter((s) =>
        s.text.toLowerCase().includes(transcriptSearch.toLowerCase()) ||
        s.speaker.toLowerCase().includes(transcriptSearch.toLowerCase())
      )
    : safeSegments;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
      {/* Main content */}
      <div className="space-y-6 min-w-0">
        {/* Header — sticky */}
        <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 bg-background/95 backdrop-blur-sm border-b border-border flex items-start justify-between">
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
                    {safeSegments.length > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={handleSuggestTitle}
                              disabled={isSuggestingTitle}
                              className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                            >
                              {isSuggestingTitle ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Wand2 className="h-3 w-3" />
                              )}
                              AI Title
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs p-2.5 space-y-1">
                            <p className="text-xs">Suggest a meeting name from transcript</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              Model: {getModelCatalog().find((m) => m.id === getModelForTask("cleaning"))?.label ?? getModelForTask("cleaning")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Uses the Cleaning model (fast & cheap)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {seriesMeetings.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                            <History className="h-3 w-3" />
                            Series ({seriesMeetings.length + 1})
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-72">
                          {/* Current meeting */}
                          <div className="px-3 py-2 border-b border-border">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Current</p>
                            <div className="flex items-center gap-2 mt-1">
                              <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                              <span className="text-xs font-medium truncate">{meeting?.date}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{meeting?.duration}</span>
                            </div>
                          </div>
                          <div className="px-3 pt-2 pb-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">History</p>
                          </div>
                          {seriesMeetings.map((sm) => (
                            <DropdownMenuItem
                              key={sm.id}
                              onClick={() => navigate(`/meetings/${sm.id}`)}
                              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                            >
                              {sm.status === "completed" ? (
                                <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                              ) : sm.status === "transcribing" ? (
                                <Loader2 className="h-3 w-3 text-info animate-spin shrink-0" />
                              ) : sm.status === "error" ? (
                                <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                              ) : (
                                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-mono">{sm.date}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono">{sm.duration}</span>
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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

            {/* Google Doc link */}
            {isEditingDoc ? (
              <form onSubmit={(e) => { e.preventDefault(); confirmDoc(); }} className="flex items-center gap-2">
                <Input
                  value={editDocValue}
                  onChange={(e) => setEditDocValue(e.target.value)}
                  className="h-8 text-xs bg-background w-72 font-mono"
                  placeholder="https://docs.google.com/document/d/..."
                  autoFocus
                  onBlur={confirmDoc}
                />
                <button type="submit" className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setIsEditingDoc(false)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </form>
            ) : googleDocUrl ? (
              <div className="flex items-center gap-1.5">
                <a
                  href={googleDocUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <FileTextIcon className="h-3.5 w-3.5" />
                  Transcript Doc
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={startEditDoc} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={startEditDoc}
                className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <FileTextIcon className="h-3.5 w-3.5" />
                Link Google Doc
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
          {safeSegments.length > 0 && (
            <>
              <div className="h-4 w-px bg-border" />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Search transcript..."
                  className="h-7 w-48 pl-7 text-xs bg-background"
                />
                {transcriptSearch && (
                  <button
                    onClick={() => setTranscriptSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
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
          {(() => {
            const usage = id ? getMeetingUsage(id) : null;
            return usage && usage.totalTokens > 0 ? (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-warning" />
                  <span className="text-muted-foreground">AI Cost:</span>
                  <span className="font-mono text-card-foreground">${usage.estimatedCost.toFixed(4)}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">({usage.totalTokens.toLocaleString()} tokens)</span>
                </div>
              </>
            ) : null;
          })()}
        </div>

        {/* Pipeline */}
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <ProcessingPipeline
            currentStage={pipelineStage}
            failedStage={meeting.status === "error" ? "transcribing" : undefined}
          />
        </div>

        {/* AI Summary & Action Items */}
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <MeetingSummary
            summary={summary}
            actionItems={actionItems}
            onToggleAction={handleToggleAction}
            hasTranscript={safeSegments.length > 0}
            isGenerating={isGenerating}
            onGenerate={handleGenerateSummary}
          />
        </div>

  const [googleDocUrl, setGoogleDocUrl] = useState(overrides.googleDocUrl ?? "");
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [editDocValue, setEditDocValue] = useState("");

        {/* Actions */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3">
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
            {safeSegments.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Identify Speakers (AI)
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <TranscriptExport segments={safeSegments} title={title} />
          </div>
        </div>

        {/* Search results count */}
        {transcriptSearch && (
          <p className="text-xs text-muted-foreground font-mono">
            {filteredSegments.length} segment{filteredSegments.length !== 1 ? "s" : ""} matching "{transcriptSearch}"
          </p>
        )}

        {/* Player */}
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <MeetingPlayer
            title={title}
            date={`${meeting.date} · ${meeting.duration}`}
            mediaType={meeting.mediaType}
            segments={filteredSegments}
            onSpeakerRename={handleSpeakerRename}
            searchQuery={transcriptSearch}
          />
        </div>
      </div>

      {/* Quick-switch sidebar */}
      <aside className="hidden xl:block space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          All Meetings ({otherMeetings.length})
        </h2>
        <div className="space-y-1.5 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          {otherMeetings.map((m) => (
            <NavLink
              key={m.id}
              to={`/meetings/${m.id}`}
              className={({ isActive }) =>
                `block rounded-lg border px-3 py-2.5 transition-colors ${
                  isActive
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-secondary/30"
                }`
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-medium text-card-foreground truncate">{m.title}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5 ml-5.5">
                    {m.date} · {m.duration}
                  </p>
                </div>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              </div>
            </NavLink>
          ))}
        </div>
      </aside>
    </div>
  );
}
