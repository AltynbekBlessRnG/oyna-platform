import Link from "next/link";
import { BarChart3, CalendarDays, Gamepad2, LayoutDashboard, LogOut, Megaphone, Monitor, Settings, Users } from "lucide-react";
import { signOut } from "@/app/actions";

const navigation = [
  { key: "overview", label: "Обзор", icon: LayoutDashboard, href: "/" },
  { key: "bookings", label: "Бронирования", icon: CalendarDays, href: "/" },
  { key: "seats", label: "Игровые места", icon: Monitor, href: "/settings" },
  { key: "clients", label: "Клиенты", icon: Users, href: "#" },
  { key: "analytics", label: "Аналитика", icon: BarChart3, href: "#" },
  { key: "promo", label: "Акции", icon: Megaphone, href: "#" }
];

interface SidebarProps {
  active?: string;
}

export function Sidebar({ active = "overview" }: SidebarProps) {
  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-border bg-card/40 p-5 lg:flex lg:flex-col">
      <Link href="/" className="mb-9 flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Gamepad2 className="size-5" /></span>
        <span className="text-xl font-black tracking-tight">OYNA</span>
      </Link>
      <nav className="space-y-1" aria-label="Основная навигация">
        {navigation.map(({ key, label, icon: Icon, href }) => (
          <Link key={key} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${key === active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <Icon className="size-4" />{label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto space-y-1">
        <Link href="/settings" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active === "settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
          <Settings className="size-4" />Настройки
        </Link>
        <form action={signOut}>
          <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <LogOut className="size-4" />Выйти
          </button>
        </form>
      </div>
    </aside>
  );
}
