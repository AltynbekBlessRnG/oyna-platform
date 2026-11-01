import { redirect } from "next/navigation";

/** Старый адрес установщика, из времён названия Zen: ссылки могли остаться в чатах клубов. */
export function GET(): never {
  redirect("/download/vence-setup");
}
