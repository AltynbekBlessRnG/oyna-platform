"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
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

/**
 * Окно по центру экрана поверх затемнения: страница под ним не сдвигается.
 * Закрывается крестиком, Esc и нажатием мимо окна; высокое содержимое прокручивается внутри.
 */
export function Modal({ title, label, subtitle, onClose, className, children }: ModalProps) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className={cn("max-h-[calc(100dvh-2rem)] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl", className)}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
