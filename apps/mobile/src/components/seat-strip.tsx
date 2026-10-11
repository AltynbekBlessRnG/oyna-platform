import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/theme";

const MAX_CELLS = 32;

interface SeatStripProps {
  free: number;
  total: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Зал в одну строку: клеток столько же, сколько компьютеров, свободные горят золотом.
 * В большом клубе клеток меньше, чем мест, но пропорция свободных сохраняется.
 */
export function SeatStrip({ free, total, style }: SeatStripProps) {
  const cells = Math.max(1, Math.min(total, MAX_CELLS));
  const lit = total > 0 ? Math.round((Math.min(free, total) / total) * cells) : 0;
  // Хоть одно свободное место всегда видно, даже если при округлении оно пропало бы.
  const shown = free > 0 ? Math.max(1, lit) : 0;
  return (
    <View style={[styles.row, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: cells }, (_, index) => (
        <View key={index} style={[styles.cell, index < shown && styles.free]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 3, height: 10 },
  cell: { flex: 1, maxWidth: 14, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  free: { backgroundColor: colors.seatFree }
});
