import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MapIconItem {
  id: string;
  emoji: string;
  label: string;
}

export const MAP_ICONS: MapIconItem[] = [
  { id: 'pig', emoji: '🐷', label: 'Gris' },
  { id: 'alien', emoji: '👽', label: 'Alien' },
  { id: 'clown', emoji: '🤡', label: 'Clown' },
  { id: 'beer', emoji: '🍺', label: 'Öl' },
  { id: 'owl', emoji: '🦉', label: 'Uggla' },
];

export type MapIconEmoji = typeof MAP_ICONS[number]['emoji'];
export const DEFAULT_MAP_ICON: MapIconEmoji = '🐷';

const MAP_ICON_KEY = 'position.user_map_icon';

export async function getSavedMapIcon(): Promise<MapIconEmoji> {
  try {
    const raw = await AsyncStorage.getItem(MAP_ICON_KEY);
    if (raw && MAP_ICONS.some(i => i.emoji === raw)) {
      return raw as MapIconEmoji;
    }
  } catch (e) {
    console.warn('Kunde inte läsa sparad kartikon:', e);
  }
  return DEFAULT_MAP_ICON;
}

export async function saveMapIcon(emoji: MapIconEmoji): Promise<void> {
  try {
    await AsyncStorage.setItem(MAP_ICON_KEY, emoji);
  } catch (e) {
    console.warn('Kunde inte spara kartikon:', e);
  }
}
