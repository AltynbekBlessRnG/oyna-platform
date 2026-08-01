import type { DashboardMetric } from "@oyna/contracts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps { metric: DashboardMetric; }

export function MetricCard({ metric }: MetricCardProps) {
  const Icon = metric.trend === "up" ? ArrowUpRight : metric.trend === "down" ? ArrowDownRight : Minus;
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{metric.label}</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <strong className="font-mono text-2xl tracking-tight">{metric.value}</strong>
          <span className={metric.trend === "down" ? "flex items-center text-xs text-amber-300" : "flex items-center text-xs text-emerald-300"}>
            <Icon className="mr-1 size-3.5" />{metric.change}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

