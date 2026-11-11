import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppContact } from './components/ContactsModal';

export interface ContactUsageEntry {
  count: number;
  lastUsedAt: number;
}

export type ContactUsageMap = Record<number, ContactUsageEntry>;

const cacheKey = (userId: number) => `position.cached_contacts_v1.${userId}`;
const favKey = (userId: number) => `position.favorite_contacts_v1.${userId}`;
const usageKey = (userId: number) => `position.contact_usage_v1.${userId}`;

/**
 * Hämtar senast cachade app-kontakter för snabb visning vid öppning.
 */
export async function getCachedContacts(userId: number): Promise<AppContact[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCachedContacts(userId: number, contacts: AppContact[]): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(contacts));
  } catch {}
}

export async function getFavoriteIds(userId: number): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(favKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export async function toggleFavoriteId(userId: number, targetUserId: number): Promise<number[]> {
  const current = await getFavoriteIds(userId);
  const next = current.includes(targetUserId)
    ? current.filter(id => id !== targetUserId)
    : [...current, targetUserId];
  try {
    await AsyncStorage.setItem(favKey(userId), JSON.stringify(next));
  } catch {}
  return next;
}

export async function getContactUsage(userId: number): Promise<ContactUsageMap> {
  try {
    const raw = await AsyncStorage.getItem(usageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Registrerar att användaren skickat position, Phing, Flash-mess eller begäran till kontakter.
 */
export async function recordContactUsage(userId: number, targetUserIds: number[]): Promise<void> {
  if (!userId || targetUserIds.length === 0) return;
  try {
    const current = await getContactUsage(userId);
    const now = Date.now();
    for (const targetId of targetUserIds) {
      const prev = current[targetId];
      current[targetId] = {
        count: (prev?.count ?? 0) + 1,
        lastUsedAt: now,
      };
    }
    await AsyncStorage.setItem(usageKey(userId), JSON.stringify(current));
  } catch {}
}

/**
 * Returnerar stjärnmärkta favoriter samt topp N mest använda / senaste kontakter.
 */
export function getQuickContacts(
  contacts: AppContact[],
  favoriteIds: number[],
  usageMap: ContactUsageMap,
  maxRecent: number = 8
): { favorites: AppContact[]; recent: AppContact[] } {
  const favSet = new Set(favoriteIds);
  const favorites = contacts
    .filter(c => favSet.has(c.userId))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const recent = contacts
    .filter(c => !favSet.has(c.userId) && (usageMap[c.userId]?.count ?? 0) > 0)
    .sort((a, b) => {
      const ua = usageMap[a.userId];
      const ub = usageMap[b.userId];
      const daysA = Math.max(0, (now - ua.lastUsedAt) / DAY_MS);
      const daysB = Math.max(0, (now - ub.lastUsedAt) / DAY_MS);
      const scoreA = ua.count + Math.max(0, 7 - daysA);
      const scoreB = ub.count + Math.max(0, 7 - daysB);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return ub.lastUsedAt - ua.lastUsedAt;
    })
    .slice(0, maxRecent);

  return { favorites, recent };
}

