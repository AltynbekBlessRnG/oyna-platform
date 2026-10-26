import type { ClubSummary } from "@oyna/contracts";
import { useRouter } from "expo-router";
import { Monitor } from "lucide-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SeatStrip } from "@/components/seat-strip";
import { colors, fonts, radii } from "@/theme";

interface ClubCardProps { club: ClubSummary; }

export function ClubCard({ club }: ClubCardProps) {
  const router = useRouter();
  const available = club.availableSeats > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${club.name}, свободно ${club.availableSeats} из ${club.totalSeats}`}
      onPress={() => router.push(`/club/${club.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cover}>
        {club.imageUrl ? (
          <Image source={{ uri: club.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.coverPattern}><Monitor color={colors.muted} size={44} strokeWidth={1.25} /></View>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {/* Расстояние и рейтинг не показываем: пока это значения из каталога, а не геолокация и отзывы игроков. */}
          <View style={styles.titleText}>
            <Text style={styles.name} numberOfLines={1}>{club.name}</Text>
            <Text style={styles.address} numberOfLines={1}>{club.address}</Text>
          </View>
        </View>

        <SeatStrip free={club.availableSeats} total={club.totalSeats} style={styles.strip} />
        <Text style={[styles.seats, !available && styles.seatsNone]}>
          {available ? `${club.availableSeats} из ${club.totalSeats} компьютеров свободны` : "Сейчас всё занято"}
        </Text>

        <View style={styles.footer}>
          <View style={styles.tags}>
            {club.tags.slice(0, 3).map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}
          </View>
          <Text style={styles.price}>от {club.priceFrom} ₸<Text style={styles.hour}>/ч</Text></Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderRadius: radii.card, backgroundColor: colors.surface },
  pressed: { opacity: 0.85 },
  // Цвет клуба из данных в обложку не берём: случайный яркий цвет спорит с палитрой.
  cover: { height: 116, backgroundColor: colors.surfaceRaised },
  coverPattern: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", opacity: 0.5 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  titleText: { flex: 1 },
  name: { color: colors.text, fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.2 },
  address: { marginTop: 3, color: colors.muted, fontSize: 13, fontFamily: fonts.body },
  strip: { marginTop: 16 },
  seats: { marginTop: 8, color: colors.text, fontSize: 12, fontFamily: fonts.medium },
  seatsNone: { color: colors.muted },
  footer: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  tags: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { borderRadius: 6, borderWidth: 1, borderColor: colors.border, color: colors.muted, fontSize: 11, fontFamily: fonts.medium, paddingHorizontal: 7, paddingVertical: 3, overflow: "hidden" },
  price: { color: colors.text, fontSize: 14, fontFamily: fonts.display },
  hour: { color: colors.muted, fontFamily: fonts.body }
});
