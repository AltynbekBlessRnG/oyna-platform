"use client";

import type { ClientNote } from "@oyna/contracts";
import { Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { addClientNote, adjustClientBalance, deleteClientNote, setClientTags, topUpClient } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dayTime, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const SUGGESTED_TAGS = ["VIP", "студент", "команда", "турнирный", "любит PS5", "ночной"];

function Feedback({ result }: { result: { ok: boolean; text: string } | null }) {
  if (!result) return null;
  return <p role={result.ok ? "status" : "alert"} className={cn("text-sm", result.ok ? "text-success" : "text-danger")}>{result.text}</p>;
}

/** Пополнение — живые деньги на кассе. Корректировка — возврат или компенсация, всегда с причиной в истории. */
export function ClientBalance({ clubId, userId, phone, balance }: { clubId: string; userId: string; phone: string; balance: number }) {
  const [mode, setMode] = useState<"top_up" | "adjustment">("top_up");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(): void {
    const value = Number(amount);
    setResult(null);
    startTransition(async () => {
      if (mode === "top_up") {
        const response = await topUpClient(clubId, userId, phone, value);
        setResult(response.ok ? { ok: true, text: `Пополнено на ${money(value)}, баланс ${money(response.data.balance)}` } : { ok: false, text: response.message });
        if (response.ok) setAmount("");
        return;
      }
      const response = await adjustClientBalance(clubId, userId, value, reason);
      setResult(response.ok ? { ok: true, text: `Баланс исправлен, теперь ${money(response.data)}` } : { ok: false, text: response.message });
      if (response.ok) {
        setAmount("");
        setReason("");
      }
    });
  }

  const valid = mode === "top_up" ? /^\d+$/.test(amount) && Number(amount) > 0 : /^-?\d+$/.test(amount) && Number(amount) !== 0 && reason.trim().length >= 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Баланс: {money(balance)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="grid grid-cols-2 rounded-xl bg-secondary p-1" role="tablist" aria-label="Операция">
          {(["top_up", "adjustment"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => { setMode(value); setResult(null); setAmount(""); }}
              className={cn("rounded-lg py-1.5 font-medium", mode === value ? "bg-background" : "text-muted-foreground")}
            >
              {value === "top_up" ? "Пополнить" : "Исправить"}
            </button>
          ))}
        </div>
        <input
          className={inputClass}
          inputMode={mode === "top_up" ? "numeric" : "text"}
          aria-label="Сумма в тенге"
          placeholder={mode === "top_up" ? "Сумма, ₸" : "Сумма, ₸: 500 вернуть, −500 списать"}
          value={amount}
          onChange={(event) => setAmount(mode === "top_up" ? event.target.value.replace(/\D/g, "") : event.target.value.replace(/[^\d-]/g, ""))}
        />
        {mode === "adjustment" ? (
          <input className={inputClass} aria-label="Причина" placeholder="Причина: сбой ПК, ошибка кассы…" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
        ) : null}
        <Button disabled={isPending || !valid} onClick={submit}>{mode === "top_up" ? "Пополнить" : "Сохранить корректировку"}</Button>
        <Feedback result={result} />
      </CardContent>
    </Card>
  );
}

export function ClientTags({ clubId, userId, tags }: { clubId: string; userId: string; tags: string[] }) {
  const [draft, setDraft] = useState("");
  const [current, setCurrent] = useState(tags);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: string[]): void {
    const previous = current;
    setCurrent(next);
    setResult(null);
    startTransition(async () => {
      const response = await setClientTags(clubId, userId, next);
      if (response.ok) setCurrent(response.data);
      else {
        setCurrent(previous);
        setResult({ ok: false, text: response.message });
      }
    });
  }

  function add(tag: string): void {
    const value = tag.trim();
    if (!value || current.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    save([...current, value]);
    setDraft("");
  }

  const suggestions = SUGGESTED_TAGS.filter((tag) => !current.some((item) => item.toLowerCase() === tag.toLowerCase()));

  return (
    <Card>
      <CardHeader><CardTitle>Теги</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {current.length ? (
          <ul className="flex flex-wrap gap-2">
            {current.map((tag) => (
              <li key={tag} className="flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1">
                {tag}
                <button type="button" disabled={isPending} onClick={() => save(current.filter((item) => item !== tag))} aria-label={`Убрать тег ${tag}`} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Тегов нет. Тег VIP сразу переводит клиента в сегмент VIP.</p>
        )}
        <form onSubmit={(event) => { event.preventDefault(); add(draft); }} className="flex gap-2">
          <input className={inputClass} aria-label="Новый тег" placeholder="Новый тег" maxLength={24} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <Button type="submit" variant="secondary" disabled={isPending || !draft.trim()}>Добавить</Button>
        </form>
        {suggestions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <button key={tag} type="button" disabled={isPending} onClick={() => add(tag)} className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
                + {tag}
              </button>
            ))}
          </div>
        ) : null}
        <Feedback result={result} />
      </CardContent>
    </Card>
  );
}

export function ClientNotes({ clubId, userId, notes }: { clubId: string; userId: string; notes: ClientNote[] }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function add(): void {
    setResult(null);
    startTransition(async () => {
      const response = await addClientNote(clubId, userId, text);
      if (response.ok) setText("");
      else setResult({ ok: false, text: response.message });
    });
  }

  function remove(noteId: string): void {
    startTransition(async () => {
      const response = await deleteClientNote(clubId, userId, noteId);
      if (!response.ok) setResult({ ok: false, text: response.message });
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Заметки</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <textarea
          className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          aria-label="Новая заметка"
          placeholder="Например: любит место у окна, должен 500 ₸ за колу"
          maxLength={1000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button variant="secondary" disabled={isPending || !text.trim()} onClick={add}>Сохранить заметку</Button>
        <Feedback result={result} />
        {notes.length ? (
          <ul className="grid gap-2">
            {notes.map((note) => (
              <li key={note.id} className="group rounded-xl bg-secondary p-3">
                <p className="whitespace-pre-wrap">{note.text}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{note.authorName}, {dayTime(note.createdAt)}</span>
                  <button type="button" disabled={isPending} onClick={() => remove(note.id)} aria-label="Удалить заметку" className="grid size-7 place-items-center rounded-lg hover:bg-background hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
