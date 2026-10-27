"use client";

import { type FormEvent, useState, useTransition } from "react";
import { confirmAdminCode, requestAdminCode } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ZenMark } from "@/components/zen-mark";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary";

export function LoginForm() {
  const [phone, setPhone] = useState("+7");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Обе ступени — настоящие формы, чтобы Enter работал так же, как кнопка.
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending) return;
    if (challengeId) {
      if (code.length >= 4) confirm();
    } else if (phone.length >= 11) {
      sendCode();
    }
  }

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
        <ZenMark size={48} className="mb-2" />
        <CardTitle className="text-xl">Кабинет клуба Zen</CardTitle>
        <p className="text-sm text-muted-foreground">Вход по номеру телефона администратора клуба</p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={submit}>
          {error ? <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
          {challengeId ? (
            <>
              {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
              <label className="text-sm font-medium" htmlFor="code">Код подтверждения</label>
              <input id="code" className={inputClass} inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(event) => setCode(event.target.value)} />
              <Button type="submit" disabled={isPending || code.length < 4}>Войти</Button>
              <Button type="button" variant="ghost" disabled={isPending} onClick={() => { setChallengeId(""); setCode(""); }}>Изменить номер</Button>
            </>
          ) : (
            <>
              <label className="text-sm font-medium" htmlFor="phone">Телефон</label>
              <input id="phone" className={inputClass} inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
              <Button type="submit" disabled={isPending || phone.length < 11}>Получить код</Button>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
