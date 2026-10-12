import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsType from 'expo-notifications';

// Expo Go (SDK 53+) kraschar redan vid import av expo-notifications, så modulen laddas
// bara i en development/produktionsbygge. I Expo Go returneras null och push hoppas över.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let cached: typeof NotificationsType | null | undefined;

export function getNotifications(): typeof NotificationsType | null {
  if (cached !== undefined) return cached;
  if (isExpoGo || Platform.OS === 'web') {
    cached = null;
    return cached;
  }
  try {
    const Notifications = require('expo-notifications') as typeof NotificationsType;
    // Visa aviseringar även när appen är öppen
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Registrera åtgärdsknapp "Pinga tillbaka" på notiser
    Notifications.setNotificationCategoryAsync('ping_category', [
      {
        identifier: 'reply_ping',
        buttonTitle: 'Pinga tillbaka',
        options: {
          opensAppToForeground: true,
        },
      },
    ]).catch(err => console.warn('Kunde inte sätta notification category:', err));

    cached = Notifications;
  } catch (error) {
    console.warn('Kunde inte ladda expo-notifications:', error);
    cached = null;
  }
  return cached;
}

// Ber om tillstånd och returnerar enhetens Expo push-token, eller null om det inte går
// (t.ex. emulator, nekat tillstånd eller Expo Go utan stöd för fjärr-push).
export async function registerForPushToken(): Promise<string | null> {
  const Notifications = getNotifications();
  if (!Notifications) return null;

  try {
    if (!Device.isDevice) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Standard',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('Saknar EAS projectId (kör "eas init"), hoppar över push-token');
      return null;
    }

    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    console.warn('Kunde inte hämta push-token:', error);
    return null;
  }
}
