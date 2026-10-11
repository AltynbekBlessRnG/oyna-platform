import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Coins, Trophy, Users } from "lucide-react-native";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTournaments, registerTournament } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";

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
      renderItem={({ item }) => (
        <View style={s.card}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={s.cover} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[s.cover, s.coverFallback]}><Trophy color={colors.muted} size={34} /></View>
          )}
          <View style={s.badge}><Text style={s.badgeText}>{item.kind === "solo" ? "Соло" : "Командный"}</Text></View>
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
                  <Coins size={14} color={colors.text} />
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
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, gap: 14 },
  header: { marginBottom: 6 },
  title: { color: colors.text, fontSize: 28, lineHeight: 36, fontFamily: fonts.displayBold, letterSpacing: -0.6 },
  sub: { color: colors.muted, marginTop: 5, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  empty: { color: colors.muted, textAlign: "center", paddingTop: 80, fontFamily: fonts.body },
  card: { borderRadius: radii.card, backgroundColor: colors.surface, overflow: "hidden" },
  cover: { width: "100%", height: 150, backgroundColor: colors.surfaceRaised },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 12, left: 12, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(20,20,20,0.82)" },
  badgeText: { color: colors.text, fontSize: 12, fontFamily: fonts.medium },
  body: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { color: colors.text, fontSize: 17, lineHeight: 23, fontFamily: fonts.display },
  description: { marginTop: 6, color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 14 },
  metaText: { color: colors.muted, fontSize: 13, fontFamily: fonts.body },
  prize: { color: colors.text, fontSize: 13, fontFamily: fonts.semibold },
  button: { marginTop: 16, borderWidth: 1, borderColor: colors.text, padding: 13, borderRadius: radii.control, alignItems: "center" },
  buttonText: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold }
});
