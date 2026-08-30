#!/usr/bin/env bash
# Сборка пилотного APK через EAS. Профиль preview собирает APK и смотрит на боевой API.
#
#   ./scripts/build-apk.sh            запустить сборку и не ждать её окончания
#   ./scripts/build-apk.sh --wait     дождаться и получить ссылку на файл
#
# Нужен выполненный `npx eas-cli login`. Бесплатный план Expo: 15 Android-сборок в месяц.
set -eu

cd "$(dirname "$0")/../apps/mobile"
WAIT=${1:---no-wait}
[ "$WAIT" = "--wait" ] && WAIT="--wait" || WAIT="--no-wait"

echo "$(date '+%Y-%m-%d %H:%M') запуск сборки APK"
npx --yes eas-cli@latest build \
  --platform android \
  --profile preview \
  --non-interactive \
  "$WAIT" \
  --message "Пилотный APK OYNA"
