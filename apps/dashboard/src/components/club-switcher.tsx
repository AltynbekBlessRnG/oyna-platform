"use client";

import type { ManagedClub } from "@oyna/contracts";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchClub } from "@/app/actions";
import { cn } from "@/lib/utils";

/** Сотрудник сети клубов переключается между ними; у одного клуба переключателя нет. */
export function ClubSwitcher({ club, clubs, compact = false }: { club: ManagedClub; clubs: ManagedClub[]; compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (clubs.length < 2) {
    return (
      <div className={cn("min-w-0", !compact && "rounded-xl bg-secondary px-3 py-2.5")}>
        <p className="truncate text-sm font-semibold">{club.name}</p>
        {!compact ? <p className="truncate text-xs text-muted-foreground">{club.city}</p> : null}
      </div>
    );
  }

  return (
    <label className="block min-w-0">
      <span className="sr-only">Клуб</span>
      <select
        value={club.id}
        disabled={isPending}
        onChange={(event) => {
          const clubId = event.target.value;
          startTransition(async () => {
            await switchClub(clubId);
            router.refresh();
          });
        }}
        className="h-10 w-full min-w-0 truncate rounded-xl border border-border bg-secondary px-3 text-sm font-semibold outline-none focus:border-primary disabled:opacity-60"
      >
        {clubs.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}, {item.city}
          </option>
        ))}
      </select>
    </label>
  );
}
