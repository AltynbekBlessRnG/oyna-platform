import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "@/theme";

interface FilterChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function FilterChip({ label, active = false, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.container, active && styles.active, pressed && styles.pressed]}
    >
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  active: { borderColor: colors.primary, backgroundColor: colors.primary },
  pressed: { opacity: 0.7 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  activeLabel: { color: colors.primaryText }
});
