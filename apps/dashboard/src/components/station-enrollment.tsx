"use client";

import type { StationEnrollmentCode } from "@oyna/contracts";
import { Download, MonitorUp } from "lucide-react";
import { useState, useTransition } from "react";
import { issueEnrollmentCode } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/** Код клуба для программы Zen на компьютерах: один код на весь зал вместо id и ключа на каждом ПК. */
export function StationEnrollment({ clubId, setupUrl }: { clubId: string; setupUrl: string }) {
  const [code, setCode] = useState<StationEnrollmentCode | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function issue(): void {
    setError("");
    startTransition(async () => {
      const result = await issueEnrollmentCode(clubId);
      if (result.ok) {
        setCode(result.data);
        setOpen(true);
      } else setError(result.message);
    });
  }

  // Повторное нажатие показывает тот же код, пока он действует: новый код отменил бы уже розданный.
  function show(): void {
    if (code && Date.parse(code.expiresAt) > Date.now()) setOpen(true);
    else issue();
  }

  const until = code ? new Date(code.expiresAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="grid justify-items-end gap-1">
      <Button variant="secondary" onClick={show} disabled={isPending}>
        <MonitorUp className="size-4" />
        Подключить компьютеры
      </Button>
      {error && !open ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {code && open ? (
        <Modal title="Код клуба" label="Код клуба" subtitle={`Действует до ${until}`} onClose={() => setOpen(false)}>
          <div className="grid gap-3">
            <code className="font-display text-3xl font-bold tracking-widest text-primary">{code.code}</code>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                На компьютере зала скачайте{" "}
                <a href={setupUrl} className="font-medium text-primary underline underline-offset-2">
                  Zen-Setup.exe
                </a>
                , запустите и перезагрузите компьютер
              </li>
              <li>Введите этот код и выберите номер места</li>
              <li>Задайте PIN администратора — им вы выходите из Zen в Windows</li>
            </ol>
            <a
              href={setupUrl}
              className="inline-flex h-10 items-center justify-center gap-2 justify-self-start rounded-xl bg-secondary px-4 text-sm font-medium hover:bg-secondary/80"
            >
              <Download className="size-4" />
              Скачать Zen-Setup.exe
            </a>
            <p className="text-xs text-muted-foreground">Один код подходит для всех компьютеров. Новый код отменяет этот.</p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <Button variant="ghost" size="sm" onClick={issue} disabled={isPending} className="justify-self-start">
              Выпустить новый код
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
