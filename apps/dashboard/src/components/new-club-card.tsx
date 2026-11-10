"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClub, switchClub } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/** Только владельцу платформы: завести клуб и сразу выдать доступ его владельцу. */
export function NewClubCard() {
  const [form, setForm] = useState({ name: "", city: "Алматы", address: "", ownerPhone: "", ownerName: "" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }) });

  function submit(): void {
    startTransition(async () => {
      const result = await createClub(form);
      if (result.ok) {
        setCreated(result.data.id);
        setMessage({ ok: true, text: `Клуб «${result.data.name}» заведён. Владелец входит в кабинет со своим номером через Telegram и сам настраивает зоны, цены и компьютеры.` });
        setForm({ name: "", city: form.city, address: "", ownerPhone: "", ownerName: "" });
      } else setMessage({ ok: false, text: result.message });
    });
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="size-4" />Новый клуб на платформе</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Видно только вам. Клуб создаётся с зоной Standard на 10 мест.</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-muted-foreground">Название клуба<input className={inputClass} placeholder="Cyber Arena" {...field("name")} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Город<input className={inputClass} {...field("city")} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">Адрес<input className={inputClass} placeholder="ул. Абая, 10" {...field("address")} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Телефон владельца клуба<input className={inputClass} inputMode="tel" placeholder="+7 7XX XXX XX XX" {...field("ownerPhone")} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Имя владельца<input className={inputClass} placeholder="Например, Ерлан" {...field("ownerName")} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending || form.name.trim().length < 2 || form.ownerPhone.replace(/\D/g, "").length < 10} onClick={submit}>Завести клуб</Button>
          {created ? <Button variant="secondary" disabled={isPending} onClick={() => startTransition(async () => {
            await switchClub(created);
            router.push("/settings");
          })}>Открыть этот клуб</Button> : null}
        </div>
        {message ? <p role="status" className={message.ok ? "rounded-xl bg-success/10 px-4 py-3 text-sm text-success" : "rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger"}>{message.text}</p> : null}
      </CardContent>
    </Card>
  );
}
