import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from './api';

// Sparar vem som är inloggad på den här telefonen
const KEY = 'position.user';

export async function loadUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export async function saveUser(user: User): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(user));
}

export async function clearUser(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
