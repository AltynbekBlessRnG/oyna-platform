import type { BookingReceipt, BookingStatus } from "@oyna/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock3, LogOut, Monitor, RotateCcw } from "lucide-react-native";
import { useRouter } from "expo-router";
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/auth-context";
import { cancelBooking, getMyBookings } from "@/lib/api";
import { colors } from "@/theme";

const STATUS_LABELS: Record<BookingStatus, string> = { pending: "Ждёт подтверждения", confirmed: "Подтверждено", cancelled: "Отменено", completed: "Завершено" };

function BookingSeparator() {
  return <View style={styles.separator} />;
}

export default function BookingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, logout } = useAuth();
  const { data: bookings = [], isLoading } = useQuery({ queryKey: ["my-bookings"], queryFn: getMyBookings });
  const cancellation = useMutation({ mutationFn: cancelBooking, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-bookings"] }) });

  async function signOut(): Promise<void> {
    await logout();
    router.replace("/login");
  }

  function renderBooking({ item }: { item: BookingReceipt }) {
    const start = new Date(item.startAt);
    const cancellable = ["pending", "confirmed"].includes(item.status) && start.getTime() > Date.now();
    return <View style={styles.card}>
      <View style={styles.cardHeader}><View><Text style={styles.bookingId}>{item.id}</Text><Text style={styles.club}>{item.clubId}</Text></View><Text style={[styles.status, item.status === "confirmed" && styles.confirmed, item.status === "cancelled" && styles.cancelled]}>{STATUS_LABELS[item.status]}</Text></View>
      <View style={styles.detail}><CalendarClock color={colors.muted} size={17} /><Text style={styles.detailText}>{start.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</Text></View>
      <View style={styles.detail}><Clock3 color={colors.muted} size={17} /><Text style={styles.detailText}>{start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {item.durationHours} ч</Text></View>
      <View style={styles.detail}><Monitor color={colors.muted} size={17} /><Text style={styles.detailText}>{item.zoneName} · места {item.seatLabels.join(", ")}</Text></View>
      <View style={styles.cardFooter}><Text style={styles.total}>{item.totalAmount.toLocaleString("ru-KZ")} ₸</Text>{cancellable ? <Pressable accessibilityRole="button" disabled={cancellation.isPending} onPress={() => cancellation.mutate(item.id)} style={styles.cancelButton}><RotateCcw color={colors.danger} size={14} /><Text style={styles.cancelText}>Отменить</Text></Pressable> : null}</View>
    </View>;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList data={bookings} keyExtractor={(item) => item.id} renderItem={renderBooking} contentContainerStyle={styles.content} ItemSeparatorComponent={BookingSeparator} ListHeaderComponent={<View style={styles.profile}><View><Text style={styles.name}>{session?.user.name}</Text><Text style={styles.phone}>{session?.user.phone}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Выйти" onPress={signOut} style={styles.logout}><LogOut color={colors.muted} size={18} /></Pressable></View>} ListEmptyComponent={<View style={styles.empty}><CalendarClock color={colors.muted} size={34} /><Text style={styles.emptyTitle}>{isLoading ? "Загружаем…" : "Бронирований пока нет"}</Text><Text style={styles.emptyText}>Выбери клуб и забронируй первые места.</Text></View>} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 35 }, separator: { height: 12 }, profile: { marginBottom: 24, padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, name: { color: colors.text, fontSize: 16, fontWeight: "800" }, phone: { marginTop: 4, color: colors.muted, fontSize: 12 }, logout: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }, card: { padding: 17, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, cardHeader: { marginBottom: 16, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }, bookingId: { color: colors.text, fontSize: 17, fontWeight: "900" }, club: { marginTop: 4, color: colors.muted, fontSize: 11 }, status: { maxWidth: 130, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, overflow: "hidden", backgroundColor: "#41391D", color: "#FFD86A", fontSize: 9, fontWeight: "800" }, confirmed: { backgroundColor: "#1D3D2A", color: "#7CF0A5" }, cancelled: { backgroundColor: colors.surfaceRaised, color: colors.muted }, detail: { marginTop: 9, flexDirection: "row", alignItems: "center", gap: 9 }, detailText: { color: colors.text, fontSize: 12 }, cardFooter: { marginTop: 17, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, total: { color: colors.primary, fontSize: 17, fontWeight: "900" }, cancelButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 10 }, cancelText: { color: colors.danger, fontSize: 11, fontWeight: "700" }, empty: { paddingTop: 90, alignItems: "center" }, emptyTitle: { marginTop: 15, color: colors.text, fontSize: 17, fontWeight: "800" }, emptyText: { marginTop: 6, color: colors.muted, fontSize: 12 }
});
