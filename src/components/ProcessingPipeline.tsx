import { cn } from "@/lib/utils";
import { Check, Loader2, Clock, AlertCircle, ArrowRight } from "lucide-react";

export type PipelineStage =
  | "queued"
  | "uploading"
  | "submitted"
  | "transcribing"
  | "cleaning"
  | "speaker_id"
  | "publishing"
  | "completed"
  | "failed";

interface PipelineStep {
  id: PipelineStage;
  label: string;
  description: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "queued", label: "Queued", description: "File added to processing queue" },
  { id: "uploading", label: "Uploading", description: "Uploading to Scriberr API" },
  { id: "submitted", label: "Submitted", description: "Transcription job submitted" },
  { id: "transcribing", label: "Transcribing", description: "WhisperX processing audio" },
  { id: "cleaning", label: "Cleaning", description: "Merging segments, cleaning output" },
  { id: "speaker_id", label: "Speaker ID", description: "AI identifying speakers" },
  { id: "publishing", label: "Publishing", description: "Logging to Google Sheets" },
  { id: "completed", label: "Done", description: "Transcription complete" },
];

const stageOrder: Record<PipelineStage, number> = {
  queued: 0,
  uploading: 1,
  submitted: 2,
  transcribing: 3,
  cleaning: 4,
  speaker_id: 5,
  publishing: 6,
  completed: 7,
  failed: -1,
};

interface ProcessingPipelineProps {
  currentStage: PipelineStage;
  failedStage?: PipelineStage;
  className?: string;
}

export function ProcessingPipeline({ currentStage, failedStage, className }: ProcessingPipelineProps) {
  const currentOrder = stageOrder[currentStage];
  const isFailed = currentStage === "failed";

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

          return (
            <div key={step.id} className="flex items-center gap-1 flex-1">
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono transition-all",
                    isCompleted && "bg-primary/20 text-primary",
                    isActive && "bg-primary text-primary-foreground animate-pulse-glow",
                    isFailedStep && "bg-destructive/20 text-destructive",
                    isPending && "bg-secondary text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isFailedStep ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                </div>
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
    </div>
  );
}
