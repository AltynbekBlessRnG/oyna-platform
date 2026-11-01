import { apiUrl } from "@/lib/api";

/** Установщик Zen для компьютеров зала: кабинет отдаёт его со своего адреса, а берёт у API. */
export async function GET(): Promise<Response> {
  const upstream = await fetch(`${apiUrl}/stations/setup`, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Программа для компьютеров пока недоступна. Попробуйте позже.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="Zen-Setup.exe"',
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {})
    }
  });
}
