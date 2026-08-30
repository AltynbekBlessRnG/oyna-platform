import type { ClubZone } from "@oyna/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronLeft, Clock3, Minus, Monitor, Plus, Users } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBooking, getAvailability, getClub, getZones } from "@/lib/api";
import { colors } from "@/theme";
import { useAuth } from "@/auth/auth-context";

const TIMES = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "00:00"];
const STEP_LABELS = ["Время", "Зона", "Места", "Проверка"];

function getDays(): Date[] {
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date;
  });
}

function toStartAt(date: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  if (hours === 0) result.setDate(result.getDate() + 1);
  result.setHours(hours, minutes, 0, 0);
  return result.toISOString();
}

export default function BookingScreen() {
  const { clubId, zoneId: preselectedZoneId } = useLocalSearchParams<{ clubId: string; zoneId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const days = getDays();
  const [step, setStep] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(3);
  const [zoneId, setZoneId] = useState(preselectedZoneId ?? "standard");
  const [seatIds, setSeatIds] = useState<string[]>([]);
  const startAt = toStartAt(days[dayIndex], time);
  const { data: club } = useQuery({ queryKey: ["club", clubId], queryFn: () => getClub(clubId) });
  const { data: zones = [] } = useQuery({ queryKey: ["zones", clubId], queryFn: () => getZones(clubId) });
  const { data: availability, isFetching } = useQuery({ queryKey: ["availability", clubId, zoneId, startAt, duration], queryFn: () => getAvailability(clubId, zoneId, startAt, duration), enabled: step >= 2 });
  const selectedZone = zones.find((zone) => zone.id === zoneId) ?? zones[0];
  const total = (selectedZone?.pricePerHour ?? 0) * duration * seatIds.length;
  const booking = useMutation({
    mutationFn: createBooking,
    onSuccess: (receipt) => router.replace({ pathname: "/booking/success", params: { id: receipt.id } })
  });

  function chooseZone(zone: ClubZone): void {
    setZoneId(zone.id);
    setSeatIds([]);
  }

  function toggleSeat(seatId: string): void {
    setSeatIds((current) => current.includes(seatId) ? current.filter((id) => id !== seatId) : [...current, seatId]);
  }

  function goNext(): void {
    if (step < 3) setStep((current) => current + 1);
  }

  function confirm(): void {
    booking.mutate({ clubId, zoneId, seatIds, startAt, durationHours: duration, playerName: session?.user.name ?? "Игрок OYNA" });
  }

  const canContinue = step === 1 ? Boolean(selectedZone) : step < 2 || seatIds.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.club}>{club?.name ?? "Компьютерный клуб"}</Text>
        <View style={styles.progress}>
          {STEP_LABELS.map((label, index) => <View key={label} style={styles.progressItem}><View style={[styles.progressDot, index <= step && styles.progressDotActive]}>{index < step ? <Check color={colors.primaryText} size={13} /> : <Text style={[styles.progressNumber, index <= step && styles.progressNumberActive]}>{index + 1}</Text>}</View><Text style={[styles.progressLabel, index === step && styles.progressLabelActive]}>{label}</Text></View>)}
        </View>

        {step === 0 && <View>
          <Text style={styles.title}>Когда играем?</Text><Text style={styles.subtitle}>Выбери дату, время начала и длительность.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((day, index) => <Pressable key={day.toISOString()} onPress={() => setDayIndex(index)} style={[styles.day, dayIndex === index && styles.optionActive]}><Text style={[styles.dayWeek, dayIndex === index && styles.optionTextActive]}>{index === 0 ? "Сегодня" : day.toLocaleDateString("ru-RU", { weekday: "short" })}</Text><Text style={[styles.dayNumber, dayIndex === index && styles.optionTextActive]}>{day.getDate()}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.sectionTitle}>Начало</Text><View style={styles.timeGrid}>{TIMES.map((item) => <Pressable key={item} onPress={() => setTime(item)} style={[styles.time, time === item && styles.optionActive]}><Text style={[styles.timeText, time === item && styles.optionTextActive]}>{item}</Text></Pressable>)}</View>
          <Text style={styles.sectionTitle}>Продолжительность</Text><View style={styles.duration}><Pressable accessibilityLabel="Уменьшить длительность" disabled={duration === 1} onPress={() => setDuration((value) => Math.max(1, value - 1))} style={styles.counter}><Minus color={colors.text} size={18} /></Pressable><View style={styles.durationValue}><Clock3 color={colors.primary} size={18} /><Text style={styles.durationText}>{duration} часа</Text></View><Pressable accessibilityLabel="Увеличить длительность" disabled={duration === 12} onPress={() => setDuration((value) => Math.min(12, value + 1))} style={styles.counter}><Plus color={colors.text} size={18} /></Pressable></View>
        </View>}

        {step === 1 && <View>
          <Text style={styles.title}>Выбери зону</Text><Text style={styles.subtitle}>Цена указана за один компьютер в час.</Text>
          <View style={styles.zoneList}>{zones.map((zone) => <Pressable key={zone.id} onPress={() => chooseZone(zone)} style={[styles.zone, zoneId === zone.id && styles.zoneActive]}><View style={styles.zoneIcon}><Monitor color={zoneId === zone.id ? colors.primary : colors.muted} size={22} /></View><View style={styles.zoneBody}><Text style={styles.zoneName}>{zone.name}</Text><Text style={styles.zoneDescription}>{zone.description}</Text><Text style={styles.zoneSeats}>{zone.seatCount} компьютеров</Text></View><Text style={styles.zonePrice}>{zone.pricePerHour} ₸<Text style={styles.zoneHour}>/ч</Text></Text></Pressable>)}</View>
        </View>}

        {step === 2 && <View>
          <Text style={styles.title}>Выбери места</Text><Text style={styles.subtitle}>{selectedZone?.name} · {time}–{String((Number(time.slice(0, 2)) + duration) % 24).padStart(2, "0")}:00</Text>
          <View style={styles.legend}><View style={styles.legendItem}><View style={styles.legendFree} /><Text style={styles.legendText}>Свободно</Text></View><View style={styles.legendItem}><View style={styles.legendSelected} /><Text style={styles.legendText}>Выбрано</Text></View><View style={styles.legendItem}><View style={styles.legendBusy} /><Text style={styles.legendText}>Занято</Text></View></View>
          <View style={styles.screenDesk}><Text style={styles.screenText}>ЭКРАН / АДМИНИСТРАТОР</Text></View>
          <View style={styles.seatGrid}>{availability?.seats.map((seat) => { const selected = seatIds.includes(seat.id); const occupied = seat.status === "occupied"; return <Pressable key={seat.id} accessibilityLabel={`Место ${seat.label}`} disabled={occupied} onPress={() => toggleSeat(seat.id)} style={[styles.seat, selected && styles.seatSelected, occupied && styles.seatOccupied]}><Monitor color={selected ? colors.primaryText : occupied ? colors.muted : colors.text} size={18} /><Text style={[styles.seatText, selected && styles.seatTextSelected]}>{seat.label}</Text></Pressable>; })}</View>
          {isFetching && <Text style={styles.loading}>Обновляем доступность…</Text>}
        </View>}

        {step === 3 && <View>
          <Text style={styles.title}>Проверь бронь</Text><Text style={styles.subtitle}>После подтверждения бронь появится в истории.</Text>
          <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Клуб</Text><Text style={styles.summaryValue}>{club?.name}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Дата</Text><Text style={styles.summaryValue}>{days[dayIndex].toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Время</Text><Text style={styles.summaryValue}>{time} · {duration} ч</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Зона</Text><Text style={styles.summaryValue}>{selectedZone?.name}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Места</Text><Text style={styles.summaryValue}>{seatIds.map((id) => id.slice(-2)).join(", ")}</Text></View><View style={[styles.summaryRow, styles.totalRow]}><Text style={styles.totalLabel}>Итого</Text><Text style={styles.totalValue}>{total.toLocaleString("ru-KZ")} ₸</Text></View></View>
          {booking.isError && <Text style={styles.error}>Не удалось забронировать места. Обнови доступность и попробуй снова.</Text>}
        </View>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {step > 0 && <Pressable accessibilityLabel="Предыдущий шаг" onPress={() => setStep((current) => current - 1)} style={styles.backButton}><ChevronLeft color={colors.text} size={22} /></Pressable>}
        <Pressable disabled={!canContinue || booking.isPending} onPress={step === 3 ? confirm : goNext} style={[styles.nextButton, (!canContinue || booking.isPending) && styles.disabled]}><Text style={styles.nextText}>{booking.isPending ? "Бронируем…" : step === 3 ? `Подтвердить · ${total.toLocaleString("ru-KZ")} ₸` : "Продолжить"}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 120 }, club: { color: colors.muted, fontSize: 13, fontWeight: "600" }, progress: { marginTop: 20, marginBottom: 31, flexDirection: "row", justifyContent: "space-between" }, progressItem: { alignItems: "center", gap: 7 }, progressDot: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }, progressDotActive: { backgroundColor: colors.primary }, progressNumber: { color: colors.muted, fontSize: 11, fontWeight: "800" }, progressNumberActive: { color: colors.primaryText }, progressLabel: { color: colors.muted, fontSize: 10 }, progressLabelActive: { color: colors.text, fontWeight: "700" },
  title: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.7 }, subtitle: { marginTop: 7, color: colors.muted, fontSize: 14, lineHeight: 20 }, days: { gap: 9, paddingVertical: 22 }, day: { width: 76, height: 82, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 6 }, optionActive: { backgroundColor: colors.primary, borderColor: colors.primary }, dayWeek: { color: colors.muted, fontSize: 11, textTransform: "capitalize" }, dayNumber: { color: colors.text, fontSize: 22, fontWeight: "800" }, optionTextActive: { color: colors.primaryText }, sectionTitle: { marginTop: 10, marginBottom: 11, color: colors.text, fontSize: 15, fontWeight: "800" }, timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, time: { width: "22.8%", paddingVertical: 13, alignItems: "center", borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, timeText: { color: colors.text, fontSize: 13, fontWeight: "700" }, duration: { flexDirection: "row", alignItems: "center", gap: 12 }, counter: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, durationValue: { height: 46, flex: 1, borderRadius: 14, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, durationText: { color: colors.text, fontWeight: "800" },
  zoneList: { marginTop: 22, gap: 11 }, zone: { minHeight: 105, padding: 15, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" }, zoneActive: { borderColor: colors.primary, backgroundColor: "#1E2418" }, zoneIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }, zoneBody: { flex: 1, marginLeft: 13 }, zoneName: { color: colors.text, fontSize: 16, fontWeight: "800" }, zoneDescription: { marginTop: 4, color: colors.muted, fontSize: 12 }, zoneSeats: { marginTop: 6, color: colors.muted, fontSize: 10 }, zonePrice: { color: colors.primary, fontSize: 14, fontWeight: "800" }, zoneHour: { color: colors.muted, fontWeight: "500" },
  legend: { marginTop: 19, flexDirection: "row", gap: 15 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 5 }, legendFree: { width: 10, height: 10, borderRadius: 3, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, legendSelected: { width: 10, height: 10, borderRadius: 3, backgroundColor: colors.primary }, legendBusy: { width: 10, height: 10, borderRadius: 3, backgroundColor: colors.surfaceRaised, opacity: 0.5 }, legendText: { color: colors.muted, fontSize: 10 }, screenDesk: { marginTop: 28, marginBottom: 22, height: 30, borderRadius: 8, borderTopWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, screenText: { color: colors.muted, fontSize: 9, letterSpacing: 1 }, seatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }, seat: { width: 67, height: 59, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, seatSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, seatOccupied: { opacity: 0.3 }, seatText: { color: colors.text, fontSize: 11, fontWeight: "800" }, seatTextSelected: { color: colors.primaryText }, loading: { marginTop: 16, color: colors.muted, textAlign: "center", fontSize: 12 },
  summary: { marginTop: 24, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, summaryRow: { paddingVertical: 11, flexDirection: "row", justifyContent: "space-between", gap: 20 }, summaryLabel: { color: colors.muted, fontSize: 13 }, summaryValue: { flex: 1, color: colors.text, textAlign: "right", fontSize: 13, fontWeight: "700" }, totalRow: { marginTop: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border }, totalLabel: { color: colors.text, fontSize: 16, fontWeight: "800" }, totalValue: { color: colors.primary, fontSize: 20, fontWeight: "900" }, error: { marginTop: 14, color: colors.danger, fontSize: 12, lineHeight: 18 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 25, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background, flexDirection: "row", gap: 10 }, backButton: { width: 54, height: 56, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, nextButton: { flex: 1, height: 56, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }, nextText: { color: colors.primaryText, fontSize: 15, fontWeight: "900" }, disabled: { opacity: 0.45 }
});
