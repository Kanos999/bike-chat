import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_JOIN_ALERT, isJoinAlert, JoinAlert } from '../modules/notify/joinAlert';

const USERNAME_KEY = '@bike_chat/username';
const ACTIVE_GROUP_KEY = '@bike_chat/activeGroupId';
const JOIN_ALERT_KEY = '@bike_chat/joinAlert';

export type StoredProfile = {
  username: string;
  /** Crew used for FRIENDS_ONLY rides; null = no crew selected. */
  activeGroupId: string | null;
  /** Alert style when a rider joins your channel. */
  joinAlert: JoinAlert;
};

export async function loadProfile(): Promise<StoredProfile> {
  const [username, activeGroupId, joinAlert] = await Promise.all([
    AsyncStorage.getItem(USERNAME_KEY),
    AsyncStorage.getItem(ACTIVE_GROUP_KEY),
    AsyncStorage.getItem(JOIN_ALERT_KEY),
  ]);
  return {
    username: username ?? '',
    activeGroupId: activeGroupId ?? null,
    joinAlert: isJoinAlert(joinAlert) ? joinAlert : DEFAULT_JOIN_ALERT,
  };
}

export async function saveUsername(username: string): Promise<void> {
  await AsyncStorage.setItem(USERNAME_KEY, username);
}

export async function saveActiveGroupId(activeGroupId: string | null): Promise<void> {
  if (activeGroupId) await AsyncStorage.setItem(ACTIVE_GROUP_KEY, activeGroupId);
  else await AsyncStorage.removeItem(ACTIVE_GROUP_KEY);
}

export async function saveJoinAlert(joinAlert: JoinAlert): Promise<void> {
  await AsyncStorage.setItem(JOIN_ALERT_KEY, joinAlert);
}
