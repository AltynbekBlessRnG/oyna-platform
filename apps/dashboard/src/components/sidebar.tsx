import Link from "next/link";
import { BarChart3, CalendarDays, Gamepad2, LayoutDashboard, Megaphone, Monitor, Settings, Users } from "lucide-react";

const navigation = [
  { label: "Обзор", icon: LayoutDashboard, active: true },
  { label: "Бронирования", icon: CalendarDays },
  { label: "Игровые места", icon: Monitor },
  { label: "Клиенты", icon: Users },
  { label: "Аналитика", icon: BarChart3 },
  { label: "Акции", icon: Megaphone }
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-border bg-card/40 p-5 lg:flex lg:flex-col">
      <Link href="/" className="mb-9 flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Gamepad2 className="size-5" /></span>
        <span className="text-xl font-black tracking-tight">OYNA</span>
      </Link>
      <nav className="space-y-1" aria-label="Основная навигация">
        {navigation.map(({ label, icon: Icon, active }) => (
          <Link key={label} href="#" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <Icon className="size-4" />{label}
          </Link>
        ))}
      </nav>
      <Link href="#" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
        <Settings className="size-4" />Настройки
      </Link>
    </aside>
  );
}

