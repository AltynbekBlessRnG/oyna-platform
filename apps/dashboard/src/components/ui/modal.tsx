"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  title: ReactNode;
  /** Подпись для экранного диктора, если заголовок — не просто текст. */
  label: string;
  subtitle?: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  // Содержимое закрытого <details> скрыто через content-visibility, offsetParent у него есть: проверяем видимость.
  const visible = (element: HTMLElement) => (typeof element.checkVisibility === "function" ? element.checkVisibility({ visibilityProperty: true }) : element.offsetParent !== null);
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element === document.activeElement || visible(element));
}

/**
 * Окно по центру экрана поверх затемнения: страница под ним не сдвигается.
 * Закрывается крестиком, Esc и нажатием мимо окна; высокое содержимое прокручивается внутри.
 * Фокус переходит в окно (на первое поле, иначе на крестик), Tab по кругу не выходит из окна,
 * после закрытия фокус возвращается на то, что окно открыло.
 */
export function Modal({ title, label, subtitle, onClose, className, children }: ModalProps) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // Родитель часто передаёт новую функцию на каждый рендер: держим последнюю, а фокус двигаем только при открытии.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // На сенсорном экране поле с фокусом сразу открывает клавиатуру и прячет окно: там фокус — на крестике.
    const field = window.matchMedia("(pointer: fine)").matches ? dialog.current?.querySelector<HTMLElement>("input:not([type=checkbox]):not([disabled]), select, textarea") : null;
    (field ?? closeButton.current)?.focus();
    const close = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", close);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function trap(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Tab" || !dialog.current) return;
    const list = focusables(dialog.current);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="anim-backdrop fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={trap}
        className={cn("anim-modal max-h-[calc(100dvh-2rem)] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl", className)}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Закрыть" className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
