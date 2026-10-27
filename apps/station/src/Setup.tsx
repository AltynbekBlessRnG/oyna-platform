import { type FormEvent, useState } from "react";
import { DEFAULT_API_URL, type StationConfig } from "./config";
import { Logo } from "./ui";

/** Первый запуск: администратор вводит id и ключ, которые кабинет показал при подключении места. */
export function Setup({ onSave, notice, apiUrl: initialApiUrl }: { onSave: (config: StationConfig) => void; notice?: string; apiUrl?: string }) {
  const [apiUrl, setApiUrl] = useState(initialApiUrl ?? DEFAULT_API_URL);
  const [stationId, setStationId] = useState("");
  const [token, setToken] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ apiUrl: apiUrl.trim(), stationId: stationId.trim(), token: token.trim() });
  };

  return (
    <main className="setup">
      <form className="setup-card" onSubmit={submit}>
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
