import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListFilter, MapPin, MessageCircle, Search, UserRound } from "lucide-react-native";
import { Redirect, useRouter } from "expo-router";
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { ClubCard } from "@/components/club-card";
import { FilterChip } from "@/components/filter-chip";
import { getClubs } from "@/lib/api";
import { colors } from "@/theme";
import { useAuth } from "@/auth/auth-context";

const filters = ["Рядом", "Есть места", "24/7", "VIP", "PS5"];

function ClubSeparator() {
  return <View style={styles.separator} />;
}

export default function HomeScreen() {
  const router = useRouter();
  const { ready, session } = useAuth();
  const { data: clubs = [], isLoading } = useQuery({ queryKey: ["clubs"], queryFn: getClubs });
  if (!ready) return <SafeAreaView style={styles.loadingScreen}><Text style={styles.empty}>Загружаем OYNA…</Text></SafeAreaView>;
  if (!session) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={clubs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ClubCard club={item} />}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={ClubSeparator}
        ListHeaderComponent={
          <View>
            <View style={styles.header}><View><Text style={styles.eyebrow}>ТВОЙ ГОРОД</Text><View style={styles.location}><MapPin color={colors.primary} size={18} /><Text style={styles.city}>Алматы</Text></View></View><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="Сообщество" onPress={() => router.push("/community")} style={styles.iconButton}><MessageCircle color={colors.text} size={20} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Профиль" onPress={() => router.push("/profile")} style={styles.iconButton}><UserRound color={colors.text} size={20} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Мои бронирования" onPress={() => router.push("/bookings")} style={styles.iconButton}><CalendarDays color={colors.text} size={20} /></Pressable></View></View>
            <Text style={styles.title}>Где играем?</Text><Text style={styles.subtitle}>Найди свободный компьютер и забронируй за минуту.</Text>
            <View style={styles.search}><Search color={colors.muted} size={19} /><TextInput placeholder="Клуб, район или игра" placeholderTextColor={colors.muted} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="Фильтры"><ListFilter color={colors.primary} size={19} /></Pressable></View>
            <FlatList horizontal data={filters} keyExtractor={(item) => item} renderItem={({ item, index }) => <FilterChip label={item} active={index === 0} />} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} />
            <View style={styles.sectionTitle}><Text style={styles.sectionHeading}>Клубы рядом</Text><Text style={styles.count}>{isLoading ? "…" : `${clubs.length} клуба`}</Text></View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Загружаем клубы…</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, loadingScreen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }, content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32 }, separator: { height: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerActions:{flexDirection:"row",gap:8}, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }, location: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 6 }, city: { color: colors.text, fontSize: 17, fontWeight: "800" }, iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 34, color: colors.text, fontSize: 36, lineHeight: 41, fontWeight: "900", letterSpacing: -1.2 }, subtitle: { marginTop: 8, maxWidth: 310, color: colors.muted, fontSize: 15, lineHeight: 22 },
  search: { marginTop: 24, height: 54, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 15, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, input: { flex: 1, color: colors.text, fontSize: 14 }, filters: { gap: 8, paddingVertical: 14 },
  sectionTitle: { marginTop: 15, marginBottom: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionHeading: { color: colors.text, fontSize: 20, fontWeight: "800" }, count: { color: colors.muted, fontSize: 12 }, empty: { paddingVertical: 40, textAlign: "center", color: colors.muted }
});
