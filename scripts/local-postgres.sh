#!/usr/bin/env bash
# Локальный PostgreSQL без root и без Docker.
#
# Бинарники берутся из npm-пакета @embedded-postgres/linux-x64 и кладутся
# в ~/.local/share/oyna/pgsql, данные — в ~/.local/share/oyna/data.
# Подключение совпадает с .env.example: postgresql://oyna:oyna@localhost:5432/oyna
#
#   ./scripts/local-postgres.sh install   скачать бинарники и создать кластер
#   ./scripts/local-postgres.sh start     запустить сервер
#   ./scripts/local-postgres.sh stop      остановить сервер
#   ./scripts/local-postgres.sh status    показать состояние
#
# Для клуба и production нужен managed PostgreSQL, а не этот вариант.
set -eu

ROOT="${OYNA_PG_HOME:-$HOME/.local/share/oyna}"
BIN="$ROOT/pgsql/bin"
DATA="$ROOT/data"
LOG="$ROOT/postgres.log"
PORT="${OYNA_PG_PORT:-5432}"
USER_NAME=oyna
PASSWORD=oyna

install_binaries() {
  if [ -x "$BIN/postgres" ]; then
    echo "бинарники уже на месте: $BIN"
    return
  fi
  local work
  work=$(mktemp -d)
  echo "скачиваю PostgreSQL в $work"
  (cd "$work" && npm init -y > /dev/null 2>&1 && npm i @embedded-postgres/linux-x64 > /dev/null 2>&1)
  local native="$work/node_modules/@embedded-postgres/linux-x64"
  # npm блокирует postinstall-скрипты, а без него не будет симлинков на библиотеки
  (cd "$native" && node scripts/hydrate-symlinks.js > /dev/null)
  mkdir -p "$ROOT"
  cp -r "$native/native" "$ROOT/pgsql"
  rm -rf "$work"
  echo "готово: $("$BIN/postgres" --version)"
}

create_cluster() {
  if [ -d "$DATA" ]; then
    echo "кластер уже создан: $DATA"
    return
  fi
  local pwfile
  pwfile=$(mktemp)
  printf '%s' "$PASSWORD" > "$pwfile"
  "$BIN/initdb" -D "$DATA" -U "$USER_NAME" --auth-local=trust --auth-host=scram-sha-256 \
    --pwfile="$pwfile" --encoding=UTF8 --locale=C.UTF-8 > /dev/null
  rm -f "$pwfile"
  echo "кластер создан: $DATA"
}

start_server() {
  if "$BIN/pg_ctl" -D "$DATA" status > /dev/null 2>&1; then
    echo "сервер уже запущен на порту $PORT"
    return
  fi
  "$BIN/pg_ctl" -D "$DATA" -l "$LOG" -o "-p $PORT -k $DATA -h 127.0.0.1" start > /dev/null
  echo "сервер запущен: postgresql://$USER_NAME:$PASSWORD@localhost:$PORT/oyna"
}

create_database() {
  local api_dir
  api_dir="$(cd "$(dirname "$0")/../apps/api" && pwd)"
  (cd "$api_dir" && node -e '
    const { Client } = require("pg");
    const [port] = process.argv.slice(1);
    (async () => {
      const admin = new Client({ connectionString: `postgresql://oyna:oyna@localhost:${port}/postgres` });
      await admin.connect();
      const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", ["oyna"]);
      if (!exists.rowCount) await admin.query("CREATE DATABASE oyna OWNER oyna");
      await admin.end();
    })().catch((error) => { console.error(error.message); process.exit(1); });
  ' "$PORT")
  echo "база oyna готова"
}

case "${1:-status}" in
  install)
    install_binaries
    create_cluster
    start_server
    create_database
    ;;
  start)
    start_server
    ;;
  stop)
    "$BIN/pg_ctl" -D "$DATA" stop > /dev/null && echo "сервер остановлен"
    ;;
  status)
    if "$BIN/pg_ctl" -D "$DATA" status > /dev/null 2>&1; then
      echo "запущен · порт $PORT · данные $DATA"
    else
      echo "остановлен · данные $DATA"
    fi
    ;;
  *)
    echo "команды: install | start | stop | status" >&2
    exit 1
    ;;
esac
