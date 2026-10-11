import type { NotificationItem } from "@oyna/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarCheck2, Trophy, Users } from "lucide-react-native";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getNotifications, markNotificationRead } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";

const ICONS = { booking_status: CalendarCheck2, tournament_registration: Trophy, match_scheduled: Trophy, match_result: Trophy, team_invite: Users, chat_reply: BellRing };

function Separator() {
  return <View style={styles.separator} />;
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery({ queryKey: ["notifications"], queryFn: getNotifications });
  const read = useMutation({ mutationFn: markNotificationRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }) });

  function renderItem({ item }: { item: NotificationItem }) {
    const Icon = ICONS[item.type] ?? BellRing;
    const created = new Date(item.createdAt);
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => { if (!item.readAt) read.mutate(item.id); }}
        style={[styles.card, !item.readAt && styles.unread]}
      >
        <View style={styles.icon}><Icon color={item.readAt ? colors.muted : colors.text} size={19} /></View>
        <View style={styles.body}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.text}>{item.body}</Text>
          <Text style={styles.time}>{created.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, {created.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Text style={styles.empty}>{isLoading ? "Загружаем…" : "Уведомлений пока нет. Здесь появится ответ клуба на твою бронь."}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32 },
  separator: { height: 8 },
  card: { flexDirection: "row", gap: 12, padding: 15, borderRadius: radii.card, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  // Непрочитанное приподнято над фоном, прочитанное уходит в контур.
  unread: { backgroundColor: colors.surface, borderColor: colors.surface },
  icon: { width: 38, height: 38, borderRadius: radii.control, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
  body: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 15, fontFamily: fonts.semibold },
  text: { color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  time: { color: colors.muted, fontSize: 12, fontFamily: fonts.body },
  empty: { paddingVertical: 40, textAlign: "center", color: colors.muted, fontFamily: fonts.body, lineHeight: 20 }
});
