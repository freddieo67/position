import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { loadUser } from './session';
import { toCoords } from './location';
import i18n from './i18n';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';
const SHARES_KEY = 'position.active_shares';

export async function getActiveShares(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(SHARES_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export async function setActiveShares(receiverIds: number[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SHARES_KEY, JSON.stringify(receiverIds));
  } catch (e) {
    console.warn('Kunde inte spara aktiva delningar:', e);
  }
}

// Bakgrundstask som anropas av operativsystemet när nya koordinater registreras
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Bakgrundsplatsfel:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations?: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  try {
    const user = await loadUser();
    const receiverIds = await getActiveShares();

    // Om ingen är inloggad eller ingen delning är aktiv, stäng av bakgrundstjänsten
    if (!user || !receiverIds || receiverIds.length === 0) {
      await stopBackgroundLocation();
      return;
    }

    const latestLocation = locations[locations.length - 1];
    const coords = toCoords(latestLocation);

    // Uppdatera positionen på servern för alla aktiva mottagare
    await Promise.all(
      receiverIds.map(receiverId =>
        api.sharePosition({
          sender_id: user.id,
          receiver_id: receiverId,
          ...coords,
        })
      )
    );
    console.log(`[Bakgrund] Uppdaterade position för ${receiverIds.length} mottagare`);
  } catch (err) {
    console.warn('[Bakgrund] Kunde inte skicka position:', err);
  }
});

export async function isBackgroundLocationRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function startBackgroundLocation(): Promise<void> {
  try {
    const running = await isBackgroundLocationRunning();
    if (running) return;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000, // var 30:e sekund
      distanceInterval: 10, // eller minst 10 meters förflyttning
      foregroundService: {
        notificationTitle: i18n.t('bg_notification_title') || 'Position delar din plats',
        notificationBody: i18n.t('bg_notification_body') || 'Din plats uppdateras live för dina kontakter.',
        notificationColor: '#3B82F6',
        killServiceOnDestroy: true,
      },
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
    });
    console.log('Bakgrundsplatstjänst med Foreground Service startad');
  } catch (e) {
    console.warn('Kunde inte starta bakgrundsplatstjänst:', e);
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  try {
    const running = await isBackgroundLocationRunning();
    if (running) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('Bakgrundsplatstjänst stoppad');
    }
  } catch (e) {
    console.warn('Kunde inte stoppa bakgrundsplatstjänst:', e);
  }
}

export async function syncBackgroundLocation(activeReceiverIds: number[]): Promise<void> {
  await setActiveShares(activeReceiverIds);
  if (activeReceiverIds && activeReceiverIds.length > 0) {
    await startBackgroundLocation();
  } else {
    await stopBackgroundLocation();
  }
}
