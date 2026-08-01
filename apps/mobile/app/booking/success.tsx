import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarCheck, Check, Clock3, Gamepad2, MapPin, Monitor } from "lucide-react-native";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { getBooking, getClub } from "@/lib/api";
import { colors } from "@/theme";

export default function BookingSuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: booking } = useQuery({ queryKey: ["booking", id], queryFn: () => getBooking(id) });
  const { data: club } = useQuery({ queryKey: ["club", booking?.clubId], queryFn: () => getClub(booking?.clubId ?? ""), enabled: Boolean(booking) });
  if (!booking) return <SafeAreaView style={styles.center}><Text style={styles.muted}>Подтверждаем бронь…</Text></SafeAreaView>;
  const start = new Date(booking.startAt);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.successIcon}><Check color={colors.primaryText} size={39} strokeWidth={3} /></View>
        <Text style={styles.title}>{booking.status === "confirmed" ? "Места твои!" : "Бронь отправлена"}</Text><Text style={styles.subtitle}>{booking.status === "confirmed" ? "Бронирование подтверждено. Покажи номер администратору клуба." : "Администратор проверит свободные места и подтвердит бронь. Статус появится в истории."}</Text>
        <View style={styles.ticket}>
          <View style={styles.ticketTop}><View><Text style={styles.ticketLabel}>НОМЕР БРОНИ</Text><Text style={styles.bookingId}>{booking.id}</Text></View><Gamepad2 color={colors.primary} size={28} /></View>
          <View style={styles.divider} />
          <View style={styles.detail}><MapPin color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Клуб</Text><Text style={styles.detailValue}>{club?.name ?? booking.clubId}</Text></View></View>
          <View style={styles.detail}><CalendarCheck color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Дата</Text><Text style={styles.detailValue}>{start.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" })}</Text></View></View>
          <View style={styles.detail}><Clock3 color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Время</Text><Text style={styles.detailValue}>{start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {booking.durationHours} часа</Text></View></View>
          <View style={styles.detail}><Monitor color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Зона и места</Text><Text style={styles.detailValue}>{booking.zoneName} · {booking.seatLabels.join(", ")}</Text></View></View>
          <View style={styles.total}><Text style={styles.totalLabel}>К оплате в клубе</Text><Text style={styles.totalValue}>{booking.totalAmount.toLocaleString("ru-KZ")} ₸</Text></View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.homeButton}><Text style={styles.homeText}>На главную</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }, content: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }, muted: { color: colors.muted }, successIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }, title: { marginTop: 23, color: colors.text, fontSize: 31, fontWeight: "900" }, subtitle: { marginTop: 9, maxWidth: 320, color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  ticket: { width: "100%", marginTop: 30, padding: 20, borderRadius: 23, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, ticketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, ticketLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.4 }, bookingId: { marginTop: 5, color: colors.text, fontSize: 24, fontWeight: "900" }, divider: { marginVertical: 19, borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.border }, detail: { marginBottom: 17, flexDirection: "row", alignItems: "center", gap: 12 }, detailLabel: { color: colors.muted, fontSize: 10 }, detailValue: { marginTop: 3, color: colors.text, fontSize: 13, fontWeight: "700", textTransform: "capitalize" }, total: { marginTop: 3, paddingTop: 17, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, totalLabel: { color: colors.muted, fontSize: 12 }, totalValue: { color: colors.primary, fontSize: 20, fontWeight: "900" }, homeButton: { width: "100%", height: 56, marginTop: 15, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }, homeText: { color: colors.primaryText, fontSize: 15, fontWeight: "900" }
});
