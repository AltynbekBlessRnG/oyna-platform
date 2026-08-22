"use client";

import { Gamepad2 } from "lucide-react";
import { useState, useTransition } from "react";
import { confirmAdminCode, requestAdminCode } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary";

export function LoginForm() {
  const [phone, setPhone] = useState("+7");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function sendCode(): void {
    setError("");
    startTransition(async () => {
      const result = await requestAdminCode(phone);
      if (!result.challengeId) {
        setError(result.message ?? "Не удалось отправить код");
        return;
      }
      setChallengeId(result.challengeId);
      setHint(result.devCode ? `Код для разработки: ${result.devCode}` : "Код отправлен на телефон");
    });
  }

  function confirm(): void {
    setError("");
    startTransition(async () => {
      const result = await confirmAdminCode(challengeId, code);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <span className="mb-2 grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Gamepad2 className="size-5" /></span>
        <CardTitle className="text-xl">Кабинет клуба OYNA</CardTitle>
        <p className="text-sm text-muted-foreground">Вход по номеру телефона администратора клуба</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error ? <p role="alert" className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-300">{error}</p> : null}
        {challengeId ? (
          <>
            {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
            <label className="text-sm font-medium" htmlFor="code">Код из SMS</label>
            <input id="code" className={inputClass} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
            <Button disabled={isPending || code.length < 4} onClick={confirm}>Войти</Button>
            <Button variant="ghost" disabled={isPending} onClick={() => { setChallengeId(""); setCode(""); }}>Изменить номер</Button>
          </>
        ) : (
          <>
            <label className="text-sm font-medium" htmlFor="phone">Телефон</label>
            <input id="phone" className={inputClass} inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <Button disabled={isPending || phone.length < 11} onClick={sendCode}>Получить код</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
