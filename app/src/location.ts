import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Coords } from './api';

const LAST_KNOWN_LOCATION_KEY = '@position_last_known_location';

export function toCoords(pos: Location.LocationObject): Coords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy_meters: pos.coords.accuracy ?? null,
  };
}

// Timeout helper som aldrig lämnar ett löfte hängande för evigt
export function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue?: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve, reject) =>
      setTimeout(
        () => (fallbackValue !== undefined ? resolve(fallbackValue) : reject(new Error('Timeout'))),
        ms
      )
    ),
  ]);
}

export async function getSavedLocation(): Promise<Location.LocationObject | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveLocationCache(loc: Location.LocationObject): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify(loc));
  } catch {}
}

// Hämtar en färsk position med hög precision; använder cachad position om den är under 30 sekunder gammal och har god noggrannhet
export async function getCurrentCoords(fallback?: Location.LocationObject | null): Promise<Coords> {
  // 1. Om vi redan har en färsk position i appen med god precision (< 25m) under 30 sekunder gammal, använd den direkt
  if (
    fallback &&
    typeof fallback.timestamp === 'number' &&
    Date.now() - fallback.timestamp < 30_000 &&
    (fallback.coords.accuracy == null || fallback.coords.accuracy <= 25)
  ) {
    return toCoords(fallback);
  }

  try {
    // 2. Annars begär en positionsuppdatering med High accuracy med strikt timeout
    const posPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const pos = await withTimeout(posPromise, 4500);
    return toCoords(pos);
  } catch (error) {
    if (fallback) return toCoords(fallback);
    try {
      const lastKnown = await withTimeout(Location.getLastKnownPositionAsync(), 2000, null);
      if (lastKnown) return toCoords(lastKnown);
    } catch (_) {}
    const saved = await getSavedLocation();
    if (saved) return toCoords(saved);
    throw error;
  }
}
