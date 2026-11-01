import type { StationCredentials, StationEnrollment } from "@oyna/contracts";
import { type FormEvent, useState } from "react";
import { DEFAULT_API_URL, hashPin, type StationConfig } from "./config";
import { Logo } from "./ui";

/**
 * Первый запуск: админ вводит код клуба из кабинета, выбирает место этого компьютера и задаёт PIN.
 * Один код на весь зал — не нужно переписывать длинный ключ на каждый ПК.
 */
export function Setup({ onSave, notice, apiUrl: initialApiUrl }: { onSave: (config: StationConfig) => Promise<void>; notice?: string; apiUrl?: string }) {
  const [apiUrl, setApiUrl] = useState(initialApiUrl ?? DEFAULT_API_URL);
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<StationEnrollment | null>(null);
  const [seatId, setSeatId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(notice ?? "");
  const [busy, setBusy] = useState(false);

  const call = async <T,>(path: string, body: object): Promise<T> => {
    const base = apiUrl.trim().replace(/\/+$/, "").replace(/\/api$/, "");
    const response = await fetch(`${base}/api/stations/enrollment${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
    if (!response.ok) throw new Error(payload.message ?? "Сервер клуба не ответил");
    return payload;
  };

  const run = async (event: FormEvent, work: () => Promise<void>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof TypeError ? "Нет связи с сервером клуба" : failure instanceof Error ? failure.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  const lookUp = (event: FormEvent) =>
    run(event, async () => {
      const found = await call<StationEnrollment>("/lookup", { code });
      setEnrollment(found);
      setSeatId(found.seats.find((seat) => !seat.taken)?.seatId ?? "");
    });

  const enroll = (event: FormEvent) =>
    run(event, async () => {
      const credentials = await call<StationCredentials>("", { code, seatId });
      await onSave({ apiUrl: apiUrl.trim(), stationId: credentials.station.id, token: credentials.token, adminPinHash: await hashPin(pin) });
    });

  if (!enrollment) {
    return (
      <main className="setup">
        <form className="setup-card" onSubmit={(event) => void lookUp(event)}>
          <Logo />
          <h1>Подключить компьютер к клубу</h1>
          <p className="muted">В кабинете Vence откройте «Зал и касса» и нажмите «Подключить компьютеры». Введите код клуба.</p>
          {error && <p className="setup-notice">{error}</p>}
          <label>
            Код клуба
            <input
              className="code-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              required
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <details>
            <summary>Адрес сервера</summary>
            <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} required spellCheck={false} aria-label="Адрес сервера" />
          </details>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Проверяем…" : "Дальше"}
          </button>
        </form>
      </main>
    );
  }

  const chosen = enrollment.seats.find((seat) => seat.seatId === seatId);
  return (
    <main className="setup">
      <form className="setup-card wide" onSubmit={(event) => void enroll(event)}>
        <Logo />
        <h1>{enrollment.clubName}: какое это место?</h1>
        {error && <p className="setup-notice">{error}</p>}
        <div className="seat-picker" role="radiogroup" aria-label="Место этого компьютера">
          {enrollment.seats.map((seat) => (
            <button
              key={seat.seatId}
              type="button"
              role="radio"
              aria-checked={seat.seatId === seatId}
              className={seat.taken ? "seat-option taken" : "seat-option"}
              onClick={() => setSeatId(seat.seatId)}
              title={seat.taken ? "К месту уже привязан компьютер" : seat.zoneName}
            >
              <span>{seat.label}</span>
              <small>{seat.zoneName}</small>
            </button>
          ))}
        </div>
        {chosen?.taken && <p className="small muted">К месту {chosen.label} уже привязан компьютер. Если это он же после переустановки — подключайте: старый ключ перестанет работать.</p>}
        <label>
          PIN администратора
          <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} required minLength={4} inputMode="numeric" type="password" />
          <span className="small">Чтобы выйти из Vence в Windows для обслуживания: Ctrl+Alt+Shift+F12 и этот PIN.</span>
        </label>
        <button className="primary" type="submit" disabled={busy || !seatId}>
          {busy ? "Подключаем…" : chosen ? `Подключить как место ${chosen.label}` : "Выберите место"}
        </button>
        <button className="danger" type="button" onClick={() => setEnrollment(null)}>
          Другой код
        </button>
      </form>
    </main>
  );
}
