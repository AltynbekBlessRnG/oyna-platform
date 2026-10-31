"use client";

import type { ClubZone, HallLayout, HallLayoutItem, HallLayoutItemKind, SaveHallLayoutRequest, SeatMapSeat, SeatMapZone } from "@oyna/contracts";
import { Minus, Plus, Rows3, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveHallLayout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { FURNITURE, GRID_LIMITS, KIND_META, LABEL_MAX, MAX_ITEMS, overlaps, SEAT_SIZE } from "@/lib/hall-layout";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

interface HallLayoutEditorProps {
  clubId: string;
  zones: SeatMapZone[];
  layout: HallLayout | null;
}

interface Draft {
  columns: number;
  rows: number;
  items: HallLayoutItem[];
}

/** Что взяли из палитры: тип элемента и, для места, какое именно. */
interface PaletteItem {
  kind: HallLayoutItemKind;
  seatId?: string;
}

interface Cell {
  x: number;
  y: number;
}

/** Клетка при 100%; масштаб меняет только её. */
const BASE_CELL = 28;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_GRID = { columns: 32, rows: 20 };
/** Сколько пикселей надо протащить, чтобы нажатие стало перетаскиванием. */
const DRAG_SLOP = 4;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sizeOf(pick: PaletteItem): { w: number; h: number } {
  return pick.kind === "seat" ? SEAT_SIZE : { w: KIND_META[pick.kind].w, h: KIND_META[pick.kind].h };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fromLayout(layout: HallLayout | null): Draft {
  return layout ? { columns: layout.columns, rows: layout.rows, items: layout.items } : { ...DEFAULT_GRID, items: [] };
}

/** Короткая метка зоны на плитке: у разных зон номера мест повторяются. */
function zoneTag(zone: ClubZone): string {
  const words = zone.name.trim().split(/\s+/);
  return (words.length > 1 ? words.map((word) => word[0]).join("") : zone.name.slice(0, 3)).toUpperCase().slice(0, 3);
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

/**
 * Редактор схемы зала: клетчатый лист с линейками, справа — места, которых ещё нет на схеме, и обстановка.
 * Элементы таскают мышью или пальцем, выбранный двигают стрелками; сохраняется схема целиком одной кнопкой.
 */
export function HallLayoutEditor({ clubId, zones, layout }: HallLayoutEditorProps) {
  const [saved, setSaved] = useState<Draft>(() => fromLayout(layout));
  const [draft, setDraft] = useState<Draft>(() => fromLayout(layout));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [armed, setArmed] = useState<PaletteItem | null>(null);
  const [arrange, setArrange] = useState<{ zoneId: string; perRow: number } | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [ghost, setGhost] = useState<{ pick: PaletteItem; clientX: number; clientY: number } | null>(null);

  const [stored, setStored] = useState(Boolean(layout));
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const gesture = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; origin: HallLayoutItem } | null>(null);
  const justDragged = useRef(false);
  const paletteDrag = useRef<{ pick: PaletteItem; startX: number; startY: number; dragging: boolean } | null>(null);

  const cell = Math.round(BASE_CELL * ZOOMS[zoomIndex]);
  const { columns, rows, items } = draft;
  const dirty = !sameDraft(draft, saved);

  const seatInfo = useMemo(() => {
    const map = new Map<string, { seat: SeatMapSeat; zone: ClubZone }>();
    for (const { zone, seats } of zones) for (const seat of seats) map.set(seat.id, { seat, zone });
    return map;
  }, [zones]);
  const placedSeats = useMemo(() => new Set(items.filter((item) => item.kind === "seat").map((item) => item.seatId)), [items]);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  /** Подписи можно класть поверх чего угодно; остальное, что наезжает друг на друга, подсвечиваем. */
  const clashing = useMemo(() => {
    const solid = items.filter((item) => item.kind !== "label");
    const ids = new Set<string>();
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        if (overlaps(solid[i], solid[j])) {
          ids.add(solid[i].id);
          ids.add(solid[j].id);
        }
      }
    }
    return ids;
  }, [items]);

  // Наименьшая сетка, в которую помещается всё нарисованное.
  const extent = useMemo(
    () => ({
      columns: Math.max(GRID_LIMITS.columns[0], ...items.map((item) => item.x + item.w)),
      rows: Math.max(GRID_LIMITS.rows[0], ...items.map((item) => item.y + item.h))
    }),
    [items]
  );

  const update = useCallback((id: string, patch: (item: HallLayoutItem, grid: Draft) => Partial<HallLayoutItem>) => {
    setDraft((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, ...patch(item, current) } : item)) }));
  }, []);

  const focusItem = useCallback((id: string) => {
    requestAnimationFrame(() => itemRefs.current.get(id)?.focus({ preventScroll: false }));
  }, []);

  const cellAt = useCallback(
    (clientX: number, clientY: number): Cell | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left) / cell);
      const y = Math.floor((clientY - rect.top) / cell);
      return x >= 0 && y >= 0 && x < columns && y < rows ? { x, y } : null;
    },
    [cell, columns, rows]
  );

  function canAdd(): boolean {
    if (items.length < MAX_ITEMS) return true;
    setMessage({ ok: false, text: `На схеме не больше ${MAX_ITEMS} элементов` });
    return false;
  }

  /** Ставит взятое из палитры так, чтобы клетка под пальцем оказалась его серединой. */
  function place(pick: PaletteItem, at: Cell, centered: boolean): void {
    if (!canAdd()) return;
    if (pick.kind === "seat" && placedSeats.has(pick.seatId)) return;
    const { w, h } = sizeOf(pick);
    const item: HallLayoutItem = {
      id: newId(),
      kind: pick.kind,
      x: clamp(at.x - (centered ? Math.floor((w - 1) / 2) : 0), 0, Math.max(0, columns - w)),
      y: clamp(at.y - (centered ? Math.floor((h - 1) / 2) : 0), 0, Math.max(0, rows - h)),
      w: Math.min(w, columns),
      h: Math.min(h, rows),
      ...(pick.seatId ? { seatId: pick.seatId } : {}),
      ...(pick.kind === "label" ? { label: "Подпись" } : {})
    };
    setDraft((current) => ({ ...current, items: [...current.items, item] }));
    setSelectedId(item.id);
    setMessage(null);
    // Место ставят одно за другим: держим палитру взведённой на следующее место той же зоны.
    if (pick.kind === "seat" && armed?.kind === "seat") {
      const zone = seatInfo.get(pick.seatId ?? "")?.zone.id;
      const next = zones.find((entry) => entry.zone.id === zone)?.seats.find((seat) => seat.id !== pick.seatId && !placedSeats.has(seat.id));
      setArmed(next ? { kind: "seat", seatId: next.id } : null);
    } else if (armed) {
      setArmed(null);
    }
    return void focusItem(item.id);
  }

  /** Первая свободная клетка, куда элемент встаёт целиком, — для постановки с клавиатуры. */
  function freeSpot(w: number, h: number): Cell {
    for (let y = 0; y + h <= rows; y++) {
      for (let x = 0; x + w <= columns; x++) {
        if (!items.some((item) => item.kind !== "label" && overlaps(item, { x, y, w, h }))) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  function arrangeFrom(start: Cell): void {
    if (!arrange) return;
    const queue = zones.find((entry) => entry.zone.id === arrange.zoneId)?.seats.filter((seat) => !placedSeats.has(seat.id)) ?? [];
    if (!queue.length) return setArrange(null);
    const { w, h } = SEAT_SIZE;
    const perRow = clamp(Math.min(arrange.perRow, Math.floor((columns - start.x) / w)), 1, queue.length);
    const lines = Math.ceil(queue.length / perRow);
    // Между рядами — проход в клетку, как между рядами столов.
    const needRows = start.y + lines * h + (lines - 1);
    const nextRows = clamp(Math.max(rows, needRows), GRID_LIMITS.rows[0], GRID_LIMITS.rows[1]);
    const fresh: HallLayoutItem[] = [];
    for (const [index, seat] of queue.entries()) {
      const x = start.x + (index % perRow) * w;
      const y = start.y + Math.floor(index / perRow) * (h + 1);
      if (y + h > nextRows || items.length + fresh.length >= MAX_ITEMS) break;
      fresh.push({ id: newId(), kind: "seat", seatId: seat.id, x, y, w, h });
    }
    setDraft((current) => ({ ...current, rows: nextRows, items: [...current.items, ...fresh] }));
    setArrange(null);
    setMessage(
      fresh.length < queue.length
        ? { ok: false, text: `Поместилось ${fresh.length} из ${queue.length}: остальным не хватило схемы. Увеличьте её или начните выше.` }
        : { ok: true, text: `${fresh.length} ${plural(fresh.length, "место расставлено", "места расставлены", "мест расставлено")}: каждое можно подвинуть отдельно` }
    );
  }

  function remove(id: string): void {
    setDraft((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
    setSelectedId(null);
    canvasRef.current?.focus();
  }

  function resize(id: string, dw: number, dh: number): void {
    update(id, (item, grid) => ({ w: clamp(item.w + dw, 1, grid.columns - item.x), h: clamp(item.h + dh, 1, grid.rows - item.y) }));
  }

  function setGrid(next: Partial<Pick<Draft, "columns" | "rows">>): void {
    setDraft((current) => ({
      ...current,
      columns: clamp(next.columns ?? current.columns, Math.max(GRID_LIMITS.columns[0], extent.columns), GRID_LIMITS.columns[1]),
      rows: clamp(next.rows ?? current.rows, Math.max(GRID_LIMITS.rows[0], extent.rows), GRID_LIMITS.rows[1])
    }));
  }

  function save(): void {
    if (!dirty || isPending) return;
    const request: SaveHallLayoutRequest = draft;
    setMessage(null);
    startTransition(async () => {
      const result = await saveHallLayout(clubId, request);
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      const next = fromLayout(result.data);
      setSaved(next);
      setDraft(next);
      setStored(true);
      setMessage({ ok: true, text: "Схема сохранена — касса уже видит зал по ней" });
    });
  }

  function revert(): void {
    setDraft(saved);
    setSelectedId(null);
    setArmed(null);
    setArrange(null);
    setMessage(null);
  }

  // Перетаскивание и растягивание элементов на листе.
  function onItemPointerDown(event: ReactPointerEvent<HTMLDivElement>, item: HallLayoutItem, mode: "move" | "resize"): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    setArmed(null);
    setArrange(null);
    setSelectedId(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: item.id, mode, startX: event.clientX, startY: event.clientY, origin: item };
  }

  function onItemPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const active = gesture.current;
    if (!active) return;
    const dx = Math.round((event.clientX - active.startX) / cell);
    const dy = Math.round((event.clientY - active.startY) / cell);
    const { origin } = active;
    if (active.mode === "move") {
      update(active.id, (_, grid) => ({ x: clamp(origin.x + dx, 0, grid.columns - origin.w), y: clamp(origin.y + dy, 0, grid.rows - origin.h) }));
    } else {
      update(active.id, (_, grid) => ({ w: clamp(origin.w + dx, 1, grid.columns - origin.x), h: clamp(origin.h + dy, 1, grid.rows - origin.y) }));
    }
  }

  function onItemPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!gesture.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.current = null;
  }

  function onItemKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, item: HallLayoutItem): void {
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = step[event.key];
    if (delta) {
      event.preventDefault();
      if (event.shiftKey) resize(item.id, delta[0], delta[1]);
      else update(item.id, (current, grid) => ({ x: clamp(current.x + delta[0], 0, grid.columns - current.w), y: clamp(current.y + delta[1], 0, grid.rows - current.h) }));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(item.id);
    }
  }

  // Палитра: короткое нажатие «берёт» элемент для клика по клетке, протягивание ставит его туда, где отпустили.
  function onPalettePointerDown(event: ReactPointerEvent<HTMLButtonElement>, pick: PaletteItem): void {
    if (event.button !== 0) return;
    justDragged.current = false;
    paletteDrag.current = { pick, startX: event.clientX, startY: event.clientY, dragging: false };
  }

  useEffect(() => {
    function move(event: PointerEvent): void {
      const drag = paletteDrag.current;
      if (!drag) return;
      if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_SLOP) return;
      drag.dragging = true;
      setGhost({ pick: drag.pick, clientX: event.clientX, clientY: event.clientY });
      setHover(cellAt(event.clientX, event.clientY));
    }
    function up(event: PointerEvent): void {
      const drag = paletteDrag.current;
      paletteDrag.current = null;
      if (!drag?.dragging) return;
      justDragged.current = true;
      setGhost(null);
      setHover(null);
      const target = cellAt(event.clientX, event.clientY);
      if (target) place(drag.pick, target, true);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  function onPaletteClick(event: ReactMouseEvent<HTMLButtonElement>, pick: PaletteItem): void {
    // После протягивания браузер всё равно шлёт click — его пропускаем.
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    // С клавиатуры (Enter/пробел) ставим сразу в первую свободную клетку и отдаём фокус элементу: дальше — стрелки.
    if (event.detail === 0) {
      const { w, h } = sizeOf(pick);
      place(pick, freeSpot(w, h), false);
      return;
    }
    setArrange(null);
    setArmed((current) => (current && current.kind === pick.kind && current.seatId === pick.seatId ? null : pick));
  }

  function onCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if ((armed || arrange) && event.pointerType === "mouse") setHover(cellAt(event.clientX, event.clientY));
  }

  function onCanvasClick(event: ReactMouseEvent<HTMLDivElement>): void {
    const target = cellAt(event.clientX, event.clientY);
    if (arrange && target) return arrangeFrom(target);
    if (armed && target) return place(armed, target, true);
    setSelectedId(null);
  }

  // Первый масштаб — самый крупный, при котором лист помещается по ширине.
  useEffect(() => {
    const width = scrollRef.current?.clientWidth ?? 0;
    const fit = ZOOMS.findLastIndex((zoom) => draft.columns * Math.round(BASE_CELL * zoom) + 32 <= width);
    if (fit >= 0) setZoomIndex(Math.min(fit, 4));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc отпускает взятое, Ctrl+S сохраняет, уход со страницы с несохранённой схемой спрашивает подтверждение.
  useEffect(() => {
    function keydown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setArmed(null);
        setArrange(null);
        if (!isTyping(event.target)) setSelectedId(null);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    }
    function beforeUnload(event: BeforeUnloadEvent): void {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("keydown", keydown);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  });

  const preview = (() => {
    const pick = ghost?.pick ?? armed ?? (arrange ? ({ kind: "seat" } as PaletteItem) : null);
    if (!pick || !hover) return null;
    const { w, h } = sizeOf(pick);
    if (arrange) return { x: hover.x, y: hover.y, w, h };
    return { x: clamp(hover.x - Math.floor((w - 1) / 2), 0, columns - w), y: clamp(hover.y - Math.floor((h - 1) / 2), 0, rows - h), w, h };
  })();

  const unplacedTotal = zones.reduce((sum, { seats }) => sum + seats.filter((seat) => !placedSeats.has(seat.id)).length, 0);
  const placing = Boolean(armed || arrange);
  const hint = arrange
    ? "Нажмите клетку, с которой начнётся первый ряд"
    : armed
      ? `Нажмите клетку, куда поставить: ${armed.kind === "seat" ? `место ${seatInfo.get(armed.seatId ?? "")?.seat.label ?? ""}` : KIND_META[armed.kind].name.toLowerCase()}. Esc — отменить`
      : selected
        ? "Стрелки двигают, Shift+стрелки меняют размер, Delete убирает"
        : "Тяните элемент из панели справа на схему или нажмите его, а потом клетку";

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="grid gap-1">
          <Link href="/hall" className="text-xs text-muted-foreground hover:text-foreground">Зал и касса</Link>
          <h1 className="text-xl font-semibold md:text-2xl">Схема зала</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className={cn("flex items-center gap-2 text-xs", dirty ? "text-warning" : "text-muted-foreground")} aria-live="polite">
            <span className={cn("size-2 rounded-full", dirty ? "bg-warning" : stored ? "bg-success" : "bg-muted-foreground/50")} aria-hidden />
            {dirty ? "Есть несохранённые изменения" : stored ? "Всё сохранено" : "Схема ещё не сохранялась"}
          </span>
          <Button variant="secondary" onClick={revert} disabled={!dirty || isPending}>Отменить изменения</Button>
          <Button onClick={save} disabled={!dirty || isPending}>{isPending ? "Сохраняем…" : "Сохранить схему"}</Button>
        </div>
      </header>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={cn("rounded-xl border px-4 py-2.5 text-sm", message.ok ? "border-success/40 bg-success/5 text-success" : "border-danger/50 bg-danger/5 text-danger")}>
          {message.text}
        </p>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-label="Лист схемы" className="overflow-hidden rounded-2xl border border-[#262d36] bg-[#12161b]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#262d36] px-3 py-2">
            <Stepper label="Ширина" value={columns} onChange={(value) => setGrid({ columns: value })} min={Math.max(GRID_LIMITS.columns[0], extent.columns)} max={GRID_LIMITS.columns[1]} />
            <Stepper label="Высота" value={rows} onChange={(value) => setGrid({ rows: value })} min={Math.max(GRID_LIMITS.rows[0], extent.rows)} max={GRID_LIMITS.rows[1]} />
            <span className="text-xs text-muted-foreground">клеток</span>
            <div className="ml-auto flex items-center gap-1" role="group" aria-label="Масштаб">
              <IconButton label="Уменьшить" onClick={() => setZoomIndex((index) => Math.max(0, index - 1))} disabled={zoomIndex === 0}><ZoomOut className="size-4" /></IconButton>
              <button type="button" onClick={() => setZoomIndex(2)} className="w-12 rounded-md py-1 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground" title="Вернуть 100%">
                {Math.round(ZOOMS[zoomIndex] * 100)}%
              </button>
              <IconButton label="Увеличить" onClick={() => setZoomIndex((index) => Math.min(ZOOMS.length - 1, index + 1))} disabled={zoomIndex === ZOOMS.length - 1}><ZoomIn className="size-4" /></IconButton>
            </div>
          </div>

          <div ref={scrollRef} className="max-h-[calc(100vh-15rem)] min-h-[24rem] overflow-auto overscroll-contain">
            <div className="grid w-max" style={{ gridTemplateColumns: `1.5rem ${columns * cell}px`, gridTemplateRows: `1.25rem ${rows * cell}px` }}>
              <div className="sticky left-0 top-0 z-20 bg-[#12161b]" />
              <Ruler axis="x" count={columns} cell={cell} highlight={hover?.x} />
              <Ruler axis="y" count={rows} cell={cell} highlight={hover?.y} />
              <div
                ref={canvasRef}
                tabIndex={-1}
                onClick={onCanvasClick}
                onPointerMove={onCanvasPointerMove}
                onPointerLeave={() => !ghost && setHover(null)}
                className={cn("layout-sheet relative outline-none", placing && "cursor-crosshair")}
                style={{ width: columns * cell, height: rows * cell, ["--cell" as string]: `${cell}px` }}
              >
                {items.map((item) => (
                  <EditorItem
                    key={item.id}
                    item={item}
                    cell={cell}
                    info={item.seatId ? seatInfo.get(item.seatId) : undefined}
                    selected={item.id === selectedId}
                    clashing={clashing.has(item.id)}
                    passive={placing}
                    refCallback={(node) => (node ? itemRefs.current.set(item.id, node) : itemRefs.current.delete(item.id))}
                    onPointerDown={onItemPointerDown}
                    onPointerMove={onItemPointerMove}
                    onPointerUp={onItemPointerUp}
                    onKeyDown={onItemKeyDown}
                    onFocus={() => setSelectedId(item.id)}
                  />
                ))}
                {preview ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute rounded-md border-2 border-dashed border-primary bg-primary/10"
                    style={{ left: preview.x * cell, top: preview.y * cell, width: preview.w * cell, height: preview.h * cell }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#262d36] px-3 py-2 text-xs text-muted-foreground">
            <span aria-live="polite">{hint}</span>
            {clashing.size ? <span className="text-danger">{clashing.size} {plural(clashing.size, "элемент накладывается", "элемента накладываются", "элементов накладываются")}</span> : null}
            <span className="ml-auto tabular-nums">{items.length} {plural(items.length, "элемент", "элемента", "элементов")}</span>
          </div>
        </section>

        <aside className="grid gap-4" aria-label="Панель схемы">
          {selected ? (
            <Inspector
              item={selected}
              info={selected.seatId ? seatInfo.get(selected.seatId) : undefined}
              onResize={(dw, dh) => resize(selected.id, dw, dh)}
              onLabel={(label) => update(selected.id, () => ({ label: label || undefined }))}
              onRemove={() => remove(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          ) : null}

          <PalettePanel title="Места" aside={unplacedTotal ? `${unplacedTotal} не на схеме` : "все на схеме"}>
            {zones.map(({ zone, seats }) => {
              const left = seats.filter((seat) => !placedSeats.has(seat.id));
              const arranging = arrange?.zoneId === zone.id;
              return (
                <div key={zone.id} className="grid gap-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold">{zone.name}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{left.length ? `${left.length} из ${seats.length}` : "все на схеме"}</span>
                  </div>
                  {left.length ? (
                    <>
                      <ul className="flex flex-wrap gap-1.5">
                        {left.map((seat) => {
                          const pick: PaletteItem = { kind: "seat", seatId: seat.id };
                          const active = armed?.seatId === seat.id;
                          return (
                            <li key={seat.id}>
                              <button
                                type="button"
                                onPointerDown={(event) => onPalettePointerDown(event, pick)}
                                onClick={(event) => onPaletteClick(event, pick)}
                                aria-pressed={active}
                                aria-label={`Место ${seat.label}, ${zone.name}`}
                                className={cn(
                                  "grid size-10 touch-none select-none place-items-center rounded-lg bg-[#222a33] font-display text-sm font-semibold tabular-nums text-[#c9d2dc] ring-1 ring-inset ring-white/[0.06] transition-shadow hover:ring-primary/70",
                                  active && "bg-primary text-primary-foreground ring-0"
                                )}
                              >
                                {seat.label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {arranging ? (
                        <div className="grid gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span>В ряд по</span>
                            <Stepper label="мест в ряду" hideLabel value={arrange.perRow} min={1} max={Math.max(1, left.length)} onChange={(perRow) => setArrange({ zoneId: zone.id, perRow })} />
                            <span>{plural(arrange.perRow, "месту", "места", "мест")}</span>
                          </div>
                          <p className="text-muted-foreground">Теперь нажмите клетку на схеме: с неё начнётся первый ряд, следующие встанут ниже через проход.</p>
                          <button type="button" onClick={() => setArrange(null)} className="justify-self-start text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Отменить</button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="justify-self-start"
                          onClick={() => {
                            setArmed(null);
                            setSelectedId(null);
                            setArrange({ zoneId: zone.id, perRow: Math.min(left.length, 7) });
                          }}
                        >
                          <Rows3 className="size-3.5" />
                          Расставить по порядку
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              );
            })}
          </PalettePanel>

          <PalettePanel title="Обстановка" aside="для ориентира">
            <ul className="grid grid-cols-2 gap-1.5">
              {FURNITURE.map((kind) => {
                const { name, icon: Icon } = KIND_META[kind];
                const active = armed?.kind === kind;
                return (
                  <li key={kind}>
                    <button
                      type="button"
                      onPointerDown={(event) => onPalettePointerDown(event, { kind })}
                      onClick={(event) => onPaletteClick(event, { kind })}
                      aria-pressed={active}
                      className={cn(
                        "flex h-10 w-full touch-none select-none items-center gap-2.5 rounded-lg border border-border bg-background px-3 text-sm transition-colors hover:border-primary/60",
                        active && "border-primary bg-primary/10 text-primary"
                      )}
                    >
                      <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                      {name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PalettePanel>
        </aside>
      </div>

      {ghost ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xl"
          style={{ left: ghost.clientX, top: ghost.clientY }}
        >
          {ghost.pick.kind === "seat" ? `Место ${seatInfo.get(ghost.pick.seatId ?? "")?.seat.label ?? ""}` : KIND_META[ghost.pick.kind].name}
        </div>
      ) : null}
    </div>
  );
}

function EditorItem({ item, cell, info, selected, clashing, passive, refCallback, onPointerDown, onPointerMove, onPointerUp, onKeyDown, onFocus }: {
  item: HallLayoutItem;
  cell: number;
  info?: { seat: SeatMapSeat; zone: ClubZone };
  selected: boolean;
  clashing: boolean;
  passive: boolean;
  refCallback: (node: HTMLDivElement | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, item: HallLayoutItem, mode: "move" | "resize") => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, item: HallLayoutItem) => void;
  onFocus: () => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const name = item.kind === "seat" ? `Место ${info?.seat.label ?? "?"}${info ? `, ${info.zone.name}` : ""}` : item.label ? `${meta.name} «${item.label}»` : meta.name;
  const roomy = item.w * cell >= 56;

  return (
    <div
      ref={refCallback}
      role="button"
      tabIndex={0}
      aria-label={`${name}: клетка ${item.x + 1}×${item.y + 1}, размер ${item.w}×${item.h}`}
      aria-pressed={selected}
      onPointerDown={(event) => onPointerDown(event, item, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => onKeyDown(event, item)}
      onFocus={onFocus}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "group absolute touch-none select-none outline-none",
        passive ? "pointer-events-none" : "cursor-grab active:cursor-grabbing",
        selected ? "z-10" : item.kind === "label" ? "z-[5]" : ""
      )}
      style={{ left: item.x * cell, top: item.y * cell, width: item.w * cell, height: item.h * cell, padding: item.kind === "wall" ? 0 : Math.max(1, Math.round(cell * 0.08)) }}
    >
      <div
        className={cn(
          "relative flex size-full items-center justify-center gap-1.5 overflow-hidden transition-shadow",
          item.kind === "seat" && "flex-col gap-0 rounded-md bg-[#222a33] text-[#c9d2dc] ring-1 ring-inset ring-white/[0.08]",
          item.kind === "wall" && "rounded-[3px] bg-[#5b6470]",
          item.kind === "label" && "rounded-md text-foreground/80 outline-1 -outline-offset-1 outline-dashed outline-white/15 group-hover:outline-white/30",
          item.kind !== "seat" && item.kind !== "wall" && item.kind !== "label" && "rounded-md border border-[#3a444f] bg-[#1b2128] text-muted-foreground",
          item.kind === "entrance" && "border-primary/40 text-primary/80",
          clashing && "ring-2 ring-danger/80",
          selected ? "shadow-[0_0_0_2px_#12161b,0_0_0_4px_var(--primary)]" : "group-hover:shadow-[0_0_0_1px_#12161b,0_0_0_2px_color-mix(in_srgb,var(--foreground)_45%,transparent)] group-focus-visible:shadow-[0_0_0_2px_#12161b,0_0_0_4px_var(--ring)]"
        )}
      >
        {item.kind === "seat" ? (
          <>
            <span className="font-display font-semibold leading-none tabular-nums" style={{ fontSize: Math.max(10, Math.min(18, cell * 0.55)) }}>{info?.seat.label ?? "?"}</span>
            {info && cell >= 24 ? <span className="mt-0.5 text-[9px] font-semibold leading-none opacity-50">{zoneTag(info.zone)}</span> : null}
          </>
        ) : item.kind === "wall" ? null : item.kind === "label" ? (
          <span className="truncate px-1 font-display font-semibold" style={{ fontSize: Math.max(10, Math.min(16, cell * 0.5)) }}>{item.label || "Подпись"}</span>
        ) : (
          <>
            <Icon className="shrink-0" style={{ width: Math.min(18, cell * 0.6), height: Math.min(18, cell * 0.6) }} aria-hidden />
            {roomy && (item.w >= 3 || item.label) ? <span className="truncate text-[11px] font-medium">{item.label || meta.name}</span> : null}
          </>
        )}
      </div>
      {selected ? (
        <div
          aria-hidden
          onPointerDown={(event) => onPointerDown(event, item, "resize")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute -bottom-1.5 -right-1.5 z-20 size-3.5 cursor-nwse-resize rounded-[3px] border-2 border-[#12161b] bg-primary"
          title="Потяните, чтобы изменить размер"
        />
      ) : null}
    </div>
  );
}

function Inspector({ item, info, onResize, onLabel, onRemove, onClose }: {
  item: HallLayoutItem;
  info?: { seat: SeatMapSeat; zone: ClubZone };
  onResize: (dw: number, dh: number) => void;
  onLabel: (label: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  return (
    <section aria-label="Выбранный элемент" className="grid gap-3 rounded-2xl border border-primary/40 bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" aria-hidden /></span>
        <div className="grid min-w-0">
          <h2 className="truncate font-sans text-sm font-semibold">{item.kind === "seat" ? `Место ${info?.seat.label ?? "?"}` : meta.name}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {item.kind === "seat" && info ? `${info.zone.name}, ` : ""}клетка {item.x + 1}×{item.y + 1}
          </span>
        </div>
        <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Снять выделение"><X className="size-4" /></button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Stepper label="Ширина" value={item.w} min={1} max={80} onChange={(value) => onResize(value - item.w, 0)} />
        <Stepper label="Высота" value={item.h} min={1} max={60} onChange={(value) => onResize(0, value - item.h)} />
      </div>
      {item.kind !== "seat" ? (
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {item.kind === "label" ? "Текст на схеме" : "Подпись, если нужна"}
          <input
            value={item.label ?? ""}
            maxLength={LABEL_MAX}
            onChange={(event) => onLabel(event.target.value)}
            placeholder={item.kind === "label" ? "Например, PlayStation" : meta.name}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
      ) : null}
      <Button variant="secondary" size="sm" onClick={onRemove} className="justify-self-start text-danger hover:text-danger">
        <Trash2 className="size-3.5" />
        Убрать со схемы
      </Button>
    </section>
  );
}

function PalettePanel({ title, aside, children }: { title: string; aside: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{aside}</span>
      </div>
      {children}
    </section>
  );
}

function Stepper({ label, value, min, max, onChange, hideLabel }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; hideLabel?: boolean }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {hideLabel ? null : <span className="text-xs text-muted-foreground">{label}</span>}
      <div className="flex items-center rounded-lg border border-border bg-background">
        <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} className="grid size-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`${label}: меньше`}>
          <Minus className="size-3.5" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
          }}
          className="h-7 w-10 bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={label}
        />
        <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} className="grid size-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`${label}: больше`}>
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
      {children}
    </button>
  );
}

/** Линейка по краю листа: номер каждой пятой клетки и подсветка клетки под курсором. */
function Ruler({ axis, count, cell, highlight }: { axis: "x" | "y"; count: number; cell: number; highlight?: number }) {
  const horizontal = axis === "x";
  return (
    <div
      aria-hidden
      className={cn("relative z-10 bg-[#12161b] text-[9px] tabular-nums text-muted-foreground/70", horizontal ? "sticky top-0 border-b border-[#262d36]" : "sticky left-0 border-r border-[#262d36]")}
      style={horizontal ? { width: count * cell } : { height: count * cell }}
    >
      {highlight !== undefined ? (
        <span className="absolute bg-primary/25" style={horizontal ? { left: highlight * cell, width: cell, top: 0, bottom: 0 } : { top: highlight * cell, height: cell, left: 0, right: 0 }} />
      ) : null}
      {Array.from({ length: count }, (_, index) => index)
        .filter((index) => index === 0 || (index + 1) % 5 === 0)
        .map((index) => (
          <span
            key={index}
            className="absolute leading-none"
            style={horizontal ? { left: index * cell, width: cell, top: 5, textAlign: "center" } : { top: index * cell + cell / 2 - 4, left: 0, right: 3, textAlign: "right" }}
          >
            {index + 1}
          </span>
        ))}
    </div>
  );
}
