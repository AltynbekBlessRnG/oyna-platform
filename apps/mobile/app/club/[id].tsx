import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, ChevronLeft, Clock3, MapPin, Monitor, Star, Trophy, Users } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ClubAccountCard } from "@/components/club-account-card";
import { ClubBar } from "@/components/club-bar";
import { SeatMap } from "@/components/seat-map";
import { getClub, getClubTournaments, getSeatMap, getZones, registerTournament } from "@/lib/api";
import { colors } from "@/theme";

const SECTIONS = [
  { id: "hall", label: "Зал" },
  { id: "prices", label: "Цены" },
  { id: "bar", label: "Бар" },
  { id: "tournaments", label: "Турниры" },
  { id: "account", label: "Аккаунт" }
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function ClubDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<SectionId>("hall");

  const { data: club } = useQuery({ queryKey: ["club", id], queryFn: () => getClub(id) });
  const { data: zones = [] } = useQuery({ queryKey: ["zones", id], queryFn: () => getZones(id) });
  const { data: seatMap } = useQuery({ queryKey: ["seatmap", id], queryFn: () => getSeatMap(id), refetchInterval: 60_000, retry: false });
  const { data: tournaments = [] } = useQuery({ queryKey: ["club-tournaments", id], queryFn: () => getClubTournaments(id), retry: false });
  const join = useMutation({
    mutationFn: (tournamentId: string) => registerTournament(tournamentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["club-tournaments", id] })
  });

  if (!club) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Загружаем клуб…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        bottomOffset={30}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { backgroundColor: club.accent, paddingTop: insets.top + 12 }]}>
          <Pressable accessibilityLabel="Назад" onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <ChevronLeft color="#111014" size={22} />
          </Pressable>
          <Monitor color="#111014" size={76} strokeWidth={1.3} style={styles.heroIcon} />
        </View>

        <View style={styles.body}>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={styles.title}>{club.name}</Text>
              <View style={styles.inline}>
                <MapPin color={colors.muted} size={15} />
                <Text style={styles.muted}>{club.address} · {club.distanceKm} км</Text>
              </View>
            </View>
            <View style={styles.inline}>
              <Star color={colors.primary} fill={colors.primary} size={17} />
              <Text style={styles.rating}>{club.rating}</Text>
            </View>
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Monitor color={colors.primary} size={19} />
              <Text style={styles.statValue}>{club.availableSeats}</Text>
              <Text style={styles.statLabel}>свободно</Text>
            </View>
            <View style={styles.stat}>
              <Clock3 color={colors.primary} size={19} />
              <Text style={styles.statValue}>{club.openingHours ?? "24/7"}</Text>
              <Text style={styles.statLabel}>режим</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.money}>₸</Text>
              <Text style={styles.statValue}>{club.priceFrom}</Text>
              <Text style={styles.statLabel}>от / час</Text>
            </View>
          </View>

          <View style={styles.tabs}>
            {SECTIONS.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: section === item.id }}
                onPress={() => setSection(item.id)}
                style={[styles.tab, section === item.id && styles.tabActive]}
              >
                <Text style={[styles.tabText, section === item.id && styles.tabTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <Animated.View key={section} entering={FadeIn.duration(220)}>
            {section === "hall" ? (
              seatMap ? (
                <SeatMap
                  seatMap={seatMap}
                  onSeatPress={(zoneId, seat) => {
                    if (seat.status === "free") router.push({ pathname: "/booking/[clubId]", params: { clubId: club.id, zoneId } });
                  }}
                />
              ) : (
                <Text style={styles.muted}>Карта зала появится, когда клуб подключит свои компьютеры.</Text>
              )
            ) : null}

            {section === "prices" ? (
              <View>
                {zones.map((zone) => (
                  <View key={zone.id} style={styles.zone}>
                    <View style={styles.zoneIcon}><Monitor color={colors.primary} size={20} /></View>
                    <View style={styles.zoneBody}>
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      <Text style={styles.zoneDescription}>{zone.description}</Text>
                      <Text style={styles.zoneSeats}>{zone.seatCount} компьютеров</Text>
                    </View>
                    <Text style={styles.zonePrice}>{zone.pricePerHour} ₸<Text style={styles.zoneHour}>/ч</Text></Text>
                  </View>
                ))}
              </View>
            ) : null}

            {section === "bar" ? <ClubBar clubId={club.id} /> : null}

            {section === "tournaments" ? (
              tournaments.length ? (
                <View>
                  {tournaments.map((tournament) => (
                    <View key={tournament.id} style={styles.tournament}>
                      <View style={styles.inline}>
                        <Trophy color={colors.primary} size={18} />
                        <Text style={styles.tournamentName}>{tournament.name}</Text>
                      </View>
                      <Text style={styles.muted}>{tournament.description}</Text>
                      <View style={styles.tournamentMeta}>
                        <View style={styles.inline}>
                          <CalendarDays color={colors.muted} size={14} />
                          <Text style={styles.metaText}>
                            {new Date(tournament.startsAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                          </Text>
                        </View>
                        <View style={styles.inline}>
                          <Users color={colors.muted} size={14} />
                          <Text style={styles.metaText}>{tournament.registeredCount}/{tournament.capacity}</Text>
                        </View>
                      </View>
                      {tournament.prizeText ? <Text style={styles.prize}>Призовой фонд: {tournament.prizeText}</Text> : null}
                      {tournament.kind === "solo" && tournament.status === "published" ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={join.isPending}
                          onPress={() => join.mutate(tournament.id)}
                          style={[styles.joinButton, join.isPending && styles.disabled]}
                        >
                          <Text style={styles.joinText}>Подать заявку</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.muted}>У клуба пока нет объявленных турниров.</Text>
              )
            ) : null}

            {section === "account" ? <ClubAccountCard clubId={club.id} /> : null}
          </Animated.View>
        </View>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/booking/[clubId]", params: { clubId: club.id } })}
          style={styles.bookButton}
        >
          <Text style={styles.bookText}>Забронировать · от {club.priceFrom} ₸/ч</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 120 },
  hero: { height: 210, alignItems: "center", justifyContent: "center" },
  heroIcon: { opacity: 0.5 },
  back: { position: "absolute", left: 16, top: 0, marginTop: 12, width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center" },
  body: { padding: 18 },
  heading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headingText: { flex: 1 },
  title: { color: colors.text, fontSize: 27, fontWeight: "900", letterSpacing: -0.8 },
  inline: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  rating: { color: colors.text, fontSize: 15, fontWeight: "800" },
  stats: { marginTop: 20, marginBottom: 22, padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", justifyContent: "space-between" },
  stat: { flex: 1, alignItems: "center", gap: 6 },
  statValue: { color: colors.text, fontSize: 15, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 10 },
  money: { color: colors.primary, fontSize: 19, fontWeight: "900" },
  tabs: { marginBottom: 22, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: colors.primaryText },
  zone: { marginBottom: 11, padding: 15, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" },
  zoneIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  zoneBody: { flex: 1, marginLeft: 13 },
  zoneName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  zoneDescription: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 17 },
  zoneSeats: { marginTop: 6, color: colors.muted, fontSize: 10 },
  zonePrice: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  zoneHour: { color: colors.muted, fontWeight: "500" },
  tournament: { marginBottom: 12, padding: 17, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tournamentName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  tournamentMeta: { marginTop: 13, flexDirection: "row", justifyContent: "space-between" },
  metaText: { color: colors.muted, fontSize: 12 },
  prize: { marginTop: 10, color: colors.primary, fontSize: 12, fontWeight: "700" },
  joinButton: { marginTop: 15, height: 46, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  joinText: { color: colors.primaryText, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  bookButton: { height: 54, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  bookText: { color: colors.primaryText, fontSize: 15, fontWeight: "900" }
});
