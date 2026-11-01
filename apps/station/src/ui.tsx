import type { ReactNode } from "react";
import type { InstalledGame } from "./platform";

const ICONS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </>
  ),
  bar: (
    <>
      <path d="M6 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M9 3.5c-.6.8-.6 1.7 0 2.5M12.5 3.5c-.6.8-.6 1.7 0 2.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  plus: <path d="M12 6v12M6 12h12" />,
  minus: <path d="M6 12h12" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
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
    <svg className="logo" width="36" height="36" viewBox="0 0 28 28" aria-label="Vence">
      <circle cx="14" cy="14" r="12" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M9 9.5l5 9 5-9" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type View = "home" | "games" | "bar" | "recent" | "help";

const RAIL: { view: View; label: string }[] = [
  { view: "home", label: "Главная" },
  { view: "games", label: "Игры" },
  { view: "bar", label: "Бар" },
  { view: "recent", label: "Недавние" }
];

/** Левая колонка навигации игрока. `badges` — счётчики на кнопках, например позиций в корзине бара. */
export function Rail({ active, onSelect, badges }: { active: View; onSelect: (view: View) => void; badges?: Partial<Record<View, number>> }) {
  const button = (view: View, label: string) => (
    <button key={view} className="rail-btn" aria-current={active === view ? "page" : undefined} onClick={() => onSelect(view)}>
      <Icon name={view} />
      {label}
      {badges?.[view] ? (
        <span className="rail-badge" aria-label={`в корзине ${badges[view]}`}>
          {badges[view]}
        </span>
      ) : null}
    </button>
  );
  return (
    <nav className="rail" aria-label="Разделы">
      <Logo />
      {RAIL.map(({ view, label }) => button(view, label))}
      <span className="grow" />
      {button("help", "Помощь")}
    </nav>
  );
}

export function GameCover({ game, large }: { game: InstalledGame; large?: boolean }) {
  const size = game.logo.length > 10 ? 18 : game.logo.length > 6 ? 24 : 34;
  if (game.cover) return <div className="cover cover-art" style={{ backgroundImage: `url(${game.cover})` }} role="img" aria-label={game.name} />;
  return (
    <div className="cover" style={{ background: game.bg, color: game.ink }}>
      {/* Размер в rem, чтобы надпись росла вместе с плиткой на больших экранах (15px — базовый rem). */}
      <span style={{ fontSize: `${(large ? size * 1.8 : size) / 15}rem` }}>{game.logo}</span>
    </div>
  );
}
