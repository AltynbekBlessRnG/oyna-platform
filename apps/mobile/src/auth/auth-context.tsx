import type { AuthSession } from "@oyna/contracts";
import * as SecureStore from "expo-secure-store";
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from "react";
import { setAccessToken } from "@/lib/api";

const SESSION_KEY = "oyna.auth.session.v1";

interface AuthContextValue {
  ready: boolean;
  session: AuthSession | null;
  saveSession: (session: AuthSession) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(SESSION_KEY).then((stored) => {
      if (!active) return;
      const restored = stored ? JSON.parse(stored) as AuthSession : null;
      setAccessToken(restored?.accessToken ?? null);
      setSession(restored);
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  async function saveSession(nextSession: AuthSession): Promise<void> {
    setAccessToken(nextSession.accessToken);
    setSession(nextSession);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(nextSession));
  }

  async function logout(): Promise<void> {
    setAccessToken(null);
    setSession(null);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  return <AuthContext.Provider value={{ ready, session, saveSession, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
