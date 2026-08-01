import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "success" | "warning" | "neutral";
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  const tones = {
    success: "bg-emerald-400/10 text-emerald-300",
    warning: "bg-amber-400/10 text-amber-300",
    neutral: "bg-secondary text-muted-foreground"
  };
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)} {...props} />;
}

