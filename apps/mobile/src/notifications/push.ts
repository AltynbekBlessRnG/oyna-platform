import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushDevice } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

/**
 * Регистрирует устройство для push-уведомлений о решении клуба по брони.
 *
 * Токен выдаётся только на реальном устройстве в dev/production-сборке: в Expo Go
 * начиная с SDK 53 push недоступны, поэтому любая неудача здесь тихо игнорируется —
 * уведомления всё равно видны в центре уведомлений внутри приложения.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Бронирования",
        importance: Notifications.AndroidImportance.DEFAULT
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const status = existing.granted ? existing.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await registerPushDevice(token, Platform.OS);
  } catch (error) {
    console.info("[push] устройство не зарегистрировано:", error instanceof Error ? error.message : error);
  }
}
