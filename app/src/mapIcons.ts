import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n';

export interface MapIconItem {
  id: string;
  emoji: string;
  readonly label: string;
  isPin?: boolean;
}

function mapIcon(id: string, emoji: string, isPin?: boolean): MapIconItem {
  return {
    id,
    emoji,
    isPin,
    get label() {
      return i18n.t(`icon_${id}`);
    },
  };
}

export const MAP_ICONS: MapIconItem[] = [
  mapIcon('pin', 'pin', true),
  mapIcon('pig', '🐷'),
  mapIcon('alien', '👽'),
  mapIcon('clown', '🤡'),
  mapIcon('beer', '🍺'),
  mapIcon('owl', '🦉'),
  mapIcon('frog', '🐸'),
  mapIcon('monkey', '🐵'),
  mapIcon('crab', '🦀'),
  mapIcon('smiley', '🙂'),
  mapIcon('ghost', '👻'),
  mapIcon('skull', '💀'),
  mapIcon('snake', '🐍'),
  mapIcon('whale', '🐳'),
  mapIcon('hammarby', 'hammarby'),
];

export type MapIconEmoji = string;
export const DEFAULT_MAP_ICON: MapIconEmoji = 'pin';

const MAP_ICON_KEY = 'position.user_map_icon';

export async function getSavedMapIcon(): Promise<MapIconEmoji> {
  try {
    const raw = await AsyncStorage.getItem(MAP_ICON_KEY);
    if (raw && MAP_ICONS.some(i => i.emoji === raw || i.id === raw)) {
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
