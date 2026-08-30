import type { ClubSeatMap, SeatMapSeat } from "@oyna/contracts";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, seatLegend } from "@/theme";

interface SeatMapProps {
  seatMap: ClubSeatMap;
  onSeatPress?: (zoneId: string, seat: SeatMapSeat) => void;
}

const SEAT_COLORS: Record<SeatMapSeat["status"], string> = {
  occupied: colors.seatOccupied,
  free: colors.seatFree,
  reserved: colors.seatReserved
};

function seatHint(seat: SeatMapSeat): string {
  if (seat.status === "occupied" && seat.occupiedUntil) {
    return `освободится в ${new Date(seat.occupiedUntil).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (seat.status === "reserved" && seat.reservedFrom) {
    return `бронь с ${new Date(seat.reservedFrom).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "свободен";
}

/** Карта зала: каждый компьютер клуба своим цветом — занят, свободен или забронирован. */
export function SeatMap({ seatMap, onSeatPress }: SeatMapProps) {
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
      </View>
      {seatMap.zones.map((entry) => (
        <Animated.View key={entry.zone.id} entering={FadeIn.duration(260)} style={styles.zone}>
          <View style={styles.zoneHeader}>
            <Text style={styles.zoneName}>{entry.zone.name}</Text>
            <Text style={styles.zonePrice}>{entry.zone.pricePerHour} ₸/ч</Text>
          </View>
          <View style={styles.grid}>
            {entry.seats.map((seat) => (
              <Pressable
                key={seat.id}
                accessibilityRole="button"
                accessibilityLabel={`Компьютер ${seat.label}, ${seatHint(seat)}`}
                onPress={() => onSeatPress?.(entry.zone.id, seat)}
                style={({ pressed }) => [
                  styles.seat,
                  { backgroundColor: SEAT_COLORS[seat.status] },
                  seat.status === "free" && styles.seatFree,
                  pressed && styles.seatPressed
                ]}
              >
                <Text style={[styles.seatLabel, seat.status !== "free" && styles.seatLabelDark]}>{seat.label}</Text>
              </Pressable>
            ))}
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
  zoneHeader: { marginBottom: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  zoneName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  zonePrice: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  seat: { width: 44, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  seatFree: { borderWidth: 1, borderColor: colors.border },
  seatPressed: { opacity: 0.65 },
  seatLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  seatLabelDark: { color: "#0E1A12" }
});
