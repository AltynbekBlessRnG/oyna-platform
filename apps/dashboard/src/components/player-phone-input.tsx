"use client";

import { useEffect, useRef, useState } from "react";
import { type PlayerSuggestion, searchPlayers } from "@/app/actions";

const money = (value: number): string => `${value.toLocaleString("ru-KZ")} ₸`;

/**
 * Поле «телефон игрока», в которое можно вписать и имя, и последние цифры номера:
 * Vence подскажет постоянных игроков, и кассиру не нужно помнить телефоны.
 */
export function PlayerPhoneInput({ clubId, value, onChange, className, label }: {
  clubId: string;
  value: string;
  onChange: (phone: string) => void;
  className: string;
  label: string;
}) {
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const query = value.trim();
    const digits = query.replace(/\D/g, "");
    // Полный номер уже введён — подсказывать нечего.
    if (query.length < 2 || digits.length >= 11) {
      setSuggestions([]);
      return;
    }
    const id = ++request.current;
    const timer = setTimeout(async () => {
      const found = await searchPlayers(clubId, query);
      if (id === request.current) {
        setSuggestions(found);
        setActive(0);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [clubId, value]);

  function choose(player: PlayerSuggestion): void {
    onChange(player.phone);
    setSuggestions([]);
    setOpen(false);
  }

  const shown = open && suggestions.length > 0;
  return (
    <div className="relative">
      <input
        className={className}
        autoComplete="off"
        aria-label={label}
        placeholder="Телефон, имя или последние цифры"
        value={value}
        role="combobox"
        aria-expanded={shown}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!shown) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(suggestions[active]);
          } else if (event.key === "Escape") setOpen(false);
        }}
      />
      {shown ? (
        <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {suggestions.map((player, index) => (
            <li key={player.phone} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${index === active ? "bg-secondary" : "hover:bg-secondary"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(player)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{player.name}</span>
                  <span className="text-xs text-muted-foreground">…{player.phone.replace(/\D/g, "").slice(-4)}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{money(player.balance)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
