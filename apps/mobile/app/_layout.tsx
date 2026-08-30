import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { AuthProvider } from "@/auth/auth-context";

/** Общие настройки переходов: плавное выезжание справа вместо рывка по умолчанию. */
const screenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: "800" as const },
  contentStyle: { backgroundColor: colors.background },
  animation: "slide_from_right" as const,
  animationDuration: 260,
  gestureEnabled: true
};

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" />
            <Stack screenOptions={screenOptions}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "fade" }} />
              <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false, animation: "fade" }} />
              <Stack.Screen name="notifications" options={{ title: "Уведомления", headerBackTitle: "Назад" }} />
              <Stack.Screen name="chat/[id]" options={{ title: "Чат", headerBackTitle: "Назад" }} />
              <Stack.Screen name="club/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="booking/[clubId]" options={{ title: "Бронирование", headerBackTitle: "Назад" }} />
              <Stack.Screen name="booking/success" options={{ headerShown: false, gestureEnabled: false, animation: "fade_from_bottom" }} />
            </Stack>
          </AuthProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
