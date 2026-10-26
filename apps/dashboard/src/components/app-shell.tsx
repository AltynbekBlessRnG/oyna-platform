import type { ManagedClub } from "@oyna/contracts";
import { BarChart3, LayoutDashboard, LogOut, Monitor, Settings, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { ClubSwitcher } from "@/components/club-switcher";
import { ZenMark } from "@/components/zen-mark";
import { cn } from "@/lib/utils";

export type ShellSection = "overview" | "hall" | "clients" | "analytics" | "settings";

const NAVIGATION: { key: ShellSection; label: string; short: string; icon: typeof Monitor; href: string }[] = [
  { key: "overview", label: "Обзор", short: "Обзор", icon: LayoutDashboard, href: "/" },
  { key: "hall", label: "Зал и касса", short: "Зал", icon: Monitor, href: "/hall" },
  { key: "clients", label: "Клиенты", short: "Клиенты", icon: Users, href: "/clients" },
  { key: "analytics", label: "Аналитика", short: "Отчёты", icon: BarChart3, href: "/analytics" },
  { key: "settings", label: "Настройки", short: "Клуб", icon: Settings, href: "/settings" }
];

interface AppShellProps {
  active: ShellSection;
  club: ManagedClub;
  clubs: ManagedClub[];
  children: ReactNode;
}

/** Каркас кабинета: меню слева на широком экране, панель снизу на телефоне — касса часто работает с планшета. */
export function AppShell({ active, club, clubs, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border p-5 lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2" aria-label="Zen — на главную кабинета">
          <ZenMark size={34} />
          <span className="font-display text-lg font-semibold">Zen</span>
        </Link>
        <ClubSwitcher club={club} clubs={clubs} />
        <nav className="mt-6 space-y-1" aria-label="Разделы кабинета">
          {NAVIGATION.map(({ key, label, icon: Icon, href }) => (
            <Link
              key={key}
              href={href}
              aria-current={key === active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                key === active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-auto">
          <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <LogOut className="size-4" />
            Выйти
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <ZenMark size={28} />
          <div className="min-w-0 flex-1"><ClubSwitcher club={club} clubs={clubs} compact /></div>
          <form action={signOut}>
            <button type="submit" aria-label="Выйти" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary">
              <LogOut className="size-4" />
            </button>
          </form>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-28 md:p-8 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Разделы кабинета">
        {NAVIGATION.map(({ key, short, icon: Icon, href }) => (
          <Link
            key={key}
            href={href}
            aria-current={key === active ? "page" : undefined}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", key === active ? "text-primary" : "text-muted-foreground")}
          >
            <Icon className="size-5" />
            {short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
