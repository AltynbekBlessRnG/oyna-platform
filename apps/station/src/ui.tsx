import type { ReactNode } from "react";
import type { InstalledGame } from "./platform";

const ICONS: Record<string, ReactNode> = {
  games: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  recent: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" />
      <path d="M12 17.5h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Logo() {
  return (
    <svg className="logo" width="36" height="36" viewBox="0 0 28 28" aria-label="Zen">
      <circle cx="14" cy="14" r="12" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M9 10h10l-10 8h10" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type View = "games" | "recent" | "help";

const RAIL: { view: View; label: string }[] = [
  { view: "games", label: "Игры" },
  { view: "recent", label: "Недавние" }
];

/** Левая колонка навигации. На экране блокировки та же, но неактивная. */
export function Rail({ active, onSelect }: { active?: View; onSelect?: (view: View) => void }) {
  const locked = !onSelect;
  const button = (view: View, label: string) => (
    <button key={view} className="rail-btn" aria-current={active === view ? "page" : undefined} disabled={locked} onClick={() => onSelect?.(view)}>
      <Icon name={view} />
      {label}
    </button>
  );
  return (
    <nav className="rail" aria-label={locked ? "Разделы откроются после входа" : "Разделы"}>
      <Logo />
      {RAIL.map(({ view, label }) => button(view, label))}
      <span className="grow" />
      {button("help", "Помощь")}
    </nav>
  );
}

export function GameCover({ game, large }: { game: InstalledGame; large?: boolean }) {
  const size = game.logo.length > 10 ? 18 : game.logo.length > 6 ? 24 : 34;
  return (
    <div className="cover" style={{ background: game.bg, color: game.ink }}>
      <span style={{ fontSize: large ? size * 1.8 : size }}>{game.logo}</span>
    </div>
  );
}
