import * as Location from 'expo-location';
import type { Coords } from './api';

export function toCoords(pos: Location.LocationObject): Coords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy_meters: pos.coords.accuracy ?? null,
  };
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
    // 2. Annars begär en positionsuppdatering med High accuracy (full GPS-styrka på iOS/Android)
    const posPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location timeout')), 5000)
    );
    const pos = await Promise.race([posPromise, timeoutPromise]);
    return toCoords(pos);
  } catch (error) {
    if (fallback) return toCoords(fallback);
    const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
    if (lastKnown) return toCoords(lastKnown);
    throw error;
  }
}
