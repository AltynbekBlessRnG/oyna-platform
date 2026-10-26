import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "success" | "warning" | "danger" | "neutral";
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  const tones = {
    success: "bg-success/10 text-success",
    warning: "bg-primary/12 text-primary",
    danger: "bg-danger/12 text-danger",
    neutral: "bg-secondary text-muted-foreground"
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)} {...props} />;
}
