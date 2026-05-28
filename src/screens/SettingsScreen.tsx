import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { AppNavigation } from '../app/App';
import { useAppStore } from '../state/store';

const SettingsScreen = ({ navigation }: { navigation: AppNavigation }) => {
  const username = useAppStore((state) => state.username);
  const ridePreference = useAppStore((state) => state.ridePreference);
  const audioRoute = useAppStore((state) => state.audioRoute);
  const helmetConnected = useAppStore((state) => state.helmetConnected);
  const setUsername = useAppStore((state) => state.setUsername);
  const logout = useAppStore((state) => state.logout);
  const authLoading = useAppStore((state) => state.authLoading);

  const [draftUsername, setDraftUsername] = useState(username);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftUsername(username);
  }, [username]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setUsername(draftUsername.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0b0f13', '#10161d', '#171d24']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.95, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="px-5 pt-7 pb-10">
          <Text className="text-[11px] uppercase tracking-[3px] text-[#f4a261]">Configuration</Text>
          <Text className="mt-2 text-[30px] font-bold leading-[36px] text-white">Rider profile & audio routing</Text>
          <Text className="mt-3 text-sm leading-6 text-[#9fb0bf]">
            Keep your rider identity stable, and let the app prefer your helmet or intercom microphone whenever Android exposes it.
          </Text>

          <View className="mt-6 rounded-[28px] border border-white/10 bg-[#121920] px-4 py-4">
            <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">Identity</Text>
            <Text className="mt-3 text-sm leading-6 text-[#9fb0bf]">
              This handle is used for presence, channel membership, and the rider bubbles shown to peers nearby.
            </Text>
            <TextInput
              className="mt-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-base text-white"
              value={draftUsername}
              onChangeText={setDraftUsername}
              placeholder="Your callsign"
              placeholderTextColor="#607080"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              className={`mt-4 items-center rounded-[22px] bg-[#ff6b35] px-4 py-4 ${saving ? 'opacity-70' : ''}`}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.88}
            >
              <Text className="text-sm font-bold uppercase tracking-[2px] text-black">
                {saving ? 'Saving' : 'Save profile'}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="mt-5 rounded-[28px] border border-white/10 bg-[#121920] px-4 py-4">
            <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">Audio path</Text>
            <View className="mt-4 gap-3">
              <View className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                <Text className="text-xs uppercase tracking-[2px] text-bike-text-muted">Helmet link</Text>
                <Text className={`mt-1 text-base font-semibold ${helmetConnected ? 'text-emerald-300' : 'text-amber-200'}`}>
                  {helmetConnected ? 'Intercom available' : 'No intercom detected'}
                </Text>
              </View>
              <View className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                <Text className="text-xs uppercase tracking-[2px] text-bike-text-muted">Current route</Text>
                <Text className="mt-1 text-base font-semibold text-white">{audioRoute}</Text>
                <Text className="mt-2 text-sm leading-6 text-[#9fb0bf]">
                  During ride mode the app switches Android into communication mode and prefers Bluetooth intercom audio over the phone microphone whenever the device is available.
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-5 rounded-[28px] border border-white/10 bg-[#121920] px-4 py-4">
            <Text className="text-[11px] uppercase tracking-[3px] text-bike-text-muted">Defaults</Text>
            <View className="mt-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
              <Text className="text-xs uppercase tracking-[2px] text-bike-text-muted">Preferred ride mode</Text>
              <Text className="mt-1 text-base font-semibold text-white">
                {ridePreference ?? 'Choose per ride from Home'}
              </Text>
            </View>
          </View>

          <View className="mt-5 flex-row gap-3">
            <TouchableOpacity
              className="flex-1 items-center rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"
              onPress={() => navigation.goBack()}
              activeOpacity={0.88}
            >
              <Text className="text-sm font-semibold text-white">Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 items-center rounded-[22px] border border-red-500/40 bg-red-500/12 px-4 py-4"
              onPress={logout}
              disabled={authLoading}
              activeOpacity={0.88}
            >
              <Text className="text-sm font-semibold text-red-200">
                {authLoading ? 'Signing out...' : 'Sign out'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

export default SettingsScreen;
