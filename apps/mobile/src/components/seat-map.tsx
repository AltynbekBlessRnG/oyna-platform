import type { ClubSeatMap, SeatMapSeat } from "@oyna/contracts";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, radii, seatLegend } from "@/theme";

interface SeatMapProps {
  seatMap: ClubSeatMap;
  /** Выбранные компьютеры подсвечиваются поверх статуса — режим брони. */
  selectedIds?: string[];
  onSeatPress?: (zoneId: string, seat: SeatMapSeat) => void;
}

/**
 * Свободный компьютер — золотой контур, его можно взять. Занятый гаснет в фон,
 * забронированный обведён пунктиром. Выбранный заливается золотом целиком.
 */
function seatStyle(status: SeatMapSeat["status"] | "selected"): StyleProp<ViewStyle> {
  if (status === "selected") return styles.seatSelected;
  if (status === "free") return styles.seatFree;
  if (status === "reserved") return styles.seatReserved;
  return styles.seatOccupied;
}

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

/** Карта зала: каждый компьютер клуба на своём месте, по зонам. */
export function SeatMap({ seatMap, selectedIds, onSeatPress }: SeatMapProps) {
  const selecting = Boolean(selectedIds);
  const selected = new Set(selectedIds ?? []);
  const all = seatMap.zones.flatMap((zone) => zone.seats);
  const free = all.filter((seat) => seat.status === "free").length;
  return (
    <View>
      <Text style={styles.summary}>
        <Text style={styles.summaryValue}>{free}</Text> из {all.length} свободны
      </Text>
      <View style={styles.legend}>
        {seatLegend.map((item) => (
          <View key={item.status} style={styles.legendItem}>
            <View style={[styles.legendSwatch, seatStyle(item.status)]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
        {selecting && (
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, seatStyle("selected")]} />
            <Text style={styles.legendText}>Твой выбор</Text>
          </View>
        )}
      </View>
      {seatMap.zones.map((entry) => (
        <View key={entry.zone.id} style={styles.zone}>
          <View style={styles.zoneHeader}>
            <Text style={styles.zoneName}>{entry.zone.name}</Text>
            <Text style={styles.zonePrice}>{entry.zone.pricePerHour} ₸/ч</Text>
          </View>
          {entry.zone.description ? <Text style={styles.zoneDescription}>{entry.zone.description}</Text> : null}
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
                  hitSlop={2}
                  style={({ pressed }) => [styles.seat, seatStyle(picked ? "selected" : seat.status), pressed && styles.seatPressed]}
                >
                  <Text style={[styles.seatLabel, picked ? styles.seatLabelSelected : !busy && styles.seatLabelFree]}>{seat.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { color: colors.muted, fontSize: 14, fontFamily: fonts.body },
  summaryValue: { color: colors.text, fontSize: 22, fontFamily: fonts.displayBold },
  legend: { marginTop: 12, marginBottom: 22, flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendSwatch: { width: 14, height: 12, borderRadius: 3 },
  legendText: { color: colors.muted, fontSize: 12, fontFamily: fonts.body },
  zone: { marginBottom: 24 },
  zoneHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  zoneName: { flex: 1, color: colors.text, fontSize: 14, fontFamily: fonts.display },
  zonePrice: { color: colors.text, fontSize: 13, fontFamily: fonts.semibold },
  zoneDescription: { marginTop: 3, color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.body },
  grid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  seat: { width: 46, height: 40, borderRadius: radii.seat, alignItems: "center", justifyContent: "center" },
  seatFree: { borderWidth: 1.5, borderColor: colors.seatFree },
  seatOccupied: { backgroundColor: colors.seatOccupied },
  seatReserved: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.seatReserved },
  seatSelected: { backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.primary },
  seatPressed: { opacity: 0.6 },
  seatLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.display },
  seatLabelFree: { color: colors.seatFree },
  seatLabelSelected: { color: colors.primaryText }
});
