import type { ClubSummary } from "@oyna/contracts";
import { useRouter } from "expo-router";
import { MapPin, Monitor, Star } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

interface ClubCardProps { club: ClubSummary; }

export function ClubCard({ club }: ClubCardProps) {
  const router = useRouter();
  const available = club.availableSeats > 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Открыть ${club.name}`} onPress={() => router.push(`/club/${club.id}`)} style={styles.card}>
      <View style={[styles.cover, { backgroundColor: club.accent }]}>
        <View style={styles.coverPattern}><Monitor color="#111014" size={54} strokeWidth={1.5} /></View>
        <View style={styles.distance}><MapPin color={colors.text} size={13} /><Text style={styles.distanceText}>{club.distanceKm} км</Text></View>
        <View style={[styles.status, !available && styles.statusBusy]}><View style={[styles.statusDot, !available && styles.statusDotBusy]} /><Text style={styles.statusText}>{available ? `${club.availableSeats} мест` : "Нет мест"}</Text></View>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}><View><Text style={styles.name}>{club.name}</Text><Text style={styles.address}>{club.address}</Text></View><View style={styles.rating}><Star color={colors.primary} fill={colors.primary} size={15} /><Text style={styles.ratingText}>{club.rating}</Text></View></View>
        <View style={styles.tags}>{club.tags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View>
        <View style={styles.footer}><Text style={styles.equipment}>{club.equipment}</Text><Text style={styles.price}>от {club.priceFrom} ₸<Text style={styles.hour}>/ч</Text></Text></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { height: 128, padding: 12 },
  coverPattern: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", opacity: 0.45 },
  distance: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(17,16,20,0.78)", paddingHorizontal: 9, paddingVertical: 6 },
  distanceText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  status: { position: "absolute", right: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "rgba(17,16,20,0.84)", paddingHorizontal: 10, paddingVertical: 7 },
  statusBusy: { opacity: 0.85 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, statusDotBusy: { backgroundColor: colors.danger }, statusText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  body: { padding: 16 }, titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, name: { color: colors.text, fontSize: 19, fontWeight: "800" }, address: { marginTop: 4, color: colors.muted, fontSize: 13 }, rating: { flexDirection: "row", alignItems: "center", gap: 5 }, ratingText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  tags: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 7 }, tag: { borderRadius: 8, backgroundColor: colors.surfaceRaised, color: colors.muted, fontSize: 11, paddingHorizontal: 8, paddingVertical: 5, overflow: "hidden" },
  footer: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, equipment: { color: colors.muted, fontSize: 12 }, price: { color: colors.text, fontSize: 14, fontWeight: "800" }, hour: { color: colors.muted, fontWeight: "500" }
});

