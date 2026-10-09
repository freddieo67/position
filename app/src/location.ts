import * as Location from 'expo-location';
import type { Coords } from './api';

export function toCoords(pos: Location.LocationObject): Coords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy_meters: pos.coords.accuracy ?? null,
  };
}

// Hämtar en färsk position; faller tillbaka på senast kända om GPS:en strular
export async function getCurrentCoords(fallback?: Location.LocationObject | null): Promise<Coords> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return toCoords(pos);
  } catch (error) {
    if (fallback) return toCoords(fallback);
    throw error;
  }
}
