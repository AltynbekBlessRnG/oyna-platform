import { BellRing, CheckCircle2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Подключение уведомлений владельцу: смена, недостача, пропавший компьютер, новая бронь. */
export function TelegramAlertsCard({ linked, url }: { linked: boolean; url?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="size-4" />Уведомления в Telegram</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Владельцам приходит: открытие и закрытие смены с выручкой и недостачей, компьютер пропал во время игры, новая бронь из приложения.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {linked ? (
          <p className="flex items-center gap-2 text-success"><CheckCircle2 className="size-4" />Подключено: уведомления приходят вам в Telegram.</p>
        ) : url ? (
          <>
            <p className="text-muted-foreground">Откройте бота и нажмите «Поделиться номером» — так он узнает, что это вы.</p>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 justify-self-start rounded-xl bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90">
              <Send className="size-4" />Подключить Telegram
            </a>
          </>
        ) : (
          <p className="text-muted-foreground">Бот Telegram на сервере не настроен.</p>
        )}
        <p className="text-xs text-muted-foreground">Каждый владелец подключает свой Telegram сам. Кассирам отчёты по кассе не приходят.</p>
      </CardContent>
    </Card>
  );
}
