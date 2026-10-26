import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlaySession } from "@oyna/contracts";
import { Monitor, Square } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { claimStation, endMySession, getCurrentSession } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function timeLeft(iso: string, now: number): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`;
}

/**
 * Сесть за компьютер в клубе: игрок вводит код с экрана блокировки, время идёт с клубного баланса.
 * Пока сессия идёт, карточка показывает место и остаток времени.
 */
export function ClubSessionCard({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [lastEnded, setLastEnded] = useState<PlaySession | null>(null);
  const [now, setNow] = useState(Date.now());
  const { data: session, isError } = useQuery({
    queryKey: ["club-session", clubId],
    queryFn: () => getCurrentSession(clubId),
    refetchInterval: 30_000,
    retry: false
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function refreshClub(): void {
    void queryClient.invalidateQueries({ queryKey: ["club-session", clubId] });
    void queryClient.invalidateQueries({ queryKey: ["club-account", clubId] });
    void queryClient.invalidateQueries({ queryKey: ["seatmap", clubId] });
  }

  const claim = useMutation({
    mutationFn: () => claimStation(code),
    onSuccess: (started) => {
      setCode("");
      setLastEnded(null);
      queryClient.setQueryData(["club-session", clubId], started);
      refreshClub();
    }
  });
  const end = useMutation({
    mutationFn: (sessionId: string) => endMySession(sessionId),
    onSuccess: (ended) => {
      setConfirmEnd(false);
      setLastEnded(ended);
      queryClient.setQueryData(["club-session", clubId], null);
      refreshClub();
    }
  });

  // Без входа сервер отвечает 401: карточку не показываем, клубный аккаунт объяснит, что нужно войти.
  if (isError) return null;

  if (session && session.clubId === clubId) {
    return (
      <View style={[styles.card, styles.active]}>
        <View style={styles.header}>
          <Monitor color={colors.primary} size={18} />
          <Text style={styles.title}>Место {session.seatLabel} · {session.zoneName}</Text>
        </View>
        <Text style={styles.left}>{timeLeft(session.endsAt, now)}</Text>
        <Text style={styles.muted}>до {clock(session.endsAt)} · пополните баланс на кассе, чтобы продлить</Text>
        <Pressable
          accessibilityRole="button"
          disabled={end.isPending}
          onPress={() => (confirmEnd ? end.mutate(session.id) : setConfirmEnd(true))}
          style={styles.secondaryButton}
        >
          {end.isPending ? <ActivityIndicator color={colors.text} /> : <Square color={colors.text} size={15} />}
          <Text style={styles.secondaryText}>{confirmEnd ? "Точно завершить? Нажмите ещё раз" : "Завершить и выйти"}</Text>
        </Pressable>
        {end.error ? <Text style={styles.error}>{end.error.message}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Monitor color={colors.muted} size={18} />
        <Text style={styles.title}>Сесть за компьютер</Text>
      </View>
      <Text style={styles.muted}>Введите код с экрана компьютера. Время спишется с вашего баланса в этом клубе.</Text>
      <View style={styles.row}>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={6}
          style={styles.input}
          accessibilityLabel="Код с экрана компьютера"
        />
        <Pressable
          accessibilityRole="button"
          disabled={code.length !== 6 || claim.isPending}
          onPress={() => claim.mutate()}
          style={[styles.primaryButton, (code.length !== 6 || claim.isPending) && styles.disabled]}
        >
          {claim.isPending ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryText}>Начать</Text>}
        </Pressable>
      </View>
      {claim.error ? <Text style={styles.error}>{claim.error.message}</Text> : null}
      {lastEnded ? (
        <Text style={styles.muted}>Сессия за местом {lastEnded.seatLabel} завершена, списано {(lastEnded.charged ?? 0).toLocaleString("ru-KZ")} ₸.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, padding: 17, gap: 10, borderRadius: radii.card, backgroundColor: colors.surface },
  active: { borderWidth: 1, borderColor: colors.primary },
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  title: { color: colors.text, fontSize: 15, fontFamily: fonts.display },
  left: { color: colors.primary, fontSize: 28, fontFamily: fonts.displayBold },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radii.control,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 20,
    letterSpacing: 6,
    fontFamily: fonts.display
  },
  primaryButton: { minWidth: 96, height: 48, paddingHorizontal: 16, borderRadius: radii.control, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.primaryText, fontSize: 15, fontFamily: fonts.bold },
  disabled: { opacity: 0.45 },
  secondaryButton: {
    marginTop: 4,
    height: 44,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  secondaryText: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold },
  error: { color: colors.danger, fontSize: 13, fontFamily: fonts.body }
});
