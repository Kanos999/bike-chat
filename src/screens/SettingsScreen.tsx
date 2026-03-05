import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { AppNavigation } from '../app/App';
import { useAppStore } from '../state/store';

const SettingsScreen = ({ navigation }: { navigation: AppNavigation }) => {
  const {
    username,
    ridePreference,
    setUsername,
    logout,
    authLoading,
  } = useAppStore((state) => ({
    username: state.username,
    ridePreference: state.ridePreference,
    setUsername: state.setUsername,
    logout: state.logout,
    authLoading: state.authLoading,
  }));

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
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View className="flex-grow pb-8 bg-bike-bg">
      <View className="px-6">
        <Text className="text-[26px] font-bold text-bike-text mb-6 tracking-wide">Settings</Text>

        <View className="mb-4 py-3 px-4 bg-bike-card rounded-lg border border-bike-border-orange">
          <Text className="text-sm font-semibold text-bike-orange-muted mb-1 tracking-widest">Username</Text>
          <Text className="text-xs text-bike-text-dim mb-2 tracking-wide">
            Your display name and rider ID. Shown to nearby riders and used for
            presence and voice—no phone numbers are ever shared.
          </Text>
          <TextInput
            className="text-base text-bike-text py-2.5 px-3 bg-bike-bg rounded-md border border-bike-border tracking-wide"
            value={draftUsername}
            onChangeText={setDraftUsername}
            placeholder="Your username"
            placeholderTextColor="#6b5344"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          className={`self-start py-3 px-6 bg-bike-orange-muted rounded-lg mb-6 ${saving ? 'opacity-70' : ''}`}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text className="text-base font-bold text-bike-text tracking-wide">
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>

        <View className="mb-4 py-3 px-4 bg-bike-card rounded-lg border border-bike-border-orange">
          <Text className="text-sm font-semibold text-bike-orange-muted mb-2 tracking-widest">Default ride preference</Text>
          <Text className="text-base text-bike-text tracking-wide">
            {ridePreference ?? 'Not set (choose on Home)'}
          </Text>
        </View>

        <Text className="text-sm text-bike-text-dim mt-2 mb-2 tracking-wide">
          Native settings such as Bluetooth, permissions, and headset bindings
          will live here in a future build.
        </Text>


        <View className="mt-4 pt-4 border-t border-bike-border-orange">
          <TouchableOpacity
            className="py-3 px-6 bg-bike-card rounded-lg border border-red-500 items-center"
            onPress={logout}
            disabled={authLoading}
            activeOpacity={0.85}
          >
            <Text className="text-base font-bold text-red-400 tracking-wide">
              {authLoading ? 'Signing out…' : 'Sign out'}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-6 pt-4 border-t border-bike-border-orange">
          <TouchableOpacity
            className="py-3.5 px-6 bg-bike-card rounded-lg border-2 border-bike-orange-muted items-center"
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Text className="text-base font-bold text-bike-text tracking-wide">Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
      </View>
    </ScrollView>
  );
};

export default SettingsScreen;
