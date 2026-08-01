import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "@/theme";

interface FilterChipProps { label: string; active?: boolean; }

export function FilterChip({ label, active = false }: FilterChipProps) {
  return (
    <Pressable accessibilityRole="button" style={[styles.container, active && styles.active]}>
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  active: { borderColor: colors.primary, backgroundColor: colors.primary },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  activeLabel: { color: colors.primaryText }
});

