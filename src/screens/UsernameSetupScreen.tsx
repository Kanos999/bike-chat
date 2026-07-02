import React, { useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Muted, PrimaryButton, SectionLabel, TextField } from '../components/ui';
import { accentFor, COLORS, FONT } from '../components/bikerTheme';
import { useAppStore } from '../state/store';

const accent = accentFor('open');

/**
 * One-time gate shown when a rider is authenticated but has no callsign yet.
 * riderId is derived from the callsign, so without one startRide silently blocks
 * ("missingRiderId"). Forcing the callsign here makes the requirement explicit
 * instead of leaving the Start Ride button apparently inert.
 */
export default function UsernameSetupScreen() {
  const setUsername = useAppStore((s) => s.setUsername);
  const syncProfile = useAppStore((s) => s.syncProfile);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && !saving;

  const onContinue = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await setUsername(trimmed);
      await syncProfile(trimmed);
      // Once username is set, App's gate falls through to the main screen.
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.brand}>BIKE CHAT</Text>
          <Card>
            <SectionLabel>Choose your callsign</SectionLabel>
            <Muted>
              This is how nearby riders, crews, and blocks find you. You can change it later in
              Settings.
            </Muted>
            <TextField
              style={styles.field}
              value={draft}
              onChangeText={setDraft}
              placeholder="Your callsign"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onContinue}
            />
            <PrimaryButton
              label={saving ? 'Saving' : 'Continue'}
              onPress={onContinue}
              disabled={!canSave}
              loading={saving}
              accent={accent}
            />
          </Card>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: {
    color: '#fff',
    fontFamily: FONT,
    fontSize: 22,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 24,
  },
  field: { marginTop: 14, marginBottom: 16 },
});
