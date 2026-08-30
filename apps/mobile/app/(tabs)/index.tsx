import type { ClubSummary } from "@oyna/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, MapPin, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ClubCard } from "@/components/club-card";
import { FilterChip } from "@/components/filter-chip";
import { getClubs, getNotifications } from "@/lib/api";
import { colors } from "@/theme";
import { useAuth } from "@/auth/auth-context";

interface Filter {
  id: string;
  label: string;
  matches: (club: ClubSummary) => boolean;
}

const FILTERS: Filter[] = [
  { id: "near", label: "Рядом", matches: (club) => club.distanceKm <= 2 },
  { id: "free", label: "Есть места", matches: (club) => club.availableSeats > 0 },
  { id: "24/7", label: "24/7", matches: (club) => club.tags.includes("24/7") },
  { id: "vip", label: "VIP", matches: (club) => club.tags.includes("VIP") },
  { id: "ps5", label: "PS5", matches: (club) => club.tags.includes("PS5") }
];

function ClubSeparator() {
  return <View style={styles.separator} />;
}

function clubWord(count: number): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "клубов";
  const last = count % 10;
  if (last === 1) return "клуб";
  if (last >= 2 && last <= 4) return "клуба";
  return "клубов";
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string[]>([]);
  const { data: clubs = [], isLoading } = useQuery({ queryKey: ["clubs"], queryFn: getClubs });
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: getNotifications, enabled: Boolean(session), retry: false });
  const unread = notifications.filter((item) => !item.readAt).length;

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clubs.filter((club) => {
      const matchesQuery =
        !query ||
        [club.name, club.address, club.equipment, ...club.tags].some((field) => field.toLowerCase().includes(query));
      const matchesFilters = active.every((id) => FILTERS.find((filter) => filter.id === id)?.matches(club) ?? true);
      return matchesQuery && matchesFilters;
    });
  }, [clubs, search, active]);

  function toggle(id: string): void {
    setActive((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 45).duration(320)}>
            <ClubCard club={item} />
          </Animated.View>
        )}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={ClubSeparator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>ТВОЙ ГОРОД</Text>
                <View style={styles.location}>
                  <MapPin color={colors.primary} size={18} />
                  <Text style={styles.city}>Алматы</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
                onPress={() => router.push("/notifications")}
                style={styles.iconButton}
              >
                <Bell color={colors.text} size={20} />
                {unread ? <View style={styles.badge} /> : null}
              </Pressable>
            </View>
            <Text style={styles.title}>Где играем?</Text>
            <Text style={styles.subtitle}>Найди свободный компьютер и забронируй за минуту.</Text>
            <View style={styles.search}>
              <Search color={colors.muted} size={19} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Клуб, район или игра"
                placeholderTextColor={colors.muted}
                style={styles.input}
                returnKeyType="search"
              />
              {search ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Очистить поиск" onPress={() => setSearch("")} hitSlop={10}>
                  <X color={colors.muted} size={18} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.filters}>
              {FILTERS.map((filter) => (
                <FilterChip key={filter.id} label={filter.label} active={active.includes(filter.id)} onPress={() => toggle(filter.id)} />
              ))}
            </View>
            <View style={styles.sectionTitle}>
              <Text style={styles.sectionHeading}>Клубы рядом</Text>
              <Text style={styles.count}>{isLoading ? "…" : `${visible.length} ${clubWord(visible.length)}`}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? "Загружаем клубы…" : "Под фильтры ничего не подошло. Попробуй снять пару."}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28 },
  separator: { height: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  location: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 6 },
  city: { color: colors.text, fontSize: 17, fontWeight: "800" },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  title: { marginTop: 26, color: colors.text, fontSize: 36, lineHeight: 41, fontWeight: "900", letterSpacing: -1.2 },
  subtitle: { marginTop: 8, maxWidth: 310, color: colors.muted, fontSize: 15, lineHeight: 22 },
  search: { marginTop: 22, height: 54, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 15, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, color: colors.text, fontSize: 14 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 14 },
  sectionTitle: { marginTop: 8, marginBottom: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeading: { color: colors.text, fontSize: 20, fontWeight: "800" },
  count: { color: colors.muted, fontSize: 12 },
  empty: { paddingVertical: 40, paddingHorizontal: 20, textAlign: "center", color: colors.muted, lineHeight: 20 }
});
