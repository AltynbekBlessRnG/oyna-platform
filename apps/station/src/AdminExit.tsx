import { type FormEvent, useEffect, useState } from "react";
import { hashPin } from "./config";
import { platform } from "./platform";

/** Ctrl+Alt+Shift+F12 и PIN: администратор выходит из Zen в обычную Windows для обслуживания. */
export function AdminExit({ pinHash }: { pinHash?: string }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.shiftKey && event.key === "F12") {
        setOpen(true);
        setPin("");
        setError("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pinHash) return setError("PIN не задан. Подключите компьютер заново и задайте PIN.");
    if ((await hashPin(pin)) !== pinHash) {
      setPin("");
      return setError("Неверный PIN");
    }
    await platform.adminExit();
  };

  return (
    <div className="backdrop">
      <form role="dialog" aria-modal="true" aria-label="Выход для администратора" className="setup-card" onSubmit={(event) => void submit(event)}>
        <h1>Выход в Windows</h1>
        <p className="muted">Только для администратора клуба. Zen запустится снова после перезагрузки.</p>
        {error && <p className="setup-notice">{error}</p>}
        <label>
          PIN администратора
          <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} type="password" inputMode="numeric" autoFocus />
        </label>
        <button className="primary" type="submit">
          Выйти в Windows
        </button>
        <button className="danger" type="button" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </form>
    </div>
  );
}
