"use client";

import { Power } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { commandFreeStations } from "@/app/actions";
import { Button } from "@/components/ui/button";

/** При закрытии клуба: выключить все свободные компьютеры. За кем играют — не трогаем. */
export function HallPower({ clubId }: { clubId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 5_000);
    return () => clearTimeout(timer);
  }, [confirm]);

  function shutDown(): void {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    startTransition(async () => {
      const response = await commandFreeStations(clubId, "shutdown");
      if (!response.ok) return setResult(response.message);
      const done = response.data.filter((item) => item.delivered).length;
      const missed = response.data.length - done;
      setResult(response.data.length === 0 ? "Свободных компьютеров на связи нет" : `Выключаются: ${done}${missed ? `, не ответили: ${missed}` : ""}`);
    });
  }

  return (
    <div className="grid justify-items-end gap-1">
      <Button variant="secondary" onClick={shutDown} disabled={isPending} className={confirm ? "text-danger" : undefined}>
        <Power className="size-4" />
        {confirm ? "Нажмите ещё раз: выключить свободные" : "Выключить свободные ПК"}
      </Button>
      {result ? <p role="status" className="text-sm text-muted-foreground">{result}</p> : null}
    </div>
  );
}
