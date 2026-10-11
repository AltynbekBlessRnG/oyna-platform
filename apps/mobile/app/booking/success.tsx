import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarCheck, Check, Clock3, MapPin, Monitor } from "lucide-react-native";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { getBooking, getClub } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";

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
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.successIcon}><Check color={colors.primaryText} size={36} strokeWidth={3} /></Animated.View>
        <Text style={styles.title}>{booking.status === "confirmed" ? "Места твои!" : "Бронь отправлена"}</Text><Text style={styles.subtitle}>{booking.status === "confirmed" ? "Бронирование подтверждено. Покажи номер администратору клуба." : "Администратор проверит свободные места и подтвердит бронь. Статус появится в истории."}</Text>
        <View style={styles.ticket}>
          <View style={styles.ticketTop}><Text style={styles.ticketLabel}>Номер брони</Text><Text style={styles.bookingId}>{booking.id}</Text></View>
          <View style={styles.divider} />
          <View style={styles.detail}><MapPin color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Клуб</Text><Text style={styles.detailValue}>{club?.name ?? booking.clubId}</Text></View></View>
          <View style={styles.detail}><CalendarCheck color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Дата</Text><Text style={styles.detailValue}>{start.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" })}</Text></View></View>
          <View style={styles.detail}><Clock3 color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Время</Text><Text style={styles.detailValue}>{start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}, {booking.durationHours} ч</Text></View></View>
          <View style={styles.detail}><Monitor color={colors.muted} size={18} /><View><Text style={styles.detailLabel}>Зона и места</Text><Text style={styles.detailValue}>{booking.zoneName}: {booking.seatLabels.join(", ")}</Text></View></View>
          <View style={styles.total}><Text style={styles.totalLabel}>К оплате в клубе</Text><Text style={styles.totalValue}>{booking.totalAmount.toLocaleString("ru-KZ")} ₸</Text></View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.homeButton}><Text style={styles.homeText}>На главную</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontFamily: fonts.body },
  successIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 22, color: colors.text, fontSize: 28, fontFamily: fonts.displayBold, letterSpacing: -0.5, textAlign: "center" },
  subtitle: { marginTop: 9, maxWidth: 320, color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center", fontFamily: fonts.body },
  // Бронь показывают администратору, поэтому номер — крупно, как на билете.
  ticket: { width: "100%", marginTop: 28, padding: 20, borderRadius: radii.card, backgroundColor: colors.surface },
  ticketTop: { alignItems: "flex-start" },
  ticketLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  bookingId: { marginTop: 4, color: colors.text, fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: 1 },
  divider: { marginVertical: 18, borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.border },
  detail: { marginBottom: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  detailLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.body },
  detailValue: { marginTop: 2, color: colors.text, fontSize: 14, fontFamily: fonts.medium },
  total: { marginTop: 4, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  totalLabel: { color: colors.muted, fontSize: 13, fontFamily: fonts.body },
  totalValue: { color: colors.text, fontSize: 20, fontFamily: fonts.displayBold },
  homeButton: { width: "100%", height: 54, marginTop: 16, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  homeText: { color: colors.text, fontSize: 15, fontFamily: fonts.semibold }
});
