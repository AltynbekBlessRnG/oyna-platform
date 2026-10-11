import type { ClubSummary } from "@oyna/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, MapPin, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ClubCard } from "@/components/club-card";
import { FilterChip } from "@/components/filter-chip";
import { getClubs, getNotifications } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";
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
        renderItem={({ item }) => <ClubCard club={item} />}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={ClubSeparator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.location}>
                <MapPin color={colors.text} size={16} />
                <Text style={styles.city}>Алматы</Text>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filters}>
              {FILTERS.map((filter) => (
                <FilterChip key={filter.id} label={filter.label} active={active.includes(filter.id)} onPress={() => toggle(filter.id)} />
              ))}
            </ScrollView>
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
  location: { flexDirection: "row", alignItems: "center", gap: 6 },
  city: { color: colors.text, fontSize: 15, fontFamily: fonts.semibold },
  iconButton: { width: 42, height: 42, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  title: { marginTop: 28, color: colors.text, fontSize: 32, lineHeight: 40, fontFamily: fonts.displayBold, letterSpacing: -0.8 },
  subtitle: { marginTop: 8, maxWidth: 310, color: colors.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.body },
  search: { marginTop: 22, height: 50, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: radii.control, backgroundColor: colors.surface },
  input: { flex: 1, color: colors.text, fontSize: 15, fontFamily: fonts.body },
  filtersScroll: { marginHorizontal: -18 },
  filters: { gap: 8, paddingHorizontal: 18, paddingVertical: 14 },
  sectionTitle: { marginTop: 10, marginBottom: 12, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionHeading: { color: colors.text, fontSize: 18, fontFamily: fonts.display },
  count: { color: colors.muted, fontSize: 13, fontFamily: fonts.body },
  empty: { paddingVertical: 40, paddingHorizontal: 20, textAlign: "center", color: colors.muted, lineHeight: 20, fontFamily: fonts.body }
});
