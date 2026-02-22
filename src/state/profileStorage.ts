import AsyncStorage from '@react-native-async-storage/async-storage';

const USERNAME_KEY = '@bike_chat/username';

export type StoredProfile = {
  username: string;
};

export async function loadProfile(): Promise<StoredProfile> {
  const username = await AsyncStorage.getItem(USERNAME_KEY);
  return { username: username ?? '' };
}

export async function saveProfile(profile: StoredProfile): Promise<void> {
  await AsyncStorage.setItem(USERNAME_KEY, profile.username);
}
