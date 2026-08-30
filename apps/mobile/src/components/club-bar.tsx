import type { MenuCategory, MenuItem } from "@oyna/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createClubOrder, getClubMenu, getClubOrders } from "@/lib/api";
import { colors } from "@/theme";

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
            <View key={item.id} style={styles.item}>
              <View style={styles.itemBody}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.description ? <Text style={styles.itemDescription}>{item.description}</Text> : null}
              </View>
              <Text style={styles.itemPrice}>{item.price} ₸</Text>
              <View style={styles.stepper}>
                <Pressable accessibilityLabel={`Убрать ${item.name}`} onPress={() => change(item.id, -1)} style={styles.stepperButton} hitSlop={4}>
                  <Minus color={colors.text} size={15} />
                </Pressable>
                <Text style={styles.quantity}>{cart[item.id] ?? 0}</Text>
                <Pressable accessibilityLabel={`Добавить ${item.name}`} onPress={() => change(item.id, 1)} style={styles.stepperButton} hitSlop={4}>
                  <Plus color={colors.text} size={15} />
                </Pressable>
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
            style={[styles.orderButton, (!seat.trim() || order.isPending) && styles.disabled]}
          >
            <ShoppingBag color={colors.primaryText} size={17} />
            <Text style={styles.orderText}>{order.isPending ? "Отправляем…" : `Заказать · ${total.toLocaleString("ru-KZ")} ₸`}</Text>
          </Pressable>
        </View>
      ) : null}

      {orders.length ? (
        <View style={styles.history}>
          <Text style={styles.categoryTitle}>Мои заказы</Text>
          {orders.slice(0, 5).map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <Text style={styles.historyText}>
                Место {item.seatLabel} · {item.lines.map((line) => `${line.name} ×${line.quantity}`).join(", ")}
              </Text>
              <Text style={styles.historyStatus}>{ORDER_STATUS[item.status] ?? item.status} · {item.total.toLocaleString("ru-KZ")} ₸</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  category: { marginBottom: 18 },
  categoryTitle: { marginBottom: 10, color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  item: { marginBottom: 9, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  itemBody: { flex: 1 },
  itemName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  itemDescription: { marginTop: 3, color: colors.muted, fontSize: 11 },
  itemPrice: { color: colors.text, fontSize: 13, fontWeight: "800" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepperButton: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  quantity: { minWidth: 14, textAlign: "center", color: colors.text, fontSize: 13, fontWeight: "800" },
  checkout: { marginTop: 4, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  checkoutLabel: { marginBottom: 8, color: colors.muted, fontSize: 11, fontWeight: "700" },
  seatInput: { height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 15 },
  error: { marginTop: 10, color: colors.danger, fontSize: 12, lineHeight: 18 },
  orderButton: { marginTop: 13, height: 52, borderRadius: 15, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  orderText: { color: colors.primaryText, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  history: { marginTop: 22 },
  historyRow: { marginBottom: 9, padding: 13, borderRadius: 14, backgroundColor: colors.surface },
  historyText: { color: colors.text, fontSize: 12 },
  historyStatus: { marginTop: 5, color: colors.muted, fontSize: 11 }
});
