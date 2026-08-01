import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Clock3, MapPin, Monitor, Star } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getClub } from "@/lib/api";
import { colors } from "@/theme";

export default function ClubDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: club } = useQuery({ queryKey: ["club", id], queryFn: () => getClub(id) });
  if (!club) return <View style={styles.center}><Text style={styles.muted}>Загружаем клуб…</Text></View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { backgroundColor: club.accent }]}><Monitor color="#111014" size={88} strokeWidth={1.3} /></View>
      <View style={styles.heading}><View><Text style={styles.title}>{club.name}</Text><View style={styles.inline}><MapPin color={colors.muted} size={15} /><Text style={styles.muted}>{club.address} · {club.distanceKm} км</Text></View></View><View style={styles.inline}><Star color={colors.primary} fill={colors.primary} size={17} /><Text style={styles.rating}>{club.rating}</Text></View></View>
      <View style={styles.stats}><View style={styles.stat}><Monitor color={colors.primary} size={20} /><Text style={styles.statValue}>{club.availableSeats}</Text><Text style={styles.statLabel}>свободно</Text></View><View style={styles.stat}><Clock3 color={colors.primary} size={20} /><Text style={styles.statValue}>24/7</Text><Text style={styles.statLabel}>режим</Text></View><View style={styles.stat}><Text style={styles.money}>₸</Text><Text style={styles.statValue}>{club.priceFrom}</Text><Text style={styles.statLabel}>от / час</Text></View></View>
      <Text style={styles.sectionTitle}>Доступные зоны</Text>
      {["Standard · RTX 4060", "VIP · RTX 4070", "Bootcamp · 5 мест"].map((zone, index) => <View key={zone} style={styles.zone}><View><Text style={styles.zoneName}>{zone}</Text><Text style={styles.muted}>{index === 2 ? "Свободно с 21:00" : `${Math.max(club.availableSeats - index * 4, 2)} мест сейчас`}</Text></View><Text style={styles.zonePrice}>от {club.priceFrom + index * 300} ₸</Text></View>)}
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/booking/[clubId]", params: { clubId: club.id } })} style={styles.bookButton}><Text style={styles.bookButtonText}>Выбрать время</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 36 }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }, hero: { height: 190, borderRadius: 24, alignItems: "center", justifyContent: "center" }, heading: { marginTop: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, title: { color: colors.text, fontSize: 27, fontWeight: "900" }, inline: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 5 }, muted: { color: colors.muted, fontSize: 13 }, rating: { color: colors.text, fontWeight: "800" },
  stats: { marginTop: 24, flexDirection: "row", gap: 9 }, stat: { flex: 1, minHeight: 104, borderRadius: 18, padding: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, statValue: { marginTop: 9, color: colors.text, fontSize: 18, fontWeight: "800" }, statLabel: { marginTop: 2, color: colors.muted, fontSize: 10 }, money: { color: colors.primary, fontSize: 20, fontWeight: "900" }, sectionTitle: { marginTop: 28, marginBottom: 12, color: colors.text, fontSize: 19, fontWeight: "800" },
  zone: { marginBottom: 9, padding: 16, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, zoneName: { marginBottom: 5, color: colors.text, fontSize: 14, fontWeight: "700" }, zonePrice: { color: colors.primary, fontSize: 13, fontWeight: "800" }, bookButton: { marginTop: 15, height: 56, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }, bookButtonText: { color: colors.primaryText, fontSize: 15, fontWeight: "900" }
});
