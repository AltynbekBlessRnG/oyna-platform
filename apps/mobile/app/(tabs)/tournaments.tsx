import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Coins, Trophy, Users } from "lucide-react-native";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTournaments, registerTournament } from "@/lib/api";
import { colors } from "@/theme";

export default function Tournaments() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["tournaments"], queryFn: () => getTournaments() });
  const join = useMutation({
    mutationFn: (id: string) => registerTournament(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tournaments"] })
  });

  return (
    <FlatList
      style={s.page}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]}
      data={data}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={s.header}>
          <Text style={s.title}>Турниры</Text>
          <Text style={s.sub}>Официальные соревнования компьютерных клубов.</Text>
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>Опубликованных турниров пока нет.</Text>}
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 55).duration(320)} style={s.card}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={s.cover} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[s.cover, s.coverFallback]}><Trophy color={colors.muted} size={34} /></View>
          )}
          <View style={s.badge}><Text style={s.badgeText}>{item.kind === "solo" ? "СОЛО" : "КОМАНДЫ"}</Text></View>
          <View style={s.body}>
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.description}>{item.description}</Text>
            <View style={s.meta}>
              <View style={s.row}>
                <CalendarDays size={14} color={colors.muted} />
                <Text style={s.metaText}>{new Date(item.startsAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</Text>
              </View>
              <View style={s.row}>
                <Users size={14} color={colors.muted} />
                <Text style={s.metaText}>{item.registeredCount}/{item.capacity}</Text>
              </View>
              {item.prizeText ? (
                <View style={s.row}>
                  <Coins size={14} color={colors.primary} />
                  <Text style={s.prize}>{item.prizeText}</Text>
                </View>
              ) : null}
            </View>
            {item.kind === "solo" && item.status === "published" ? (
              <Pressable accessibilityRole="button" style={s.button} onPress={() => join.mutate(item.id)}>
                <Text style={s.buttonText}>Подать заявку</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      )}
    />
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, gap: 15 },
  header: { marginBottom: 4 },
  title: { color: colors.text, fontSize: 32, fontWeight: "900", letterSpacing: -0.8 },
  sub: { color: colors.muted, marginTop: 5, lineHeight: 20 },
  empty: { color: colors.muted, textAlign: "center", paddingTop: 80 },
  card: { borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cover: { width: "100%", height: 150, backgroundColor: colors.surfaceRaised },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.primary },
  badgeText: { color: colors.primaryText, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  body: { padding: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { color: colors.text, fontSize: 18, fontWeight: "800" },
  description: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 19 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 15 },
  metaText: { color: colors.muted, fontSize: 12 },
  prize: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  button: { marginTop: 17, backgroundColor: colors.primary, padding: 14, borderRadius: 14, alignItems: "center" },
  buttonText: { color: colors.primaryText, fontWeight: "900" }
});
