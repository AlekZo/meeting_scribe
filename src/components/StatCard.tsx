import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn(
      "rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_-8px_hsl(var(--primary)/0.15)] group",
      className
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary group-hover:bg-primary/10 transition-colors">
          <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
      <div className="mt-3">
        <span className="text-2xl 2xl:text-3xl font-semibold tracking-tight text-card-foreground font-mono">
          {value}
        </span>
        {trend && (
          <span className="ml-2 text-xs text-success font-mono">{trend}</span>
        )}
      </div>
    </div>
  );
}
