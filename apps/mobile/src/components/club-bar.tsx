import type { MenuCategory, MenuItem } from "@oyna/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag, UtensilsCrossed } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createClubOrder, getClubMenu, getClubOrders } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";

const CATEGORY_LABELS: Record<MenuCategory, string> = { drinks: "Напитки", food: "Еда", snacks: "Снеки", other: "Другое" };
const ORDER_STATUS: Record<string, string> = { new: "Принят в работу", accepted: "Готовится", delivered: "Доставлен", cancelled: "Отменён" };

/** Бар клуба: заказ собирается прямо в приложении и приносится за компьютер. */
export function ClubBar({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [seat, setSeat] = useState("");
  const [error, setError] = useState("");
  const { data: menu = [] } = useQuery({ queryKey: ["club-menu", clubId], queryFn: () => getClubMenu(clubId) });
  const { data: orders = [] } = useQuery({ queryKey: ["club-orders", clubId], queryFn: () => getClubOrders(clubId), retry: false });

  const order = useMutation({
    mutationFn: () =>
      createClubOrder(clubId, {
        seatLabel: seat.trim(),
        lines: Object.entries(cart).map(([itemId, quantity]) => ({ itemId, quantity }))
      }),
    onSuccess: () => {
      setCart({});
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["club-orders", clubId] });
    },
    onError: () => setError("Не получилось отправить заказ. Проверь номер компьютера и попробуй ещё раз.")
  });

  const grouped = useMemo(() => {
    const map = new Map<MenuCategory, MenuItem[]>();
    for (const item of menu) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return [...map.entries()];
  }, [menu]);

  const total = menu.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0);
  const positions = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);

  function change(itemId: string, delta: number): void {
    setCart((current) => {
      const next = Math.max(0, (current[itemId] ?? 0) + delta);
      const { [itemId]: _removed, ...rest } = current;
      return next ? { ...rest, [itemId]: next } : rest;
    });
  }

  if (!menu.length) return <Text style={styles.empty}>Клуб пока не подключил барное меню.</Text>;

  return (
    <View>
      {grouped.map(([category, items]) => (
        <View key={category} style={styles.category}>
          <Text style={styles.categoryTitle}>{CATEGORY_LABELS[category]}</Text>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.photo, styles.photoFallback]}><UtensilsCrossed color={colors.muted} size={30} /></View>
              )}
              {(cart[item.id] ?? 0) > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{cart[item.id]}</Text></View> : null}
              <View style={styles.cardBody}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.description ? <Text style={styles.itemDescription}>{item.description}</Text> : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.itemPrice}>{item.price.toLocaleString("ru-KZ")} ₸</Text>
                  <View style={styles.stepper}>
                    <Pressable accessibilityLabel={`Убрать ${item.name}`} disabled={!cart[item.id]} onPress={() => change(item.id, -1)} style={[styles.stepperButton, !cart[item.id] && styles.stepperDisabled]} hitSlop={6}>
                      <Minus color={colors.text} size={16} />
                    </Pressable>
                    <Text style={styles.quantity}>{cart[item.id] ?? 0}</Text>
                    <Pressable accessibilityLabel={`Добавить ${item.name}`} onPress={() => change(item.id, 1)} style={styles.stepperButton} hitSlop={6}>
                      <Plus color={colors.text} size={16} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}

      {positions > 0 ? (
        <View style={styles.checkout}>
          <Text style={styles.checkoutLabel}>Номер компьютера</Text>
          <TextInput
            value={seat}
            onChangeText={setSeat}
            placeholder="Например, 07"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={16}
            style={styles.seatInput}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={!seat.trim() || order.isPending}
            onPress={() => order.mutate()}
            style={[styles.orderButton, (!seat.trim() || order.isPending) && styles.orderDisabled]}
          >
            <ShoppingBag color={!seat.trim() || order.isPending ? colors.muted : colors.primaryText} size={17} />
            <Text style={[styles.orderText, (!seat.trim() || order.isPending) && styles.orderTextDisabled]}>{order.isPending ? "Отправляем…" : `Заказать за ${total.toLocaleString("ru-KZ")} ₸`}</Text>
          </Pressable>
        </View>
      ) : null}

      {orders.length ? (
        <View style={styles.history}>
          <Text style={styles.categoryTitle}>Мои заказы</Text>
          {orders.slice(0, 5).map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <Text style={styles.historyText}>
                Место {item.seatLabel}: {item.lines.map((line) => `${line.name} ×${line.quantity}`).join(", ")}
              </Text>
              <Text style={styles.historyStatus}>{ORDER_STATUS[item.status] ?? item.status}, {item.total.toLocaleString("ru-KZ")} ₸</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  category: { marginBottom: 20 },
  categoryTitle: { marginBottom: 12, color: colors.text, fontSize: 15, fontFamily: fonts.display },
  card: { marginBottom: 12, borderRadius: radii.card, backgroundColor: colors.surface, overflow: "hidden" },
  photo: { width: "100%", height: 160, backgroundColor: colors.surfaceRaised },
  photoFallback: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 12, right: 12, minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.primaryText, fontSize: 13, fontFamily: fonts.display },
  cardBody: { padding: 15 },
  cardFooter: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemName: { color: colors.text, fontSize: 16, fontFamily: fonts.semibold },
  itemDescription: { marginTop: 4, color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  itemPrice: { color: colors.text, fontSize: 16, fontFamily: fonts.display },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperButton: { width: 36, height: 36, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepperDisabled: { opacity: 0.35 },
  quantity: { minWidth: 18, textAlign: "center", color: colors.text, fontSize: 15, fontFamily: fonts.display },
  checkout: { marginTop: 4, padding: 16, borderRadius: radii.card, backgroundColor: colors.surface },
  checkoutLabel: { marginBottom: 8, color: colors.muted, fontSize: 13, fontFamily: fonts.medium },
  seatInput: { height: 48, paddingHorizontal: 14, borderRadius: radii.control, backgroundColor: colors.background, color: colors.text, fontSize: 16, fontFamily: fonts.display },
  error: { marginTop: 10, color: colors.danger, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  orderButton: { marginTop: 13, height: 52, borderRadius: radii.control, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  orderText: { color: colors.primaryText, fontSize: 15, fontFamily: fonts.bold },
  orderDisabled: { backgroundColor: colors.surfaceRaised },
  orderTextDisabled: { color: colors.muted },
  history: { marginTop: 24 },
  historyRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyText: { color: colors.text, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  historyStatus: { marginTop: 4, color: colors.muted, fontSize: 13, fontFamily: fonts.body }
});
