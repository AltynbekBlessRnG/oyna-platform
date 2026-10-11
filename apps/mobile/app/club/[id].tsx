import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, ChevronLeft, Clock3, MapPin, Monitor, Star, Users } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ClubAccountCard } from "@/components/club-account-card";
import { ClubBar } from "@/components/club-bar";
import { SeatMap } from "@/components/seat-map";
import { SeatStrip } from "@/components/seat-strip";
import { getClub, getClubTournaments, getSeatMap, getZones, registerTournament } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";

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

  // Карта зала обновляется каждую минуту и точнее списка клубов, поэтому сначала верим ей.
  const seats = seatMap?.zones.flatMap((entry) => entry.seats);
  const freeSeats = seats ? seats.filter((seat) => seat.status === "free").length : club.availableSeats;
  const totalSeats = seats?.length ?? club.totalSeats;

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        bottomOffset={30}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          {club.imageUrl ? (
            <>
              <Image source={{ uri: club.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
              <View style={styles.heroScrim} />
            </>
          ) : (
            <Monitor color={colors.muted} size={64} strokeWidth={1.2} style={styles.heroIcon} />
          )}
          <Pressable accessibilityLabel="Назад" onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <ChevronLeft color={colors.text} size={22} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={styles.title}>{club.name}</Text>
              <View style={styles.inline}>
                <MapPin color={colors.muted} size={15} />
                <Text style={styles.muted}>{club.address}, {club.distanceKm} км</Text>
              </View>
            </View>
            <View style={styles.inline}>
              <Star color={colors.text} fill={colors.text} size={15} />
              <Text style={styles.rating}>{club.rating}</Text>
            </View>
          </View>

          <View style={styles.facts}>
            <SeatStrip free={freeSeats} total={totalSeats} />
            <View style={styles.factsRow}>
              <Text style={styles.factMain}>
                {freeSeats > 0 ? `${freeSeats} из ${totalSeats} свободны` : "Сейчас всё занято"}
              </Text>
              <View style={styles.inlineTight}>
                <Clock3 color={colors.muted} size={14} />
                <Text style={styles.factSide}>{club.openingHours ?? "24/7"}</Text>
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
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
          </ScrollView>

          <Animated.View key={section} entering={FadeIn.duration(220)}>
            {section === "hall" ? (
              seatMap ? (
                <SeatMap
                  seatMap={seatMap}
                  onSeatPress={(zoneId, seat) => {
                    if (seat.status === "free") router.push({ pathname: "/booking/[clubId]", params: { clubId: club.id, zoneId, seatId: seat.id } });
                  }}
                />
              ) : (
                <Text style={styles.muted}>Карта зала появится, когда клуб подключит свои компьютеры.</Text>
              )
            ) : null}

            {section === "prices" ? (
              <View>
                {zones.map((zone, index) => (
                  <View key={zone.id} style={[styles.zone, index === 0 && styles.zoneFirst]}>
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
                      {tournament.imageUrl ? (
                        <Image source={{ uri: tournament.imageUrl }} style={styles.tournamentCover} resizeMode="cover" accessibilityIgnoresInvertColors />
                      ) : null}
                      <Text style={styles.tournamentName}>{tournament.name}</Text>
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
          <Text style={styles.bookText}>Забронировать от {club.priceFrom} ₸/ч</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 120 },
  hero: { height: 220, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
  heroIcon: { opacity: 0.45 },
  // Затемнение под кнопкой «назад»: на светлом снимке её не видно.
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,20,20,0.25)" },
  back: { position: "absolute", left: 16, top: 0, marginTop: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(20,20,20,0.72)", alignItems: "center", justifyContent: "center" },
  body: { padding: 18 },
  heading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headingText: { flex: 1 },
  title: { color: colors.text, fontSize: 24, lineHeight: 31, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  inline: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  inlineTight: { flexDirection: "row", alignItems: "center", gap: 5 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  rating: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold },
  facts: { marginTop: 22, marginBottom: 20 },
  factsRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  factMain: { color: colors.text, fontSize: 14, fontFamily: fonts.medium },
  factSide: { color: colors.muted, fontSize: 13, fontFamily: fonts.body },
  // Вкладки — подчёркивание по нижней линии, а не ещё один ряд пилюль.
  tabsScroll: { marginHorizontal: -18, marginBottom: 22, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabs: { paddingHorizontal: 18, gap: 22 },
  tab: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  tabActive: { borderBottomColor: colors.text },
  tabText: { color: colors.muted, fontSize: 14, fontFamily: fonts.medium },
  tabTextActive: { color: colors.text },
  zone: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "flex-start", gap: 16 },
  zoneFirst: { paddingTop: 0 },
  zoneBody: { flex: 1 },
  zoneName: { color: colors.text, fontSize: 15, fontFamily: fonts.display },
  zoneDescription: { marginTop: 4, color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  zoneSeats: { marginTop: 6, color: colors.muted, fontSize: 12, fontFamily: fonts.body },
  zonePrice: { color: colors.text, fontSize: 15, fontFamily: fonts.display },
  zoneHour: { color: colors.muted, fontFamily: fonts.body },
  tournament: { marginBottom: 12, padding: 16, borderRadius: radii.card, backgroundColor: colors.surface, overflow: "hidden" },
  tournamentCover: { height: 128, marginTop: -16, marginHorizontal: -16, marginBottom: 14, backgroundColor: colors.surfaceRaised },
  tournamentName: { marginBottom: 6, color: colors.text, fontSize: 16, fontFamily: fonts.display },
  tournamentMeta: { marginTop: 12, flexDirection: "row", justifyContent: "space-between" },
  metaText: { color: colors.muted, fontSize: 12, fontFamily: fonts.body },
  prize: { marginTop: 10, color: colors.text, fontSize: 13, fontFamily: fonts.semibold },
  joinButton: { marginTop: 14, height: 46, borderRadius: radii.control, borderWidth: 1, borderColor: colors.text, alignItems: "center", justifyContent: "center" },
  joinText: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold },
  disabled: { opacity: 0.5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  bookButton: { height: 54, borderRadius: radii.control, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  bookText: { color: colors.primaryText, fontSize: 15, fontFamily: fonts.bold }
});
