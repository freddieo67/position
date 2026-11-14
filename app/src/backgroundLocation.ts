import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { loadUser } from './session';
import { toCoords } from './location';
import i18n from './i18n';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';
const SHARES_KEY = 'position.active_shares';

export interface StoredActiveShare {
  receiverId: number;
  expiresAt: number; // millisekunder sedan epoch
}

export async function getActiveShares(): Promise<StoredActiveShare[]> {
  try {
    const raw = await AsyncStorage.getItem(SHARES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .map((item: any): StoredActiveShare | null => {
        if (typeof item === 'number') {
          // Bakåtkompatibilitet för äldre format utan tidsstämpel
          return { receiverId: item, expiresAt: now + 15 * 60 * 1000 };
        }
        if (item && typeof item.receiverId === 'number' && typeof item.expiresAt === 'number') {
          return item as StoredActiveShare;
        }
        return null;
      })
      .filter((item): item is StoredActiveShare => item !== null && item.expiresAt > now);
  } catch {
    return [];
  }
}

export async function setActiveShares(shares: StoredActiveShare[]): Promise<void> {
  try {
    const now = Date.now();
    const valid = shares.filter(s => s.expiresAt > now);
    await AsyncStorage.setItem(SHARES_KEY, JSON.stringify(valid));
  } catch (e) {
    console.warn('Kunde inte spara aktiva delningar:', e);
  }
}

export async function addActiveShare(receiverId: number, durationMinutes: number = 15): Promise<void> {
  try {
    const current = await getActiveShares();
    const expiresAt = Date.now() + durationMinutes * 60 * 1000;
    const next = current.filter(s => s.receiverId !== receiverId);
    next.push({ receiverId, expiresAt });
    await setActiveShares(next);
    await startBackgroundLocation();
  } catch (e) {
    console.warn('Kunde inte lägga till aktiv delning:', e);
  }
}

export async function removeActiveShare(receiverId: number): Promise<void> {
  try {
    const current = await getActiveShares();
    const next = current.filter(s => s.receiverId !== receiverId);
    await setActiveShares(next);
    if (next.length === 0) {
      await stopBackgroundLocation();
    }
  } catch (e) {
    console.warn('Kunde inte ta bort aktiv delning:', e);
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
    const stored = await getActiveShares();
    const now = Date.now();
    const valid = stored.filter(s => s.expiresAt > now);

    // Rensa ut delningar som har passerat bäst-före medan appen var i bakgrunden
    if (valid.length !== stored.length) {
      await setActiveShares(valid);
    }

    // Om ingen är inloggad eller alla delningar har löpt ut:
    // STÄNG AV BAKGRUNDSTJÄNSTEN OMEDELBART! Den blå pilen släcks på iOS.
    if (!user || valid.length === 0) {
      console.log('[Bakgrund] Inga aktiva delningar kvar, stoppar bakgrundstjänsten automatiskt');
      await stopBackgroundLocation();
      return;
    }

    const latestLocation = locations[locations.length - 1];
    const coords = toCoords(latestLocation);

    // Uppdatera positionen på servern för alla giltiga mottagare med is_background: true
    await Promise.all(
      valid.map(async share => {
        try {
          await api.sharePosition({
            sender_id: user.id,
            receiver_id: share.receiverId,
            is_background: true,
            ...coords,
          });
        } catch (err: any) {
          // Om servern svarar att delningen är utgången (410 EXPIRED eller 404), rensa bort mottagaren
          if (err?.status === 410 || err?.code === 'EXPIRED') {
            await removeActiveShare(share.receiverId);
          }
        }
      })
    );
    console.log(`[Bakgrund] Uppdaterade position för ${valid.length} mottagare`);
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
      accuracy: Location.Accuracy.High,
      timeInterval: 20000, // var 20:e sekund
      distanceInterval: 10, // eller minst 10 meters förflyttning
      foregroundService: {
        notificationTitle: i18n.t('bg_notification_title'),
        notificationBody: i18n.t('bg_notification_body'),
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

export async function syncBackgroundLocation(
  shares: Array<{ receiver_id?: number; receiverId?: number; expires_at?: string; expiresAt?: number } | number>
): Promise<void> {
  const now = Date.now();
  const mapped: StoredActiveShare[] = shares
    .map(s => {
      if (typeof s === 'number') {
        return { receiverId: s, expiresAt: now + 15 * 60 * 1000 };
      }
      const receiverId = s.receiver_id ?? s.receiverId;
      const expiresAt = s.expiresAt ?? (s.expires_at ? new Date(s.expires_at).getTime() : now + 15 * 60 * 1000);
      if (!receiverId) return null;
      return { receiverId, expiresAt };
    })
    .filter((s): s is StoredActiveShare => s !== null && s.expiresAt > now);

  await setActiveShares(mapped);
  if (mapped.length > 0) {
    await startBackgroundLocation();
  } else {
    await stopBackgroundLocation();
  }
}
