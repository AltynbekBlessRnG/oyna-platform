import { cookies } from "next/headers";

const TOKEN_COOKIE = "oyna_admin_token";
const CLUB_COOKIE = "oyna_active_club";
const MONTH_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * Кабинет работает от имени сотрудника клуба: токен приходит из того же входа по телефону,
 * что и в мобильном приложении, и хранится в httpOnly-cookie.
 */
export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}

export async function getActiveClubId(): Promise<string | undefined> {
  return (await cookies()).get(CLUB_COOKIE)?.value;
}

export async function startSession(token: string, clubId: string): Promise<void> {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MONTH_IN_SECONDS
  });
  store.set(CLUB_COOKIE, clubId, { sameSite: "lax", path: "/", maxAge: MONTH_IN_SECONDS });
}

export async function setActiveClubId(clubId: string): Promise<void> {
  (await cookies()).set(CLUB_COOKIE, clubId, { sameSite: "lax", path: "/", maxAge: MONTH_IN_SECONDS });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(CLUB_COOKIE);
}
