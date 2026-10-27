"use client";

import type { StationEnrollmentCode } from "@oyna/contracts";
import { MonitorUp } from "lucide-react";
import { useState, useTransition } from "react";
import { issueEnrollmentCode } from "@/app/actions";
import { Button } from "@/components/ui/button";

/** Код клуба для программы Zen на компьютерах: один код на весь зал вместо id и ключа на каждом ПК. */
export function StationEnrollment({ clubId }: { clubId: string }) {
  const [code, setCode] = useState<StationEnrollmentCode | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function issue(): void {
    setError("");
    startTransition(async () => {
      const result = await issueEnrollmentCode(clubId);
      if (result.ok) setCode(result.data);
      else setError(result.message);
    });
  }

  if (!code) {
    return (
      <div className="grid justify-items-end gap-1">
        <Button variant="secondary" onClick={issue} disabled={isPending}>
          <MonitorUp className="size-4" />
          Подключить компьютеры
        </Button>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  const until = new Date(code.expiresAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  return (
    <section aria-label="Код клуба" className="grid max-w-sm gap-3 rounded-2xl border border-primary/60 bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Код клуба</span>
        <span className="text-xs text-muted-foreground">действует до {until}</span>
      </div>
      <code className="font-display text-3xl font-bold tracking-widest text-primary">{code.code}</code>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Запустите Zen на компьютере зала</li>
        <li>Введите этот код и выберите номер места</li>
        <li>Задайте PIN администратора — им вы выходите из Zen в Windows</li>
      </ol>
      <p className="text-xs text-muted-foreground">Один код подходит для всех компьютеров. Новый код отменяет этот.</p>
      <Button variant="ghost" size="sm" onClick={issue} disabled={isPending} className="justify-self-start">
        Выпустить новый код
      </Button>
    </section>
  );
}
