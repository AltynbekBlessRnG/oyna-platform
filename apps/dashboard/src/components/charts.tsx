"use client";

import type { ClubAnalytics } from "@oyna/contracts";
import { useState } from "react";
import { money, percent } from "@/lib/format";

/**
 * Цвета серий проверены валидатором палитры на поверхности #1e1e1e:
 * брендовое золото #FFC83D слишком светлое для отметок, поэтому время за ПК — его тёмная ступень.
 */
const SERIES = { time: "#c98500", bar: "#3987e5" } as const;
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const CHART_HEIGHT = 180;

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс`;
  return String(value);
}

/** Круглый верх шкалы: 0, 25 тыс, 50 тыс… вместо случайного максимума. */
function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Выручка по дням: время за ПК и бар столбцами одного стека, с подсказкой по наведению и таблицей. */
export function RevenueColumns({ daily }: { daily: ClubAnalytics["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = daily.map((day) => day.timeRevenue + day.barRevenue);
  const max = niceMax(Math.max(...totals, 0));
  const ticks = [0, max / 2, max];
  const labelEvery = daily.length > 14 ? Math.ceil(daily.length / 8) : 1;
  const hovered = active !== null ? daily[active] : undefined;

  return (
    <figure className="grid gap-3">
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES.time }} />время за ПК</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES.bar }} />бар</span>
      </figcaption>
      <div className="relative grid grid-cols-[3.25rem_1fr]">
        <div className="relative" style={{ height: CHART_HEIGHT }} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: CHART_HEIGHT - (tick / max) * CHART_HEIGHT }}>
              {compact(tick)}
            </span>
          ))}
        </div>
        <div className="relative" onMouseLeave={() => setActive(null)}>
          {ticks.map((tick) => (
            <div key={tick} className="absolute inset-x-0 h-px bg-border" style={{ top: CHART_HEIGHT - (tick / max) * CHART_HEIGHT }} aria-hidden="true" />
          ))}
          <div className="relative flex items-end" style={{ height: CHART_HEIGHT }} role="img" aria-label="Выручка по дням, подробности в таблице ниже">
            {daily.map((day, index) => {
              const timeHeight = (day.timeRevenue / max) * CHART_HEIGHT;
              const barHeight = (day.barRevenue / max) * CHART_HEIGHT;
              return (
                <div
                  key={day.date}
                  className="flex h-full flex-1 flex-col items-center justify-end"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  tabIndex={0}
                  aria-label={`${shortDate(day.date)}: ${money(totals[index])}`}
                >
                  <div className={`flex w-full max-w-6 flex-col items-stretch px-[1px] ${active === index ? "opacity-100" : active === null ? "opacity-100" : "opacity-60"}`}>
                    {barHeight > 0 ? <div style={{ height: barHeight, background: SERIES.bar }} className={`rounded-t-[4px] ${timeHeight > 0 ? "mb-[2px]" : ""}`} /> : null}
                    {timeHeight > 0 ? <div style={{ height: timeHeight, background: SERIES.time }} className={barHeight > 0 ? "" : "rounded-t-[4px]"} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {hovered && active !== null ? (
            <div
              className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 rounded-xl border border-border bg-background px-3 py-2 text-xs shadow-xl"
              style={{ left: `${((active + 0.5) / daily.length) * 100}%`, top: 0 }}
            >
              <p className="font-semibold">{shortDate(hovered.date)}</p>
              <p className="mt-1 flex justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: SERIES.time }} />время</span>{money(hovered.timeRevenue)}</p>
              <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: SERIES.bar }} />бар</span>{money(hovered.barRevenue)}</p>
              <p className="mt-1 flex justify-between gap-4 text-muted-foreground"><span>сессий</span>{hovered.sessions}</p>
            </div>
          ) : null}
          <div className="mt-2 flex" aria-hidden="true">
            {daily.map((day, index) => (
              <span key={day.date} className="flex-1 whitespace-nowrap text-center text-[11px] text-muted-foreground">
                {index % labelEvery === 0 ? shortDate(day.date) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Показать таблицей</summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="pb-2 font-medium">День</th><th className="pb-2 font-medium">Время за ПК</th><th className="pb-2 font-medium">Бар</th><th className="pb-2 font-medium">Внесли</th><th className="pb-2 font-medium">Сессий</th></tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((day) => (
                <tr key={day.date} className="border-t border-border">
                  <td className="py-1.5">{shortDate(day.date)}</td>
                  <td>{money(day.timeRevenue)}</td>
                  <td>{money(day.barRevenue)}</td>
                  <td>{money(day.toppedUp)}</td>
                  <td>{day.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Загрузка зала по часам недели: одна шкала золота, чем ярче — тем больше занятых мест. */
export function OccupancyHeatmap({ cells }: { cells: ClubAnalytics["heatmap"] }) {
  const [active, setActive] = useState<{ weekday: number; hour: number; occupancy: number } | null>(null);
  const peak = Math.max(...cells.map((cell) => cell.occupancy), 0);
  const byKey = new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell]));
  // Шкала нормирована на пик периода, иначе у клуба с загрузкой 20 % вся карта была бы одинаково тёмной.
  const shade = (value: number) => (value <= 0 ? undefined : `rgba(255, 200, 61, ${0.14 + 0.86 * (peak ? value / peak : 0)})`);

  return (
    <figure className="grid gap-3">
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[2rem_repeat(24,1fr)] gap-[2px]" onMouseLeave={() => setActive(null)} role="img" aria-label="Загрузка зала по дням недели и часам">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center text-[10px] text-muted-foreground">{hour % 3 === 0 ? hour : ""}</span>
          ))}
          {WEEKDAYS.map((label, index) => (
            <div key={label} className="contents">
              <span className="pr-1 text-right text-[11px] leading-6 text-muted-foreground">{label}</span>
              {Array.from({ length: 24 }, (_, hour) => {
                const cell = byKey.get(`${index + 1}:${hour}`) ?? { weekday: index + 1, hour, occupancy: 0 };
                return (
                  <span
                    key={hour}
                    className="h-6 rounded-[3px] bg-secondary"
                    style={{ background: shade(cell.occupancy) }}
                    onMouseEnter={() => setActive(cell)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {active
            ? `${WEEKDAYS[active.weekday - 1]}, ${String(active.hour).padStart(2, "0")}:00–${String((active.hour + 1) % 24).padStart(2, "0")}:00 — занято ${percent(active.occupancy)} мест`
            : "Наведите на клетку, чтобы увидеть загрузку в этот час"}
        </span>
        <span className="flex items-center gap-2">
          0%
          <span className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(90deg, rgba(255,200,61,0.14), rgba(255,200,61,1))" }} />
          {percent(peak)}
        </span>
      </figcaption>
    </figure>
  );
}

/** Загрузка зоны — полоса на треке той же ступени, подпись значения рядом, а не цветом. */
export function OccupancyBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${Math.max(value > 0 ? 2 : 0, value * 100)}%`, background: SERIES.time }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums">{percent(value)}</span>
    </div>
  );
}
