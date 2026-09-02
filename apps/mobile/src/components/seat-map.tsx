import type { ClubSeatMap, SeatMapSeat } from "@oyna/contracts";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, seatLegend } from "@/theme";

interface SeatMapProps {
  seatMap: ClubSeatMap;
  /** Выбранные компьютеры подсвечиваются поверх статуса — режим брони. */
  selectedIds?: string[];
  onSeatPress?: (zoneId: string, seat: SeatMapSeat) => void;
}

const SEAT_COLORS: Record<SeatMapSeat["status"], string> = {
  occupied: colors.seatOccupied,
  free: colors.seatFree,
  reserved: colors.seatReserved
};

function seatHint(seat: SeatMapSeat, selected: boolean): string {
  if (selected) return "выбран";
  if (seat.status === "occupied" && seat.occupiedUntil) {
    return `освободится в ${new Date(seat.occupiedUntil).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (seat.status === "reserved" && seat.reservedFrom) {
    return `бронь с ${new Date(seat.reservedFrom).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return seat.status === "free" ? "свободен" : "занят";
}

/** Карта зала: каждый компьютер клуба своим цветом — занят, свободен или забронирован. */
export function SeatMap({ seatMap, selectedIds, onSeatPress }: SeatMapProps) {
  const selecting = Boolean(selectedIds);
  const selected = new Set(selectedIds ?? []);
  const all = seatMap.zones.flatMap((zone) => zone.seats);
  const free = all.filter((seat) => seat.status === "free").length;
  return (
    <View>
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{free}</Text>
        <Text style={styles.summaryLabel}>свободно из {all.length} компьютеров</Text>
      </View>
      <View style={styles.legend}>
        {seatLegend.map((item) => (
          <View key={item.status} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
        {selecting && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Твой выбор</Text>
          </View>
        )}
      </View>
      {seatMap.zones.map((entry) => (
        <Animated.View key={entry.zone.id} entering={FadeIn.duration(260)} style={styles.zone}>
          <View style={styles.zoneHeader}>
            <View>
              <Text style={styles.zoneName}>{entry.zone.name}</Text>
              <Text style={styles.zoneDescription}>{entry.zone.description}</Text>
            </View>
            <Text style={styles.zonePrice}>{entry.zone.pricePerHour} ₸/ч</Text>
          </View>
          <View style={styles.grid}>
            {entry.seats.map((seat) => {
              const picked = selected.has(seat.id);
              const busy = seat.status !== "free";
              return (
                <Pressable
                  key={seat.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked, disabled: selecting && busy }}
                  accessibilityLabel={`Компьютер ${seat.label}, ${seatHint(seat, picked)}`}
                  disabled={selecting && busy}
                  onPress={() => onSeatPress?.(entry.zone.id, seat)}
                  style={({ pressed }) => [
                    styles.seat,
                    { backgroundColor: picked ? colors.primary : SEAT_COLORS[seat.status] },
                    seat.status === "free" && !picked && styles.seatFree,
                    selecting && busy && styles.seatBusy,
                    pressed && styles.seatPressed
                  ]}
                >
                  <Text style={[styles.seatLabel, (seat.status !== "free" || picked) && styles.seatLabelDark]}>{seat.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  summaryValue: { color: colors.primary, fontSize: 30, fontWeight: "900" },
  summaryLabel: { color: colors.muted, fontSize: 13 },
  legend: { marginTop: 14, marginBottom: 18, flexDirection: "row", flexWrap: "wrap", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 11, height: 11, borderRadius: 4, borderWidth: 1, borderColor: colors.border },
  legendText: { color: colors.muted, fontSize: 11 },
  zone: { marginBottom: 20 },
  zoneHeader: { marginBottom: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  zoneName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  zoneDescription: { marginTop: 2, color: colors.muted, fontSize: 11 },
  zonePrice: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  seat: { width: 44, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  seatFree: { borderWidth: 1, borderColor: colors.border },
  seatBusy: { opacity: 0.45 },
  seatPressed: { opacity: 0.65 },
  seatLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  seatLabelDark: { color: "#0E1A12" }
});
