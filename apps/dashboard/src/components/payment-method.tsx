"use client";

import type { PaymentMethod } from "@oyna/contracts";
import { cn } from "@/lib/utils";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = { cash: "Наличные", kaspi: "Kaspi", card: "Карта" };

/** Как игрок заплатил на кассе: от этого зависит, сколько наличных должно быть при закрытии смены. */
export function PaymentMethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (method: PaymentMethod) => void }) {
  return (
    <div className="grid grid-cols-3 rounded-xl bg-secondary p-1" role="radiogroup" aria-label="Способ оплаты">
      {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => (
        <button
          key={method}
          type="button"
          role="radio"
          aria-checked={value === method}
          onClick={() => onChange(method)}
          className={cn("rounded-lg py-1.5 text-sm font-medium", value === method ? "bg-background text-foreground" : "text-muted-foreground")}
        >
          {PAYMENT_LABELS[method]}
        </button>
      ))}
    </div>
  );
}
