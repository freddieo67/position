export interface DetectedPlace {
  name: string;
  subtitle?: string;
  emoji: string;
  category?: string;
  type?: string;
  lat: number;
  lng: number;
}

const placeCache = new Map<string, DetectedPlace | null>();

function getPlaceEmoji(category?: string, type?: string, name?: string): string {
  const cat = (category || '').toLowerCase();
  const t = (type || '').toLowerCase();
  const n = (name || '').toLowerCase();

  if (t === 'cafe' || t === 'coffee_shop' || n.includes('café') || n.includes('espresso') || n.includes('kaffe')) return '☕';
  if (t === 'restaurant' || t === 'pizzeria' || t === 'bistro' || n.includes('restaurang') || n.includes('pizzeria') || n.includes('krog')) return '🍽️';
  if (t === 'fast_food' || t === 'burger' || n.includes('burger') || n.includes('kebab') || n.includes('max') || n.includes('mcdonald')) return '🍔';
  if (t === 'bar' || t === 'pub' || t === 'biergarten' || n.includes('bar') || n.includes('pub') || n.includes('öl')) return '🍺';
  if (t === 'ice_cream' || n.includes('glass')) return '🍦';
  if (cat === 'shop' || t === 'supermarket' || t === 'convenience' || n.includes('ica') || n.includes('coop')) return '🛒';
  if (t === 'hotel' || t === 'motel' || t === 'hostel') return '🏨';
  if (t === 'cinema' || t === 'theatre') return '🎬';
  if (t === 'park' || t === 'garden') return '🌳';
  if (t === 'gym' || t === 'fitness_centre') return '🏋️';
  if (t === 'bus_stop' || t === 'subway_entrance' || t === 'train_station') return '🚇';
  return '📍';
}

export async function fetchNearbyPlace(lat: number, lng: number): Promise<DetectedPlace | null> {
  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  if (placeCache.has(cacheKey)) {
    return placeCache.get(cacheKey) || null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&namedetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PositionApp/1.0 (contact@positionapp.com)',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      placeCache.set(cacheKey, null);
      return null;
    }

    const data = await res.json();
    if (!data) {
      placeCache.set(cacheKey, null);
      return null;
    }

    // Undvik irrelevanta mikronoder som papperskorgar, bänkar etc.
    const ignoredTypes = new Set(['waste_basket', 'bench', 'traffic_signals', 'street_lamp', 'crossing']);
    if (data.type && ignoredTypes.has(data.type)) {
      data.name = undefined;
    }

    const rawName =
      data.namedetails?.name ||
      data.name ||
      data.address?.amenity ||
      data.address?.shop ||
      data.address?.tourism ||
      data.address?.leisure ||
      data.address?.building;

    const street = [data.address?.road, data.address?.house_number].filter(Boolean).join(' ');
    const locality = data.address?.suburb || data.address?.city || data.address?.town || data.address?.village || '';

    const name = rawName || street || locality;
    if (!name) {
      placeCache.set(cacheKey, null);
      return null;
    }

    const emoji = getPlaceEmoji(data.category, data.type, name);
    const subtitle = rawName && street ? `${street}${locality ? `, ${locality}` : ''}` : locality || street;

    const place: DetectedPlace = {
      name,
      subtitle: subtitle && subtitle !== name ? subtitle : undefined,
      emoji,
      category: data.category,
      type: data.type,
      lat,
      lng,
    };

    placeCache.set(cacheKey, place);
    return place;
  } catch {
    placeCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
