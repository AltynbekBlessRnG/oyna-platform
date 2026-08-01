# OYNA

Единая платформа для поиска и бронирования компьютерных клубов Казахстана.

## Приложения

- `apps/mobile` — мобильное приложение игрока на React Native + Expo.
- `apps/dashboard` — кабинет клуба на Next.js.
- `apps/api` — API на NestJS.
- `packages/contracts` — общие контракты данных.

## Запуск

```bash
pnpm install
pnpm dev:api
pnpm dev:dashboard
pnpm dev:mobile
```

API по умолчанию доступен на `http://localhost:4000/api`, кабинет — на `http://localhost:3000`.

## Сценарий бронирования

В мобильном приложении уже работает путь: клуб → дата и время → зона → места → проверка → подтверждение.

Основные API-методы:

- `GET /api/clubs/:clubId/zones`
- `GET /api/clubs/:clubId/availability?zoneId=standard&startAt=...&durationHours=3`
- `POST /api/bookings`
- `GET /api/bookings/:id`

API поддерживает PostgreSQL с транзакционной блокировкой мест; без `DATABASE_URL` автоматически включается временное in-memory хранилище.

## Пилотный режим

```bash
copy .env.example .env
pnpm db:up
pnpm dev:api
pnpm dev:dashboard
pnpm dev:mobile
```

При наличии `DATABASE_URL` API автоматически создаёт таблицы PostgreSQL. Без базы проект продолжает работать на временном in-memory хранилище.

- Вход по телефону: в development используется код `0000`.
- Новые брони получают статус `pending`.
- Администратор подтверждает или отклоняет заявку в кабинете.
- Пользователь видит историю и может отменить будущую бронь.
- Интеграция клуба по умолчанию работает в ручном режиме.

Перед встречей с клубом см. [чек-лист пилота](docs/PILOT_CHECKLIST.md) и [вопросы по интеграции](docs/INTEGRATION_QUESTIONS.md).
