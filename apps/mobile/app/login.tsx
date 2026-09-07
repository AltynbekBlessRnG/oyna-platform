import { useRouter } from "expo-router";
import { Send, ShieldCheck } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ZenMark } from "@/components/zen-mark";
import { useAuth } from "@/auth/auth-context";
import { getChallengeStatus, requestLoginCode, verifyLoginCode } from "@/lib/api";
import { colors } from "@/theme";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { saveSession } = useAuth();
  const [phone, setPhone] = useState("+7 ");
  const [name, setName] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [botUrl, setBotUrl] = useState<string | undefined>();
  const [waitingForTelegram, setWaitingForTelegram] = useState(false);
  const savedRef = useRef(false);

  /**
   * Пока игрок подтверждает номер в боте, приложение спрашивает сервер,
   * не пришёл ли контакт. Telegram отвечает нам, а не приложению, — иначе никак.
   */
  useEffect(() => {
    if (!challengeId || !waitingForTelegram) return;
    const timer = setInterval(async () => {
      const status = await getChallengeStatus(challengeId, name);
      if (status.status !== "verified" || !status.session || savedRef.current) return;
      savedRef.current = true;
      clearInterval(timer);
      await saveSession(status.session);
      router.replace("/");
    }, 2500);
    return () => clearInterval(timer);
  }, [challengeId, waitingForTelegram, name, saveSession, router]);

  async function openTelegram(): Promise<void> {
    if (!botUrl) return;
    setWaitingForTelegram(true);
    setError("");
    await Linking.openURL(botUrl).catch(() => setError("Не удалось открыть Telegram. Установи приложение или введи код вручную."));
  }

  async function submit(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      if (!challengeId) {
        const challenge = await requestLoginCode(phone);
        setChallengeId(challenge.challengeId);
        setBotUrl(challenge.telegramBotUrl);
        if (challenge.devCode) setCode(challenge.devCode);
      } else {
        const session = await verifyLoginCode(challengeId, code, name);
        await saveSession(session);
        router.replace("/");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.logo}><ZenMark size={62} /></View>
      <Text style={styles.brand}>ZEN</Text>
      <Text style={styles.title}>{challengeId ? "Подтверди номер" : "Начнём играть"}</Text>
      <Text style={styles.subtitle}>{challengeId ? `Подтверждаем ${phone}.` : "Номер нужен для бронирований и уведомлений клуба."}</Text>
      {!challengeId ? (
        <View style={styles.form}>
          <Text style={styles.label}>Имя</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Как к тебе обращаться" placeholderTextColor={colors.muted} style={styles.input} returnKeyType="next" />
          <Text style={styles.label}>Номер телефона</Text>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+7 700 000 00 00" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
      ) : (
        <View style={styles.form}>
          {botUrl ? (
            <>
              <Pressable accessibilityRole="button" onPress={openTelegram} style={styles.telegram}>
                <Send color={colors.primaryText} size={19} />
                <Text style={styles.telegramText}>{waitingForTelegram ? "Открыть Telegram снова" : "Подтвердить через Telegram"}</Text>
              </Pressable>
              {waitingForTelegram ? (
                <View style={styles.waiting}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.waitingText}>Нажми в боте «Поделиться номером» — вход завершится сам.</Text>
                </View>
              ) : (
                <Text style={styles.hint}>Быстрее и надёжнее SMS: номер подтвердит сам Telegram, вводить ничего не нужно.</Text>
              )}
              <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>или код из SMS</Text><View style={styles.dividerLine} /></View>
            </>
          ) : null}
          <Text style={styles.label}>Код из SMS</Text>
          <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} textAlign="center" style={[styles.input, styles.code]} autoFocus={!botUrl} />
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={loading} onPress={submit} style={[styles.button, loading && styles.disabled]}>
        <Text style={styles.buttonText}>{loading ? "Подожди…" : challengeId ? "Войти" : "Получить код"}</Text>
      </Pressable>
      {challengeId ? (
        <Pressable accessibilityRole="button" onPress={() => { setChallengeId(null); setCode(""); setBotUrl(undefined); setWaitingForTelegram(false); savedRef.current = false; }}>
          <Text style={styles.changePhone}>Изменить номер</Text>
        </Pressable>
      ) : null}
      <View style={styles.security}>
        <ShieldCheck color={colors.muted} size={15} />
        <Text style={styles.securityText}>Мы не передаём номер клубам без бронирования</Text>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center" },
  logo: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  brand: { marginTop: 13, color: colors.primary, fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  title: { marginTop: 35, color: colors.text, fontSize: 32, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { marginTop: 9, color: colors.muted, fontSize: 14, lineHeight: 21 },
  form: { marginTop: 27 },
  label: { marginBottom: 8, color: colors.muted, fontSize: 11, fontWeight: "700" },
  input: { height: 54, marginBottom: 17, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  code: { fontSize: 25, fontWeight: "900", letterSpacing: 12 },
  telegram: { height: 56, marginBottom: 13, borderRadius: 17, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  telegramText: { color: colors.primaryText, fontSize: 15, fontWeight: "900" },
  hint: { marginBottom: 6, color: colors.muted, fontSize: 12, lineHeight: 18 },
  waiting: { marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 10 },
  waitingText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  divider: { marginVertical: 21, flexDirection: "row", alignItems: "center", gap: 11 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 11 },
  error: { marginBottom: 12, color: colors.danger, fontSize: 12 },
  button: { height: 56, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  changePhone: { paddingVertical: 17, color: colors.primary, textAlign: "center", fontSize: 13, fontWeight: "700" },
  security: { marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  securityText: { color: colors.muted, fontSize: 10 }
});
