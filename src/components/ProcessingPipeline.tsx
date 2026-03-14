import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, Clock, AlertCircle, ArrowRight, Brain, Tag, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isOnline } from "@/lib/storage";

export type PipelineStage =
  | "queued"
  | "uploading"
  | "submitted"
  | "transcribing"
  | "cleaning"
  | "speaker_id"
  | "auto_tagging"
  | "ai_analysis"
  | "publishing"
  | "completed"
  | "failed";

interface PipelineStep {
  id: PipelineStage;
  label: string;
  description: string;
  /** true if this step requires internet (not just local Scriberr) */
  requiresInternet?: boolean;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "queued", label: "Queued", description: "File added to processing queue" },
  { id: "uploading", label: "Uploading", description: "Uploading to Scriberr API" },
  { id: "submitted", label: "Submitted", description: "Transcription job submitted" },
  { id: "transcribing", label: "Transcribing", description: "WhisperX processing audio" },
  { id: "cleaning", label: "Cleaning", description: "Merging segments, cleaning output" },
  { id: "speaker_id", label: "Speaker ID", description: "AI identifying speakers", requiresInternet: true },
  { id: "auto_tagging", label: "Auto-Tag", description: "Keyword-based category and type tagging" },
  { id: "ai_analysis", label: "AI Analysis", description: "Categorizing, summarizing, extracting action items", requiresInternet: true },
  { id: "publishing", label: "Publishing", description: "Logging to Google Sheets", requiresInternet: true },
  { id: "completed", label: "Done", description: "Transcription complete" },
];

const stageOrder: Record<PipelineStage, number> = {
  queued: 0,
  uploading: 1,
  submitted: 2,
  transcribing: 3,
  cleaning: 4,
  speaker_id: 5,
  auto_tagging: 6,
  ai_analysis: 7,
  publishing: 8,
  completed: 9,
  failed: -1,
};

interface ProcessingPipelineProps {
  currentStage: PipelineStage;
  failedStage?: PipelineStage;
  className?: string;
  onRetryStage?: (stage: PipelineStage) => void;
}

export function ProcessingPipeline({ currentStage, failedStage, className, onRetryStage }: ProcessingPipelineProps) {
  const currentOrder = stageOrder[currentStage];
  const isFailed = currentStage === "failed";
  const [hoveredStep, setHoveredStep] = useState<PipelineStage | null>(null);
  const online = isOnline();

  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      <h3 className="text-sm font-medium mb-4">Processing Pipeline</h3>
      <div className="flex items-center gap-1">
        {PIPELINE_STEPS.map((step, i) => {
          const stepOrder = stageOrder[step.id];
          const isCompleted = !isFailed && currentOrder > stepOrder;
          const isActive = !isFailed && currentOrder === stepOrder;
          const isFailedStep = isFailed && failedStage === step.id;
          const isPending = isFailed ? stepOrder > stageOrder[failedStage || "queued"] : currentOrder < stepOrder;
          const isAI = step.id === "ai_analysis";
          const isAutoTag = step.id === "auto_tagging";

          // Show retry for: failed steps, or completed steps that can be re-run (publishing)
          const canRetry = isFailedStep || (step.id === "publishing" && isCompleted && onRetryStage);
          const needsInternet = step.requiresInternet && !online;
          const showRetry = canRetry && hoveredStep === step.id;

          return (
            <div key={step.id} className="flex items-center gap-1 flex-1">
              <div
                className="flex flex-col items-center gap-1.5 flex-1 group relative"
                onMouseEnter={() => setHoveredStep(step.id)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono transition-all cursor-default",
                          isCompleted && "bg-primary/20 text-primary",
                          isActive && "bg-primary text-primary-foreground animate-pulse-glow",
                          isFailedStep && "bg-destructive/20 text-destructive",
                          isPending && "bg-secondary text-muted-foreground",
                          isAI && isActive && "bg-purple-500 text-white",
                          isAutoTag && isActive && "bg-info text-info-foreground",
                          canRetry && "cursor-pointer"
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : isActive ? (
                          isAI ? <Brain className="h-3.5 w-3.5 animate-pulse" /> :
                          isAutoTag ? <Tag className="h-3.5 w-3.5 animate-pulse" /> :
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isFailedStep ? (
                          <AlertCircle className="h-3.5 w-3.5" />
                        ) : isAI ? (
                          <Brain className="h-3 w-3" />
                        ) : isAutoTag ? (
                          <Tag className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs p-2.5 space-y-1.5">
                      <p className="text-xs font-medium">{step.label}</p>
                      <p className="text-[10px] text-muted-foreground">{step.description}</p>
                      {isFailedStep && (
                        <p className="text-[10px] text-destructive font-medium">Failed — click Retry below</p>
                      )}
                      {needsInternet && (
                        <p className="text-[10px] text-warning flex items-center gap-1">
                          <WifiOff className="h-2.5 w-2.5" /> Requires internet
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <span
                  className={cn(
                    "text-[9px] font-medium text-center leading-tight",
                    isCompleted && "text-primary",
                    isActive && "text-primary",
                    isFailedStep && "text-destructive",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>

                {/* Retry button on hover */}
                {showRetry && onRetryStage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "absolute -bottom-8 z-20 gap-1 text-[10px] h-6 px-2 shadow-md",
                      needsInternet && "opacity-50 cursor-not-allowed"
                    )}
                    disabled={needsInternet}
                    onClick={() => onRetryStage(step.id)}
                  >
                    <RefreshCw className="h-2.5 w-2.5" />
                    Retry
                  </Button>
                )}
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <ArrowRight
                  className={cn(
                    "h-3 w-3 shrink-0 mb-4",
                    isCompleted ? "text-primary/40" : "text-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Offline notice for publishing */}
      {!online && (isFailed || currentStage === "completed") && (
        <p className="mt-3 text-[10px] text-warning flex items-center gap-1.5">
          <WifiOff className="h-3 w-3" />
          You're offline. Publishing to Google Sheets will be available when internet is restored. Local Scriberr transcription works offline.
        </p>
      )}
    </div>
  );
}
