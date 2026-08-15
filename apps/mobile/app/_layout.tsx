import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { colors } from "@/theme";
import { AuthProvider } from "@/auth/auth-context";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="bookings" options={{ title: "Мои бронирования", headerBackTitle: "Назад" }} />
          <Stack.Screen name="community" options={{ title: "Игровое сообщество", headerBackTitle: "Назад" }} />
          <Stack.Screen name="chat/[id]" options={{ title: "Чат", headerBackTitle: "Назад" }} />
          <Stack.Screen name="tournaments" options={{ title: "Турниры", headerBackTitle: "Назад" }} />
          <Stack.Screen name="profile" options={{ title: "Профиль", headerBackTitle: "Назад" }} />
          <Stack.Screen name="club/[id]" options={{ title: "Клуб", headerBackTitle: "Назад" }} />
          <Stack.Screen name="booking/[clubId]" options={{ title: "Бронирование", headerBackTitle: "Назад" }} />
          <Stack.Screen name="booking/success" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
