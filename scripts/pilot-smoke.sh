#!/usr/bin/env bash
# Сквозная проверка пилотного сценария OYNA: каталог → вход игрока → бронь →
# решение клуба → уведомление игроку. Тестовая бронь отменяется в конце.
#
#   API_URL=http://localhost:4000/api CLUB_ADMIN_KEY=... ./scripts/pilot-smoke.sh
#
# Проверки правки клуба и зон меняют данные, поэтому включаются явно:
#   OYNA_SMOKE_MUTATE=1 ./scripts/pilot-smoke.sh
set -u

API=${API_URL:-http://localhost:4000/api}
KEY=${CLUB_ADMIN_KEY:-pilot-admin}
CLUB=${CLUB_ID:-vertex-arena}
ZONE=${ZONE_ID:-vip}
PHONE=${SMOKE_PHONE:-+77011234567}
pass=0
fail=0

check() {
  if [ "$2" = "$3" ]; then
    echo "✓ $1"
    pass=$((pass + 1))
  else
    echo "✗ $1 — ожидалось [$3], получено [$2]"
    fail=$((fail + 1))
  fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

echo "API: $API · клуб: $CLUB"

check "health" "$(code "$API/health")" "200"
check "каталог клубов отвечает" "$(code "$API/clubs")" "200"
check "клуб $CLUB найден" "$(curl -s "$API/clubs/$CLUB" | json 'd["id"]')" "$CLUB"
ZONES=$(curl -s "$API/clubs/$CLUB/zones")
check "у клуба есть зона $ZONE" "$(echo "$ZONES" | json "any(z['id']=='$ZONE' for z in d)")" "True"
SEATS=$(echo "$ZONES" | json "[z['seatCount'] for z in d if z['id']=='$ZONE'][0]")

CHALLENGE=$(curl -s -X POST "$API/auth/request-code" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}" | json 'd["challengeId"]')
CODE=$(curl -s -X POST "$API/auth/request-code" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}" | json 'd.get("devCode","")')
if [ -z "$CODE" ]; then
  echo "! режим production: код приходит по SMS, дальнейшие шаги пропущены"
  echo "итог: $pass успешно, $fail неудачно"
  [ "$fail" -eq 0 ] || exit 1
  exit 0
fi
TOKEN=$(curl -s -X POST "$API/auth/verify-code" -H 'Content-Type: application/json' -d "{\"challengeId\":\"$CHALLENGE\",\"code\":\"$CODE\",\"name\":\"Смоук-тест\"}" | json 'd["accessToken"]')
check "игрок вошёл по телефону" "$([ -n "$TOKEN" ] && echo yes)" "yes"

START=$(python3 -c "import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=30)).isoformat().replace('+00:00','Z'))")
SEAT="$CLUB-$ZONE-$(printf '%02d' "$SEATS")"
BOOKING=$(curl -s -X POST "$API/bookings" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d "{\"clubId\":\"$CLUB\",\"zoneId\":\"$ZONE\",\"seatIds\":[\"$SEAT\"],\"startAt\":\"$START\",\"durationHours\":2,\"playerName\":\"Смоук-тест\"}")
BOOKING_ID=$(echo "$BOOKING" | json 'd.get("id","")')
check "бронь создана со статусом pending" "$(echo "$BOOKING" | json 'd.get("status","")')" "pending"
check "то же место повторно занять нельзя" "$(code -X POST "$API/bookings" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d "{\"clubId\":\"$CLUB\",\"zoneId\":\"$ZONE\",\"seatIds\":[\"$SEAT\"],\"startAt\":\"$START\",\"durationHours\":2,\"playerName\":\"Смоук-тест\"}")" "409"

check "кабинет закрыт без доступа" "$(code "$API/admin/clubs/$CLUB/bookings")" "401"
check "кабинет закрыт для игрока" "$(code -H "Authorization: Bearer $TOKEN" "$API/admin/clubs/$CLUB/bookings")" "403"
check "кабинет открыт администратору" "$(code -H "x-club-admin-key: $KEY" "$API/admin/clubs/$CLUB/bookings")" "200"
check "бронь не находится в чужом клубе" "$(code -X PATCH -H "x-club-admin-key: $KEY" -H 'Content-Type: application/json' -d '{"status":"confirmed"}' "$API/admin/clubs/__unknown__/bookings/$BOOKING_ID/status")" "404"

check "клуб подтвердил бронь" "$(curl -s -X PATCH -H "x-club-admin-key: $KEY" -H 'Content-Type: application/json' -d '{"status":"confirmed"}' "$API/admin/clubs/$CLUB/bookings/$BOOKING_ID/status" | json 'd["status"]')" "confirmed"
check "игрок получил уведомление" "$(curl -s -H "Authorization: Bearer $TOKEN" "$API/notifications" | json 'd[0]["type"] if d else "нет"')" "booking_status"

if [ "${OYNA_SMOKE_MUTATE:-0}" = "1" ]; then
  check "карточка клуба обновляется" "$(curl -s -X PATCH -H "x-club-admin-key: $KEY" -H 'Content-Type: application/json' -d '{"openingHours":"10:00 — 06:00"}' "$API/admin/clubs/$CLUB" | json 'd["openingHours"]')" "10:00 — 06:00"
  check "некорректный цвет отклоняется" "$(code -X PATCH -H "x-club-admin-key: $KEY" -H 'Content-Type: application/json' -d '{"accent":"green"}' "$API/admin/clubs/$CLUB")" "400"
  check "идентификатор зоны обязан быть слагом" "$(code -X PUT -H "x-club-admin-key: $KEY" -H 'Content-Type: application/json' -d '{"zones":[{"id":"Зона 1","name":"Temp","description":"","pricePerHour":100,"seatCount":1}]}' "$API/admin/clubs/$CLUB/zones")" "400"
  check "клубу нужна хотя бы одна зона" "$(code -X PUT -H "x-club-admin-key: $KEY" -H 'Content-Type: application/json' -d '{"zones":[]}' "$API/admin/clubs/$CLUB/zones")" "400"
  # Защиту зоны с будущими бронями (409) проверяет режим с PostgreSQL: во временном хранилище зоны и брони живут раздельно.
fi

check "тестовая бронь отменена" "$(curl -s -X PATCH -H "x-club-admin-key: $KEY" -H 'Content-Type: application/json' -d '{"status":"cancelled"}' "$API/admin/clubs/$CLUB/bookings/$BOOKING_ID/status" | json 'd["status"]')" "cancelled"

echo
echo "итог: $pass успешно, $fail неудачно"
[ "$fail" -eq 0 ] || exit 1
