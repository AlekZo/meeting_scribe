import { useState } from "react";
import { ActionItem } from "@/data/meetings";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText,
  ListChecks,
  ChevronDown,
  ChevronUp,
  User,
  Sparkles,
  Loader2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { getModelForTask, getModelCatalog } from "@/lib/openrouter";

interface MeetingSummaryProps {
  summary?: string;
  actionItems?: ActionItem[];
  onToggleAction?: (id: string, done: boolean) => void;
  hasTranscript?: boolean;
  onGenerate?: () => void;
  isGenerating?: boolean;
}

export function MeetingSummary({
  summary,
  actionItems,
  onToggleAction,
  hasTranscript,
  onGenerate,
  isGenerating,
}: MeetingSummaryProps) {
  const [expanded, setExpanded] = useState(true);

  const modelId = getModelForTask("summarization");
  const model = getModelCatalog().find((m) => m.id === modelId);
  const modelLabel = model?.label ?? modelId;
  const costIn = model?.costIn ?? 0;
  const costOut = model?.costOut ?? 0;
  const contextWindow = model?.context?.toLocaleString() ?? "—";

  const hasSummary = !!summary;
  const hasActions = actionItems && actionItems.length > 0;
  const isEmpty = !hasSummary && !hasActions;

  const completedCount = actionItems?.filter((a) => a.done).length ?? 0;
  const totalCount = actionItems?.length ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex w-full items-center justify-between px-5 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-card-foreground">AI Summary & Action Items</span>
          {totalCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
              {completedCount}/{totalCount} done
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Generate button */}
        {hasTranscript && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={onGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {hasSummary ? "Regenerate" : "Generate"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1.5 p-3">
                <p className="font-medium">Model: <span className="font-mono text-primary">{modelLabel}</span></p>
                <p className="text-muted-foreground">Context: {contextWindow} tokens</p>
                <p className="text-muted-foreground">
                  Cost: <span className="font-mono">${costIn}/M</span> in · <span className="font-mono">${costOut}/M</span> out
                  {costIn === 0 && costOut === 0 && <span className="ml-1 text-success font-medium">Free!</span>}
                </p>
                <p className="text-muted-foreground text-[10px]">
                  Sends transcript to OpenRouter for summarization & action item extraction
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border">
          {isEmpty && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {hasTranscript
                  ? "No summary yet. Click Generate to create one with AI."
                  : "No transcript available for summarization."}
              </p>
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">Summary</h4>
                <button
                  onClick={() => { navigator.clipboard.writeText(summary); toast.success("Summary copied"); }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
              <p className="text-sm leading-relaxed text-card-foreground">{summary}</p>
            </div>
          )}

          {/* Action Items */}
          {actionItems && actionItems.length > 0 && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">Action Items</h4>
                </div>
                <button
                  onClick={() => {
                    const text = actionItems.map((a) => `${a.done ? "✅" : "⬜"} [${a.assignee}] ${a.text}`).join("\n");
                    navigator.clipboard.writeText(text);
                    toast.success("Action items copied");
                  }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 rounded-md px-3 py-2 transition-colors",
                      item.done ? "bg-secondary/20" : "bg-secondary/5 hover:bg-secondary/20"
                    )}
                  >
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={(checked) => onToggleAction?.(item.id, !!checked)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm",
                        item.done ? "line-through text-muted-foreground" : "text-card-foreground"
                      )}>
                        {item.text}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <User className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] font-mono text-muted-foreground">{item.assignee}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
