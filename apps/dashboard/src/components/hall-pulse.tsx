import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { HallSnapshot } from "@/lib/api";
import { clock, playerLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const ENDING_SOON_MIN = 30;

/**
 * Первое, что видит владелец: сколько мест занято прямо сейчас, по живым сессиям,
 * и что требует внимания — компьютер отвалился посреди игры или место скоро освободится.
 */
export function HallPulse({ hall, now }: { hall?: HallSnapshot; now: number }) {
  if (!hall) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">Зал недоступен: сервер Zen не отвечает.</CardContent>
      </Card>
    );
  }

  const seats = hall.seatMap.zones.flatMap((entry) => entry.seats);
  const stationBySeat = new Map(hall.stations.map((station) => [station.seatId, station]));
  const sessions = [...hall.sessions].sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  const lost = sessions.filter((session) => stationBySeat.get(session.seatId)?.online === false);
  const endingSoon = sessions.filter((session) => Date.parse(session.endsAt) - now <= ENDING_SOON_MIN * 60_000);
  const occupied = seats.filter((seat) => seat.status === "occupied").length;
  const reserved = seats.filter((seat) => seat.status === "reserved").length;
  const lostSeats = new Set(lost.map((session) => session.seatId));

  return (
    <Card>
      <CardContent className="grid gap-6 p-5 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
        <div>
          <p className="font-display text-5xl font-semibold leading-none">
            {occupied}
            <span className="text-2xl text-muted-foreground"> из {seats.length}</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            мест занято сейчас{reserved ? `, ещё ${reserved} в брони` : ""}
          </p>
          <Link href="/hall" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            Открыть кассу <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Места в зале">
            {hall.seatMap.zones.map(({ zone, seats: zoneSeats }) => (
              <div key={zone.id}>
                <p className="mb-1.5 text-xs text-muted-foreground">{zone.name}</p>
                <div className="flex max-w-[22rem] flex-wrap gap-1">
                  {zoneSeats.map((seat) => (
                    <span
                      key={seat.id}
                      title={`${seat.label}: ${seat.status === "free" ? "свободно" : seat.status === "reserved" ? "бронь" : "занято"}`}
                      className={cn(
                        "size-3.5 rounded-[3px]",
                        lostSeats.has(seat.id)
                          ? "bg-danger"
                          : seat.status === "occupied"
                            ? "bg-foreground/70"
                            : seat.status === "reserved"
                              ? "border border-dashed border-muted-foreground"
                              : "border border-primary"
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {lost.length || endingSoon.length ? (
            <ul className="grid gap-1.5 text-sm">
              {lost.map((session) => (
                <li key={`lost-${session.id}`} className="text-danger">
                  Место {session.seatLabel}: компьютер не отвечает, а за ним играет {playerLabel(session.playerName, session.playerPhoneTail)}
                </li>
              ))}
              {endingSoon.map((session) => (
                <li key={`soon-${session.id}`} className="text-muted-foreground">
                  Место {session.seatLabel} освободится в {clock(session.endsAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Все компьютеры на связи, ближайшие полчаса никто не уходит.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
