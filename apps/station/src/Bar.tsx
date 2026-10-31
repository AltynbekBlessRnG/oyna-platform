import type { ClubOrder, MenuCategory, MenuItem, StationOrderResult } from "@oyna/contracts";
import { useMemo, useState } from "react";
import { DishPhoto } from "./blocks";
import type { Link, StationOrderRequest } from "./connection";
import { money } from "./format";
import { Icon } from "./ui";

/** Корзина: позиция меню → сколько штук. */
export type Cart = Record<string, number>;

const CATEGORIES: { id: MenuCategory; label: string }[] = [
  { id: "drinks", label: "Напитки" },
  { id: "food", label: "Еда" },
  { id: "snacks", label: "Снеки" },
  { id: "other", label: "Другое" }
];
// Столько же разрешает сервер на одну позицию.
const MAX_QUANTITY = 20;
const MAX_COMMENT = 200;

type Sending = { kind: "idle" } | { kind: "sending" } | { kind: "done"; order: ClubOrder } | { kind: "failed"; message: string };

/** «№3F9A»: короткий хвост номера заказа, его легко назвать на кассе. */
const orderNumber = (order: ClubOrder) => order.id.replace(/-/g, "").slice(0, 4).toUpperCase();

/** Бар клуба: меню по категориям, корзина и заказ к этому месту. Оплата при выдаче. */
export function Bar({
  menu,
  seatLabel,
  cart,
  setCart,
  link,
  placeOrder
}: {
  menu: MenuItem[] | null;
  seatLabel: string;
  cart: Cart;
  setCart: (update: (cart: Cart) => Cart) => void;
  link: Link;
  placeOrder: (request: StationOrderRequest) => Promise<StationOrderResult>;
}) {
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState<Sending>({ kind: "idle" });

  const sections = useMemo(
    () => CATEGORIES.map((entry) => ({ ...entry, items: (menu ?? []).filter((item) => item.category === entry.id) })).filter((entry) => entry.items.length > 0),
    [menu]
  );
  // В корзине только то, что сейчас есть в меню и в наличии: бар мог убрать позицию, пока игрок выбирал.
  const lines = (menu ?? []).filter((item) => item.available && cart[item.id] > 0).map((item) => ({ item, quantity: cart[item.id] }));
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);

  const change = (itemId: string, delta: number) => {
    if (sending.kind === "done" || sending.kind === "failed") setSending({ kind: "idle" });
    setCart((current) => {
      const quantity = Math.min(MAX_QUANTITY, Math.max(0, (current[itemId] ?? 0) + delta));
      const next = { ...current };
      if (quantity) next[itemId] = quantity;
      else delete next[itemId];
      return next;
    });
  };

  const order = async () => {
    if (lines.length === 0 || sending.kind === "sending") return;
    setSending({ kind: "sending" });
    try {
      const result = await placeOrder({ lines: lines.map(({ item, quantity }) => ({ itemId: item.id, quantity })), ...(comment.trim() ? { comment: comment.trim() } : {}) });
      if (result.ok) {
        setSending({ kind: "done", order: result.order });
        setCart(() => ({}));
        setComment("");
      } else {
        setSending({ kind: "failed", message: result.message });
      }
    } catch (failure) {
      const offline = failure instanceof Error && failure.message === "Нет связи с сервером";
      setSending({ kind: "failed", message: offline ? "Нет связи с сервером. Заказ не отправлен — попробуйте чуть позже или подойдите к кассе." : "Бар не ответил вовремя. Попробуйте ещё раз или подойдите к кассе." });
    }
  };

  if (!menu) {
    return (
      <div className="page">
        <p className="empty muted">Меню бара сейчас не загрузилось. Заказать можно у администратора на кассе.</p>
      </div>
    );
  }
  if (sections.length === 0) {
    return (
      <div className="page">
        <p className="empty muted">В меню клуба пока ничего нет. Спросите администратора, что есть в баре.</p>
      </div>
    );
  }

  const shown = category === "all" ? sections : sections.filter((entry) => entry.id === category);
  return (
    <div className="bar-view">
      <div className="page menu">
        {sections.length > 1 && (
          <div className="chips" role="group" aria-label="Категория">
            <button className="chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
              Всё меню
            </button>
            {sections.map((entry) => (
              <button key={entry.id} className="chip" aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}>
                {entry.label}
              </button>
            ))}
          </div>
        )}
        {shown.map((entry) => (
          <section key={entry.id} className="menu-section" aria-label={entry.label}>
            <h2>{entry.label}</h2>
            <div className="dishes">
              {entry.items.map((item) => (
                <Dish key={item.id} item={item} quantity={cart[item.id] ?? 0} onChange={(delta) => change(item.id, delta)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside className="cart" aria-label="Заказ">
        {sending.kind === "done" ? (
          <div className="order-done" role="status">
            <span className="order-check">
              <Icon name="check" size={28} />
            </span>
            <h2>Заказ №{orderNumber(sending.order)} принят</h2>
            <p>
              Принесут к месту <strong>{sending.order.seatLabel || seatLabel}</strong>, оплата при выдаче.
            </p>
            <ul className="cart-lines done">
              {sending.order.lines.map((line) => (
                <li key={line.itemId}>
                  <span>
                    {line.name} <span className="muted">× {line.quantity}</span>
                  </span>
                  <span>{money(line.price * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="cart-total">
              <span>К оплате</span>
              <strong>{money(sending.order.total)}</strong>
            </div>
            <button className="secondary" onClick={() => setSending({ kind: "idle" })}>
              Заказать ещё
            </button>
          </div>
        ) : (
          <>
            <header className="block-head">
              <h2>Заказ</h2>
              <span className="muted small">к месту {seatLabel}</span>
            </header>
            {lines.length === 0 ? (
              <p className="muted small cart-empty">Выберите, что принести: добавьте позиции из меню слева.</p>
            ) : (
              <ul className="cart-lines">
                {lines.map(({ item, quantity }) => (
                  <li key={item.id}>
                    <span className="cart-name">{item.name}</span>
                    <Stepper name={item.name} quantity={quantity} onChange={(delta) => change(item.id, delta)} />
                    <span className="cart-sum">{money(item.price * quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
            <span className="grow" />
            <label className="cart-comment">
              <span className="muted small">Комментарий для бара</span>
              <input value={comment} maxLength={MAX_COMMENT} onChange={(event) => setComment(event.target.value)} placeholder="Например, без льда" />
            </label>
            <div className="cart-total">
              <span>Итого</span>
              <strong>{money(total)}</strong>
            </div>
            {sending.kind === "failed" && (
              <p className="offline small" role="alert">
                {sending.message}
              </p>
            )}
            <button className="primary order-btn" disabled={lines.length === 0 || sending.kind === "sending" || link !== "online"} onClick={() => void order()}>
              {sending.kind === "sending" ? "Отправляем…" : lines.length ? `Заказать за ${money(total)}` : "Заказать"}
            </button>
            <p className="muted small">{link === "online" ? "Принесут к вашему месту. Оплата при выдаче." : "Нет связи с сервером: заказать можно у администратора на кассе."}</p>
          </>
        )}
      </aside>
    </div>
  );
}

function Dish({ item, quantity, onChange }: { item: MenuItem; quantity: number; onChange: (delta: number) => void }) {
  return (
    <article className={item.available ? "dish" : "dish unavailable"}>
      <DishPhoto item={item} />
      <div className="dish-body">
        <div className="dish-text">
          <h3>{item.name}</h3>
          {item.description && <p className="muted small">{item.description}</p>}
        </div>
        <div className="dish-foot">
          <span className="dish-price">{money(item.price)}</span>
          {!item.available ? (
            <span className="muted small">Нет в наличии</span>
          ) : quantity > 0 ? (
            <Stepper name={item.name} quantity={quantity} onChange={onChange} />
          ) : (
            <button className="add-btn" onClick={() => onChange(1)} aria-label={`Добавить ${item.name}`}>
              <Icon name="plus" size={18} />
              Добавить
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Stepper({ name, quantity, onChange }: { name: string; quantity: number; onChange: (delta: number) => void }) {
  return (
    <span className="stepper" role="group" aria-label={`${name}: ${quantity} шт.`}>
      <button onClick={() => onChange(-1)} aria-label="Убрать одну">
        <Icon name="minus" size={16} />
      </button>
      <span className="stepper-count">{quantity}</span>
      <button onClick={() => onChange(1)} disabled={quantity >= MAX_QUANTITY} aria-label="Добавить ещё">
        <Icon name="plus" size={16} />
      </button>
    </span>
  );
}
