import { loadActiveClub, loadClients, requireSession } from "@/lib/api";
import { isSegment, isSort, SEGMENTS } from "@/lib/crm";

function cell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Выгрузка клиентов для Excel: точка с запятой и BOM, чтобы русский Excel открыл файл без мастера импорта. */
export async function GET(request: Request): Promise<Response> {
  await requireSession();
  const { club } = await loadActiveClub();
  const url = new URL(request.url);
  const segment = url.searchParams.get("segment") ?? undefined;
  const sort = url.searchParams.get("sort") ?? undefined;
  const { data, error } = await loadClients(club.id, {
    search: url.searchParams.get("q") ?? undefined,
    segment: isSegment(segment) ? segment : undefined,
    sort: isSort(sort) ? sort : undefined
  });
  if (!data) return new Response(error ?? "Клиенты недоступны", { status: 503 });

  const header = ["Ник", "Имя", "Телефон", "Сегмент", "Пропал", "Теги", "Первый визит", "Последний визит", "Дней визитов", "Сессий", "Минут игры", "Потратил на время", "Потратил в баре", "Всего потратил", "Внёс на баланс", "Баланс", "Броней", "Отменённых броней"];
  const rows = data.clients.map((client) => [
    client.nickname,
    client.name,
    client.phone,
    SEGMENTS[client.segment].label,
    client.atRisk ? "да" : "",
    client.tags.join(", "),
    client.firstSeenAt.slice(0, 10),
    client.lastVisitAt?.slice(0, 10) ?? "",
    client.visitDays,
    client.sessionsCount,
    client.minutesPlayed,
    client.spentOnTime,
    client.spentOnBar,
    client.totalSpent,
    client.toppedUp,
    client.balance,
    client.bookingsCount,
    client.cancelledBookings
  ]);
  const csv = [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zen-clients-${club.id}-${date}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
