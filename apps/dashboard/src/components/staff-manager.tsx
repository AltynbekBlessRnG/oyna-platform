"use client";

import type { ClubMember } from "@oyna/contracts";
import { Trash2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { addClubMember, removeClubMember } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

const ROLES = {
  admin: { label: "Владелец", hint: "Видит всё: аналитику, клиентов, настройки и сотрудников" },
  cashier: { label: "Кассир", hint: "Зал и касса: сажает, пополняет, открывает и закрывает смену, бар и брони" }
} as const;

type StaffRole = keyof typeof ROLES;

/** Сотрудники клуба: владелец добавляет кассиров по номеру, они входят через Telegram со своим телефоном. */
export function StaffManager({ clubId, members }: { clubId: string; members: ClubMember[] }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("cashier");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const staff = members.filter((member) => member.role === "admin" || member.role === "cashier");

  function add(): void {
    startTransition(async () => {
      const result = await addClubMember(clubId, phone, name, role);
      if (result.ok) {
        setPhone("");
        setName("");
        setMessage({ ok: true, text: `${result.data.name} — ${ROLES[role].label.toLowerCase()}. Пусть откроет кабинет и войдёт через Telegram со своим номером.` });
      } else setMessage({ ok: false, text: result.message });
    });
  }

  function remove(member: ClubMember): void {
    if (confirm !== member.userId) return setConfirm(member.userId);
    setConfirm(null);
    startTransition(async () => {
      const result = await removeClubMember(clubId, member.userId);
      setMessage(result.ok ? { ok: true, text: `${member.name} больше не имеет доступа к клубу` } : { ok: false, text: result.message });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Сотрудники</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2">
          {staff.map((member) => {
            const known = member.role === "admin" || member.role === "cashier" ? ROLES[member.role] : undefined;
            return (
              <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {member.phone} · <span className={cn(member.role === "admin" && "text-primary")}>{known?.label ?? member.role}</span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => remove(member)} aria-label={`Убрать доступ: ${member.name}`}>
                  <Trash2 className="size-4" />
                  {confirm === member.userId ? "Нажмите ещё раз" : "Убрать"}
                </Button>
              </li>
            );
          })}
          {staff.length === 0 ? <li className="text-sm text-muted-foreground">Пока никого. Добавьте первого кассира ниже.</li> : null}
        </ul>

        <div className="grid gap-3 rounded-xl bg-secondary/50 p-4">
          <p className="font-medium">Добавить сотрудника</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Телефон
              <input className={inputClass} inputMode="tel" autoComplete="off" placeholder="+7 7XX XXX XX XX" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Имя
              <input className={inputClass} placeholder="Например, Дана" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Роль">
            {(Object.keys(ROLES) as StaffRole[]).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                onClick={() => setRole(value)}
                className={cn("grid gap-0.5 rounded-xl border px-3 py-2 text-left", role === value ? "border-primary bg-primary/10" : "border-border hover:bg-secondary")}
              >
                <span className="text-sm font-medium">{ROLES[value].label}</span>
                <span className="text-xs text-muted-foreground">{ROLES[value].hint}</span>
              </button>
            ))}
          </div>
          <Button className="justify-self-start" disabled={isPending || phone.replace(/\D/g, "").length < 10} onClick={add}>
            <UserPlus className="size-4" />Добавить
          </Button>
        </div>
        {message ? <p role="status" className={cn("rounded-xl px-4 py-3 text-sm", message.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{message.text}</p> : null}
      </CardContent>
    </Card>
  );
}
