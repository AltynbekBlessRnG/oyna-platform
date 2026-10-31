"use client";

import { useEffect, useState } from "react";

const TIME_ZONE = "Asia/Almaty";

/** Дата и часы клуба над залом: касса сверяет по ним конец сессий и время брони. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return <span className="inline-block h-5 w-40" aria-hidden />;
  const date = now.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: TIME_ZONE });
  const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TIME_ZONE });
  return (
    <span className="flex items-baseline gap-2.5 text-sm text-muted-foreground">
      <span>{date}</span>
      <time dateTime={now.toISOString()} className="font-display text-sm font-medium tabular-nums text-foreground">{time}</time>
    </span>
  );
}
