import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts } from "@/theme";

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
  // Включённый фильтр — светлый, а не золотой: золото оставлено за свободными местами.
  container: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  active: { borderColor: colors.text, backgroundColor: colors.text },
  pressed: { opacity: 0.7 },
  label: { color: colors.text, fontSize: 13, fontFamily: fonts.medium },
  activeLabel: { color: colors.background }
});
