import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RideSummary } from './types';

const LAST_RIDE_KEY = '@bike_chat/last_ride_summary';

export async function saveLastSummary(summary: RideSummary): Promise<void> {
  await AsyncStorage.setItem(LAST_RIDE_KEY, JSON.stringify(summary));
}

export async function getLastSummary(): Promise<RideSummary | null> {
  const raw = await AsyncStorage.getItem(LAST_RIDE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RideSummary;
  } catch {
    return null;
  }
}
