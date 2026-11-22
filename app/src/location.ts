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

// Beräknar avstånd i meter mellan två GPS-koordinater med Haversine-formeln
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Filtrerar bort GPS-svaj, mast-hopp och stillastående darr
export function shouldAcceptLocationUpdate(
  current: Location.LocationObject | null,
  newLoc: Location.LocationObject
): boolean {
  if (!current) return true;

  const newAcc = newLoc.coords.accuracy ?? 999;
  const currentAcc = current.coords.accuracy ?? 999;
  const ageSec = (newLoc.timestamp - current.timestamp) / 1000;

  // 1. Förkasta uppdateringar med dålig precision (> 45m) om vi har en färsk och hyfsad GPS-fix (<= 45m under senaste 60s)
  if (ageSec < 60 && newAcc > 45 && currentAcc <= 45) {
    return false;
  }

  const dist = getDistanceMeters(
    current.coords.latitude,
    current.coords.longitude,
    newLoc.coords.latitude,
    newLoc.coords.longitude
  );

  // 2. DÖDBAND: Om förflyttningen är under 8 meter och användaren står stilla eller rör sig mycket långsamt (< 1.0 m/s),
  // ignorera uppdateringen så att markören står helt still och inte hoppar omkring p.g.a. satellitbrus
  const speed = newLoc.coords.speed;
  const isNearlyStill = speed === null || speed === undefined || speed < 1.0;
  if (dist < 8 && isNearlyStill) {
    return false;
  }

  // 3. Orimliga hopp (GPS-multipath spikar över 100m på under 3s utan hög hastighet)
  if (ageSec > 0 && ageSec < 3 && dist > 100 && (speed == null || speed < 15)) {
    return false;
  }

  return true;
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
