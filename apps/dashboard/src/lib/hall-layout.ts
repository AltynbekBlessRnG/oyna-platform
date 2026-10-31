import type { HallLayoutItem, HallLayoutItemKind } from "@oyna/contracts";
import { BrickWall, CircleDot, ConciergeBell, DoorOpen, Gamepad2, Glasses, Martini, Monitor, Sofa, Toilet, Type, type LucideIcon } from "lucide-react";

/** Обстановка — всё на схеме, кроме мест: её рисуют для ориентира, на работу кассы она не влияет. */
export type FurnitureKind = Exclude<HallLayoutItemKind, "seat">;

export interface KindMeta {
  name: string;
  icon: LucideIcon;
  /** Размер нового элемента в клетках. */
  w: number;
  h: number;
}

export const SEAT_SIZE = { w: 2, h: 2 };

export const KIND_META: Record<HallLayoutItemKind, KindMeta> = {
  seat: { name: "Место", icon: Monitor, ...SEAT_SIZE },
  sofa: { name: "Диван", icon: Sofa, w: 4, h: 2 },
  console: { name: "Консоль", icon: Gamepad2, w: 2, h: 1 },
  billiards: { name: "Бильярд", icon: CircleDot, w: 3, h: 5 },
  vr: { name: "VR-зона", icon: Glasses, w: 3, h: 3 },
  bar: { name: "Бар", icon: Martini, w: 6, h: 2 },
  reception: { name: "Ресепшен", icon: ConciergeBell, w: 4, h: 2 },
  wc: { name: "Туалет", icon: Toilet, w: 2, h: 2 },
  entrance: { name: "Вход", icon: DoorOpen, w: 3, h: 1 },
  wall: { name: "Стена", icon: BrickWall, w: 6, h: 1 },
  label: { name: "Подпись", icon: Type, w: 5, h: 1 }
};

export const FURNITURE: FurnitureKind[] = ["sofa", "console", "billiards", "vr", "bar", "reception", "wc", "entrance", "wall", "label"];

export const GRID_LIMITS = { columns: [4, 80], rows: [4, 60] } as const;
export const MAX_ITEMS = 600;
export const LABEL_MAX = 40;

export function overlaps(a: Pick<HallLayoutItem, "x" | "y" | "w" | "h">, b: Pick<HallLayoutItem, "x" | "y" | "w" | "h">): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
