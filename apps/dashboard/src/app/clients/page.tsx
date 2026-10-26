import type { ClientSegment, ClientSort } from "@oyna/contracts";
import { Download, Search } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadActiveClub, loadClients, requireSession } from "@/lib/api";
import { isSegment, isSort, SEGMENT_ORDER, SEGMENTS, SORTS } from "@/lib/crm";
import { ago, clientName, duration, money, phone, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ClientsSearch {
  q?: string;
  segment?: string;
  sort?: string;
}

function href(params: { q?: string; segment?: ClientSegment | "risk"; sort?: ClientSort }): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.segment) query.set("segment", params.segment);
  if (params.sort && params.sort !== "lastVisit") query.set("sort", params.sort);
  const text = query.toString();
  return text ? `/clients?${text}` : "/clients";
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<ClientsSearch> }) {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const segment = isSegment(params.segment) ? params.segment : undefined;
  const sort = isSort(params.sort) ? params.sort : "lastVisit";
  const { data, error } = await loadClients(club.id, { search: q, segment, sort });
  const now = Date.now();
  const exportQuery = new URLSearchParams({ ...(segment ? { segment } : {}), ...(q ? { q } : {}), sort }).toString();

  return (
    <AppShell active="clients" club={club} clubs={clubs}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Клиенты</h1>
          {data ? <p className="mt-1 text-sm text-muted-foreground">Всего {data.total}: все, кто бронировал, играл или заказывал в баре</p> : null}
        </div>
        {data ? (
          <a href={`/clients/export?${exportQuery}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold hover:bg-secondary/80">
            <Download className="size-4" />Выгрузить в CSV
          </a>
        ) : null}
      </header>

      {!data ? (
        <Card className="max-w-xl"><CardContent className="p-5 text-sm text-muted-foreground">{error}</CardContent></Card>
      ) : (
        <div className="grid gap-5">
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Сегменты">
            <SegmentLink active={!segment} href={href({ q, sort })} label="Все" count={data.total} />
            {SEGMENT_ORDER.map((key) => (
              <SegmentLink key={key} active={segment === key} href={href({ q, sort, segment: key })} label={SEGMENTS[key].label} count={data.segments[key]} title={SEGMENTS[key].hint} />
            ))}
            <SegmentLink
              active={segment === "risk"}
              href={href({ q, sort, segment: "risk" })}
              label="Пропали"
              count={data.atRisk}
              title="ходили часто, но не приходят 2–8 недель: стоит позвонить или дать бонус"
              danger
            />
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            <form action="/clients" className="relative min-w-0 flex-1 sm:max-w-sm">
              {segment ? <input type="hidden" name="segment" value={segment} /> : null}
              {sort !== "lastVisit" ? <input type="hidden" name="sort" value={sort} /> : null}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                name="q"
                defaultValue={q}
                aria-label="Поиск по имени, телефону или тегу"
                placeholder="Имя, телефон или тег"
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </form>
            <div className="flex flex-wrap gap-1 text-sm" aria-label="Сортировка">
              {SORTS.map((option) => (
                <Link
                  key={option.value}
                  href={href({ q, segment, sort: option.value })}
                  aria-current={sort === option.value ? "true" : undefined}
                  className={cn("rounded-lg px-2.5 py-1.5", sort === option.value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          <Card>
            {data.clients.length === 0 ? (
              <CardContent className="p-6 text-sm text-muted-foreground">
                {q || segment ? "Под эти условия никто не подходит. Сбросьте поиск или выберите другой сегмент." : "Клиентов пока нет. Они появятся, когда игроки начнут бронировать и садиться за компьютеры."}
              </CardContent>
            ) : (
              <>
                <table className="hidden w-full text-left text-sm md:table">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 font-medium">Клиент</th>
                      <th className="px-3 py-3 font-medium">Сегмент</th>
                      <th className="px-3 py-3 font-medium">Последний визит</th>
                      <th className="px-3 py-3 text-right font-medium">Визитов</th>
                      <th className="px-3 py-3 text-right font-medium">Наиграл</th>
                      <th className="px-3 py-3 text-right font-medium">Потратил</th>
                      <th className="px-5 py-3 text-right font-medium">Баланс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((client) => (
                      <tr key={client.userId} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                        <td className="px-5 py-3">
                          <Link href={`/clients/${client.userId}`} className="block font-medium hover:text-primary">{clientName(client.nickname, client.phone)}</Link>
                          <span className="text-xs text-muted-foreground">{phone(client.phone)}{client.tags.length ? `, ${client.tags.join(", ")}` : ""}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex flex-wrap gap-1">
                            <Badge tone={SEGMENTS[client.segment].tone}>{SEGMENTS[client.segment].label}</Badge>
                            {client.atRisk ? <Badge tone="danger">пропал</Badge> : null}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{ago(client.lastVisitAt, now)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{client.visitDays}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{duration(client.minutesPlayed)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(client.totalSpent)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(client.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y divide-border md:hidden">
                  {data.clients.map((client) => (
                    <li key={client.userId}>
                      <Link href={`/clients/${client.userId}`} className="flex items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{clientName(client.nickname, client.phone)}</span>
                            {client.atRisk ? <Badge tone="danger">пропал</Badge> : <Badge tone={SEGMENTS[client.segment].tone}>{SEGMENTS[client.segment].label}</Badge>}
                          </span>
                          <span className="block text-xs text-muted-foreground">{ago(client.lastVisitAt, now)}, {client.visitDays} {plural(client.visitDays, "визит", "визита", "визитов")}</span>
                        </span>
                        <span className="text-right text-sm tabular-nums">
                          {money(client.totalSpent)}
                          <span className="block text-xs text-muted-foreground">баланс {money(client.balance)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function SegmentLink({ active, href, label, count, title, danger = false }: { active: boolean; href: string; label: string; count: number; title?: string; danger?: boolean }) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span className={cn("tabular-nums", danger && count > 0 ? "text-danger" : "text-muted-foreground")}>{count}</span>
    </Link>
  );
}
