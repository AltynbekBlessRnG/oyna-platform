import type { ClubSeatMap } from "@oyna/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Minus, Plus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SeatMap } from "@/components/seat-map";
import { createBooking, getClub, getClubAvailability } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";
import { useAuth } from "@/auth/auth-context";

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
const STEP_LABELS = ["Время", "Компьютеры", "Проверка"];

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
  result.setHours(hours, minutes, 0, 0);
  return result.toISOString();
}

/** Конец сеанса словами, с переходом через полночь: 23:40 + 3 ч → 02:40. */
function formatEnd(time: string, durationHours: number): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${String((hours + durationHours) % 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function BookingScreen() {
  const { clubId, seatId: preselectedSeatId } = useLocalSearchParams<{ clubId: string; zoneId?: string; seatId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const days = getDays();
  const [step, setStep] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [hour, setHour] = useState("18");
  const [minute, setMinute] = useState("00");
  const [duration, setDuration] = useState(3);
  const [seatIds, setSeatIds] = useState<string[]>(preselectedSeatId ? [preselectedSeatId] : []);
  const time = `${hour}:${minute}`;
  const startAt = toStartAt(days[dayIndex], time);
  // Минуты выбираются свободно, поэтому «сегодня 12:35» может быть уже позади.
  const inThePast = new Date(startAt).getTime() < Date.now();
  const { data: club } = useQuery({ queryKey: ["club", clubId], queryFn: () => getClub(clubId) });
  const { data: hall, isFetching } = useQuery({
    queryKey: ["hall-availability", clubId, startAt, duration],
    queryFn: () => getClubAvailability(clubId, startAt, duration),
    enabled: step >= 1
  });

  /** Тариф не выбирают отдельно: он приходит вместе с компьютером, на который нажали. */
  const selectedZone = hall?.zones.find((entry) => entry.seats.some((seat) => seatIds.includes(seat.id)))?.zone;
  const seatLabels = hall?.zones.flatMap((entry) => entry.seats).filter((seat) => seatIds.includes(seat.id)).map((seat) => seat.label) ?? [];
  const total = (selectedZone?.pricePerHour ?? 0) * duration * seatIds.length;

  const seatMap = useMemo<ClubSeatMap | undefined>(() => hall && {
    clubId: hall.clubId,
    generatedAt: hall.startAt,
    zones: hall.zones.map((entry) => ({
      zone: entry.zone,
      seats: entry.seats.map((seat) => ({ id: seat.id, label: seat.label, row: seat.row, status: seat.status === "occupied" ? "reserved" as const : "free" as const }))
    }))
  }, [hall]);

  /** Смена времени может занять уже выбранный компьютер — снимаем такой выбор. */
  useEffect(() => {
    if (!hall) return;
    const free = new Set(hall.zones.flatMap((entry) => entry.seats).filter((seat) => seat.status === "available").map((seat) => seat.id));
    setSeatIds((current) => current.every((id) => free.has(id)) ? current : current.filter((id) => free.has(id)));
  }, [hall]);

  const booking = useMutation({
    mutationFn: createBooking,
    onSuccess: (receipt) => router.replace({ pathname: "/booking/success", params: { id: receipt.id } })
  });

  /** Одна бронь живёт в одной зоне: компьютер из другой зоны начинает выбор заново. */
  function toggleSeat(zoneId: string, seatId: string): void {
    const sameZone = hall?.zones.find((entry) => entry.zone.id === zoneId)?.seats.some((seat) => seatIds.includes(seat.id)) ?? seatIds.length === 0;
    if (!sameZone) {
      setSeatIds([seatId]);
      return;
    }
    setSeatIds((current) => current.includes(seatId) ? current.filter((id) => id !== seatId) : [...current, seatId]);
  }

  function confirm(): void {
    if (!selectedZone) return;
    booking.mutate({ clubId, zoneId: selectedZone.id, seatIds, startAt, durationHours: duration, playerName: session?.user.name ?? "Игрок Zen" });
  }

  const canContinue = step === 0 ? !inThePast : seatIds.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.club}>{club?.name ?? "Компьютерный клуб"}</Text>
        <View style={styles.progress}>
          {STEP_LABELS.map((label, index) => <View key={label} style={styles.progressItem} accessibilityLabel={`Шаг ${index + 1} из ${STEP_LABELS.length}: ${label}`}><View style={[styles.progressBar, index <= step && styles.progressBarActive]} /><Text style={[styles.progressLabel, index === step && styles.progressLabelActive]}>{index + 1}. {label}</Text></View>)}
        </View>

        {step === 0 && <View>
          <Text style={styles.title}>Когда играем?</Text><Text style={styles.subtitle}>Выбери дату, время начала и длительность.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((day, index) => <Pressable key={day.toISOString()} onPress={() => setDayIndex(index)} style={[styles.day, dayIndex === index && styles.optionActive]}><Text style={[styles.dayWeek, dayIndex === index && styles.optionTextActive]}>{index === 0 ? "Сегодня" : day.toLocaleDateString("ru-RU", { weekday: "short" })}</Text><Text style={[styles.dayNumber, dayIndex === index && styles.optionTextActive]}>{day.getDate()}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.sectionTitle}>Начало сеанса</Text>
          <View style={styles.clock}>
            <Text style={styles.clockValue}>{time}</Text>
            <Text style={styles.clockUntil}>до {formatEnd(time, duration)}</Text>
          </View>
          <Text style={styles.pickerLabel}>Час</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
            {HOURS.map((item) => <Pressable key={item} accessibilityLabel={`${item} часов`} onPress={() => setHour(item)} style={[styles.unit, hour === item && styles.optionActive]}><Text style={[styles.unitText, hour === item && styles.optionTextActive]}>{item}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.pickerLabel}>Минуты</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
            {MINUTES.map((item) => <Pressable key={item} accessibilityLabel={`${item} минут`} onPress={() => setMinute(item)} style={[styles.unit, minute === item && styles.optionActive]}><Text style={[styles.unitText, minute === item && styles.optionTextActive]}>{item}</Text></Pressable>)}
          </ScrollView>
          {inThePast ? <Text style={styles.pastWarning}>Это время уже прошло — выбери другое или следующий день.</Text> : null}
          <Text style={styles.sectionTitle}>Продолжительность</Text><View style={styles.duration}><Pressable accessibilityLabel="Уменьшить длительность" disabled={duration === 1} onPress={() => setDuration((value) => Math.max(1, value - 1))} style={styles.counter}><Minus color={colors.text} size={18} /></Pressable><View style={styles.durationValue}><Text style={styles.durationText}>{duration} ч</Text></View><Pressable accessibilityLabel="Увеличить длительность" disabled={duration === 12} onPress={() => setDuration((value) => Math.min(12, value + 1))} style={styles.counter}><Plus color={colors.text} size={18} /></Pressable></View>
        </View>}

        {step === 1 && <View>
          <Text style={styles.title}>Выбери компьютер</Text>
          <Text style={styles.subtitle}>{days[dayIndex].toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, {time}–{formatEnd(time, duration)}. Цена зависит от зоны, в которой стоит компьютер.</Text>
          <View style={styles.mapBlock}>
            {seatMap
              ? <SeatMap seatMap={seatMap} selectedIds={seatIds} onSeatPress={(zoneId, seat) => toggleSeat(zoneId, seat.id)} />
              : <Text style={styles.loading}>{isFetching ? "Смотрим, что свободно…" : "Клуб пока не подключил свои компьютеры."}</Text>}
          </View>
          {selectedZone && <Text style={styles.zoneHint}>Выбрано: {seatIds.length}, зона «{selectedZone.name}», {selectedZone.pricePerHour} ₸/ч за каждый. Компьютер из другой зоны начнёт выбор заново.</Text>}
        </View>}

        {step === 2 && <View>
          <Text style={styles.title}>Проверь бронь</Text><Text style={styles.subtitle}>После подтверждения бронь появится в истории.</Text>
          <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Клуб</Text><Text style={styles.summaryValue}>{club?.name}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Дата</Text><Text style={styles.summaryValue}>{days[dayIndex].toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Время</Text><Text style={styles.summaryValue}>{time}–{formatEnd(time, duration)}, {duration} ч</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Зона</Text><Text style={styles.summaryValue}>{selectedZone?.name}, {selectedZone?.pricePerHour} ₸/ч</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Компьютеры</Text><Text style={styles.summaryValue}>{seatLabels.join(", ")}</Text></View><View style={[styles.summaryRow, styles.totalRow]}><Text style={styles.totalLabel}>Итого</Text><Text style={styles.totalValue}>{total.toLocaleString("ru-KZ")} ₸</Text></View></View>
          {booking.isError && <Text style={styles.error}>Не удалось забронировать места. Обнови доступность и попробуй снова.</Text>}
        </View>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable accessibilityLabel="Назад" onPress={() => step === 0 ? router.back() : setStep((current) => current - 1)} style={styles.backButton}><ChevronLeft color={colors.text} size={22} /></Pressable>
        <Pressable disabled={!canContinue || booking.isPending} onPress={step === 2 ? confirm : () => setStep((current) => current + 1)} style={[styles.nextButton, (!canContinue || booking.isPending) && styles.nextDisabled]}><Text style={[styles.nextText, (!canContinue || booking.isPending) && styles.nextTextDisabled]}>{booking.isPending ? "Бронируем…" : step === 2 ? `Подтвердить за ${total.toLocaleString("ru-KZ")} ₸` : "Продолжить"}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 120 },
  club: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium },
  // Шаги действительно идут по порядку, поэтому номера здесь уместны.
  progress: { marginTop: 16, marginBottom: 28, flexDirection: "row", gap: 8 },
  progressItem: { flex: 1, gap: 8 },
  progressBar: { height: 3, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  progressBarActive: { backgroundColor: colors.text },
  progressLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.body },
  progressLabelActive: { color: colors.text, fontFamily: fonts.semibold },
  title: { color: colors.text, fontSize: 26, lineHeight: 33, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  subtitle: { marginTop: 7, color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  days: { gap: 8, paddingVertical: 22 },
  day: { width: 68, height: 76, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4 },
  optionActive: { backgroundColor: colors.text, borderColor: colors.text },
  dayWeek: { color: colors.muted, fontSize: 12, fontFamily: fonts.body, textTransform: "capitalize" },
  dayNumber: { color: colors.text, fontSize: 20, fontFamily: fonts.display },
  optionTextActive: { color: colors.background },
  sectionTitle: { marginTop: 6, marginBottom: 10, color: colors.text, fontSize: 15, fontFamily: fonts.semibold },
  // Время сеанса — самое крупное на экране: ради него экран и открыли.
  clock: { marginBottom: 18, flexDirection: "row", alignItems: "baseline", gap: 12 },
  clockValue: { color: colors.text, fontSize: 48, lineHeight: 58, fontFamily: fonts.displayBold, letterSpacing: -1 },
  clockUntil: { color: colors.muted, fontSize: 16, fontFamily: fonts.medium },
  pickerLabel: { marginBottom: 8, color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  picker: { gap: 6, paddingBottom: 16 },
  unit: { width: 50, paddingVertical: 11, alignItems: "center", borderRadius: radii.control, borderWidth: 1, borderColor: colors.border },
  unitText: { color: colors.text, fontSize: 14, fontFamily: fonts.display },
  pastWarning: { marginBottom: 8, color: colors.danger, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  duration: { flexDirection: "row", alignItems: "center", gap: 10 },
  counter: { width: 46, height: 46, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  durationValue: { height: 46, flex: 1, borderRadius: radii.control, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  durationText: { color: colors.text, fontSize: 17, fontFamily: fonts.display },
  mapBlock: { marginTop: 24 },
  zoneHint: { marginTop: 4, color: colors.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  loading: { marginTop: 16, color: colors.muted, textAlign: "center", fontSize: 13, fontFamily: fonts.body },
  summary: { marginTop: 24 },
  summaryRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", gap: 20 },
  summaryLabel: { color: colors.muted, fontSize: 14, fontFamily: fonts.body },
  summaryValue: { flex: 1, color: colors.text, textAlign: "right", fontSize: 14, fontFamily: fonts.medium },
  totalRow: { marginTop: 6, paddingTop: 18, borderBottomWidth: 0, alignItems: "baseline" },
  totalLabel: { color: colors.text, fontSize: 16, fontFamily: fonts.semibold },
  totalValue: { color: colors.text, fontSize: 24, fontFamily: fonts.displayBold },
  error: { marginTop: 14, color: colors.danger, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 25, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background, flexDirection: "row", gap: 10 },
  backButton: { width: 54, height: 54, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  nextButton: { flex: 1, height: 54, borderRadius: radii.control, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  nextText: { color: colors.primaryText, fontSize: 15, fontFamily: fonts.bold },
  // Неактивная кнопка уходит в фон, а не тускнеет: полупрозрачное золото на синем выглядит грязным.
  nextDisabled: { backgroundColor: colors.surfaceRaised },
  nextTextDisabled: { color: colors.muted }
});
