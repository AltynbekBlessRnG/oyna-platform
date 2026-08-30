import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getClubAccount, renameClubAccount } from "@/lib/api";
import { colors } from "@/theme";

/** Клубный аккаунт: в каждом клубе у игрока свой ник, бонусы и наигранные часы. */
export function ClubAccountCard({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const { data: account } = useQuery({ queryKey: ["club-account", clubId], queryFn: () => getClubAccount(clubId), retry: false });
  const rename = useMutation({
    mutationFn: () => renameClubAccount(clubId, nickname),
    onSuccess: (updated) => {
      setEditing(false);
      queryClient.setQueryData(["club-account", clubId], updated);
    }
  });

  if (!account) return <Text style={styles.empty}>Клубный аккаунт откроется после входа в приложение.</Text>;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{account.nickname.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.identity}>
          {editing ? (
            <View style={styles.editRow}>
              <TextInput
                value={nickname}
                onChangeText={setNickname}
                placeholder={account.nickname}
                placeholderTextColor={colors.muted}
                maxLength={32}
                style={styles.input}
                autoFocus
              />
              <Pressable accessibilityLabel="Сохранить ник" onPress={() => rename.mutate()} style={styles.saveButton} hitSlop={6}>
                <Check color={colors.primaryText} size={16} />
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.nickname}>{account.nickname}</Text>
              <Text style={styles.club}>аккаунт в {account.clubName}</Text>
            </>
          )}
        </View>
        {!editing ? (
          <Pressable
            accessibilityLabel="Изменить клубный ник"
            onPress={() => { setNickname(account.nickname); setEditing(true); }}
            style={styles.editButton}
            hitSlop={6}
          >
            <Pencil color={colors.muted} size={16} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{account.balance.toLocaleString("ru-KZ")} ₸</Text>
          <Text style={styles.statLabel}>на счету</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{account.bonusPoints}</Text>
          <Text style={styles.statLabel}>бонусов</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{account.hoursPlayed}</Text>
          <Text style={styles.statLabel}>часов в клубе</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  card: { padding: 17, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primaryText, fontSize: 19, fontWeight: "900" },
  identity: { flex: 1 },
  nickname: { color: colors.text, fontSize: 17, fontWeight: "800" },
  club: { marginTop: 3, color: colors.muted, fontSize: 12 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, height: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 14 },
  saveButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  editButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  stats: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between" },
  stat: { flex: 1 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "900" },
  statLabel: { marginTop: 4, color: colors.muted, fontSize: 11 }
});
