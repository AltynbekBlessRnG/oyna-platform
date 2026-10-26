import type { ClientTimelineEntry } from "@oyna/contracts";
import { ArrowLeft, CalendarDays, Coffee, Monitor, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ClientBalance, ClientNotes, ClientTags } from "@/components/client-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActiveClub, loadClient, requireSession } from "@/lib/api";
import { SEGMENTS } from "@/lib/crm";
import { ago, clientName, day, dayTime, duration, money, phone } from "@/lib/format";
import { cn } from "@/lib/utils";

const BOOKING_STATUS = { pending: "ждёт ответа", confirmed: "подтверждена", cancelled: "отменена", completed: "завершена" } as const;
const ORDER_STATUS = { new: "новый", accepted: "принят", delivered: "выдан", cancelled: "отменён" } as const;

export default async function ClientPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  const { userId } = await params;
  const { data, error, status } = await loadClient(club.id, userId);
  if (status === 404) notFound();
  const now = Date.now();

  return (
    <AppShell active="clients" club={club} clubs={clubs}>
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />Все клиенты
      </Link>
      {!data ? (
        <Card className="max-w-xl"><CardContent className="p-5 text-sm text-muted-foreground">{error}</CardContent></Card>
      ) : (
        <>
          <header className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold md:text-3xl">{clientName(data.client.nickname, data.client.phone)}</h1>
              <Badge tone={SEGMENTS[data.client.segment].tone} title={SEGMENTS[data.client.segment].hint}>{SEGMENTS[data.client.segment].label}</Badge>
              {data.client.atRisk ? <Badge tone="danger">пропал: давно не приходит</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.client.name !== data.client.nickname && data.client.name !== "Игрок Zen" ? `${data.client.name}, ` : ""}
              <a href={`tel:${data.client.phone}`} className="hover:text-foreground">{phone(data.client.phone)}</a>, в клубе с {day(data.client.firstSeenAt)}
            </p>
          </header>

          <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Fact label="Баланс" value={money(data.client.balance)} />
            <Fact label="Потратил" value={money(data.client.totalSpent)} note={`время ${money(data.client.spentOnTime)}, бар ${money(data.client.spentOnBar)}`} />
            <Fact label="Дней визитов" value={String(data.client.visitDays)} note={`за 30 дней: ${data.client.visitDays30}`} />
            <Fact label="Наиграл" value={duration(data.client.minutesPlayed)} note={`${data.client.sessionsCount} сессий`} />
            <Fact label="Последний визит" value={ago(data.client.lastVisitAt, now)} />
            <Fact label="Брони" value={String(data.client.bookingsCount)} note={data.client.cancelledBookings ? `отменено ${data.client.cancelledBookings}` : "без отмен"} />
          </dl>

          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader><CardTitle>История</CardTitle></CardHeader>
              <CardContent>
                {data.timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Пока ничего не происходило.</p>
                ) : (
                  <ol className="grid gap-1">
                    {data.timeline.map((entry) => <TimelineRow key={`${entry.kind}-${entry.id}`} entry={entry} />)}
                  </ol>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <ClientBalance clubId={club.id} userId={data.client.userId} phone={data.client.phone} balance={data.client.balance} />
              <ClientTags clubId={club.id} userId={data.client.userId} tags={data.client.tags} />
              <ClientNotes clubId={club.id} userId={data.client.userId} notes={data.notes} />
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold">{value}</dd>
      {note ? <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

function TimelineRow({ entry }: { entry: ClientTimelineEntry }) {
  const { icon: Icon, title, detail, amount } = describe(entry);
  const voided = entry.kind === "order" && entry.status === "cancelled";
  return (
    <li className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-secondary/40">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{dayTime(entry.at)}{detail ? `, ${detail}` : ""}</p>
      </div>
      {amount ? <span className={cn("text-sm tabular-nums", voided ? "text-muted-foreground line-through" : amount.positive ? "text-success" : "text-foreground")}>{amount.text}</span> : null}
    </li>
  );
}

function describe(entry: ClientTimelineEntry): { icon: typeof Monitor; title: string; detail?: string; amount?: { text: string; positive: boolean } } {
  switch (entry.kind) {
    case "session":
      return {
        icon: Monitor,
        title: entry.active ? `Играет за местом ${entry.seatLabel}` : `Играл за местом ${entry.seatLabel}`,
        detail: `${entry.zoneName}, ${duration(entry.minutes)}`,
        ...(entry.charged !== undefined ? { amount: { text: `−${money(entry.charged)}`, positive: false } } : {})
      };
    case "balance":
      return {
        icon: Wallet,
        title: entry.type === "top_up" ? "Пополнение на кассе" : "Корректировка баланса",
        ...(entry.reason ? { detail: entry.reason } : {}),
        amount: { text: `${entry.amount > 0 ? "+" : "−"}${money(Math.abs(entry.amount))}`, positive: entry.amount > 0 }
      };
    case "booking":
      return {
        icon: CalendarDays,
        title: `Бронь на ${dayTime(entry.startAt)}`,
        detail: `${entry.zoneName}, ${entry.seatLabels.length > 1 ? "места" : "место"} ${entry.seatLabels.join(", ")}, ${entry.durationHours} ч, ${BOOKING_STATUS[entry.status]}`
      };
    case "order":
      return {
        icon: Coffee,
        title: `Заказ в баре, ${ORDER_STATUS[entry.status]}`,
        detail: entry.summary,
        amount: { text: money(entry.total), positive: false }
      };
  }
}
