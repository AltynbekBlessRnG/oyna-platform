import { Redirect, Tabs } from "expo-router";
import { CalendarDays, Home, Trophy, UserRound, Users } from "lucide-react-native";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { colors } from "@/theme";

/** Нижняя навигация: на Android высота панели учитывает жестовую полосу. */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { ready, session } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.muted }}>Загружаем Zen…</Text>
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 10 : 6)
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        sceneStyle: { backgroundColor: colors.background }
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Клубы", tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="bookings" options={{ title: "Брони", tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="tournaments" options={{ title: "Турниры", tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} /> }} />
      <Tabs.Screen name="community" options={{ title: "Сообщество", tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
