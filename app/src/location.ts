import * as Location from 'expo-location';
import type { Coords } from './api';

export function toCoords(pos: Location.LocationObject): Coords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy_meters: pos.coords.accuracy ?? null,
  };
}

// Hämtar en färsk position med snabb respons; använder cachad position om den är under 60 sekunder gammal
export async function getCurrentCoords(fallback?: Location.LocationObject | null): Promise<Coords> {
  // 1. Om vi redan har en färsk position i appen, använd den direkt för omedelbar respons
  if (fallback && typeof fallback.timestamp === 'number' && Date.now() - fallback.timestamp < 60_000) {
    return toCoords(fallback);
  }

  try {
    // 2. Annars begär en snabb positionsuppdatering med Balanced accuracy och 3.5s timeout
    const posPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location timeout')), 3500)
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
