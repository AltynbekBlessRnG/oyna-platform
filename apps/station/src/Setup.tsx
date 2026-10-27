import { type FormEvent, useState } from "react";
import { DEFAULT_API_URL, hashPin, type StationConfig } from "./config";
import { Logo } from "./ui";

/** Первый запуск: администратор вводит id и ключ, которые кабинет показал при подключении места. */
export function Setup({ onSave, notice, apiUrl: initialApiUrl }: { onSave: (config: StationConfig) => void; notice?: string; apiUrl?: string }) {
  const [apiUrl, setApiUrl] = useState(initialApiUrl ?? DEFAULT_API_URL);
  const [stationId, setStationId] = useState("");
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    onSave({ apiUrl: apiUrl.trim(), stationId: stationId.trim(), token: token.trim(), adminPinHash: await hashPin(pin) });
  };

  return (
    <main className="setup">
      <form className="setup-card" onSubmit={(event) => void submit(event)}>
        <Logo />
        <h1>Подключить компьютер к клубу</h1>
        <p className="muted">
          В кабинете Zen откройте «Зал», выберите место этого компьютера и нажмите «Подключить компьютер». Скопируйте сюда id и ключ: ключ показывается
          один раз.
        </p>
        {notice && <p className="setup-notice">{notice}</p>}
        <label>
          ID компьютера
          <input value={stationId} onChange={(event) => setStationId(event.target.value)} required autoFocus spellCheck={false} />
        </label>
        <label>
          Ключ
          <input value={token} onChange={(event) => setToken(event.target.value)} required spellCheck={false} />
        </label>
        <label>
          PIN администратора
          <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} required minLength={4} inputMode="numeric" type="password" />
          <span className="small">Чтобы выйти из Zen в Windows для обслуживания: Ctrl+Alt+Shift+F12 и этот PIN.</span>
        </label>
        <details>
          <summary>Адрес сервера</summary>
          <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} required spellCheck={false} aria-label="Адрес сервера" />
        </details>
        <button className="primary" type="submit">
          Подключить
        </button>
      </form>
    </main>
  );
}
