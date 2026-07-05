import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenScaffold from '../components/ScreenScaffold';
import { Card, GhostButton, ListRow, Muted, PrimaryButton, SectionLabel, TextField } from '../components/ui';
import { accentFor, FONT } from '../components/bikerTheme';
import { validateCallsign } from '../modules/callsign';
import {
  checkAllPermissions,
  PERM_LABELS,
  PermKey,
  PermState,
  requestPermission,
} from '../modules/permissions';
import { JOIN_ALERTS, playJoinAlert } from '../modules/notify/joinAlert';
import { services } from '../modules/services';
import type { AppNavigation } from '../app/App';
import { useAppStore } from '../state/store';

const accent = accentFor('open');
const APP_VERSION = '0.1.0';

export default function SettingsScreen({ navigation }: { navigation: AppNavigation }) {
  const username = useAppStore((s) => s.username);
  const session = useAppStore((s) => s.session);
  const audioRoute = useAppStore((s) => s.audioRoute);
  const helmetConnected = useAppStore((s) => s.helmetConnected);
  const authLoading = useAppStore((s) => s.authLoading);
  const joinAlert = useAppStore((s) => s.joinAlert);
  const blockedUsernames = useAppStore((s) => s.blockedUsernames);
  const setUsername = useAppStore((s) => s.setUsername);
  const syncProfile = useAppStore((s) => s.syncProfile);
  const setJoinAlert = useAppStore((s) => s.setJoinAlert);
  const addBlock = useAppStore((s) => s.addBlock);
  const removeBlock = useAppStore((s) => s.removeBlock);
  const logout = useAppStore((s) => s.logout);

  const [draftUsername, setDraftUsername] = useState(username);
  const [saving, setSaving] = useState(false);
  const [callsignError, setCallsignError] = useState<string | null>(null);
  const [newBlock, setNewBlock] = useState('');

  useEffect(() => {
    setDraftUsername(username);
  }, [username]);

  const dirty = draftUsername.trim() !== username.trim() && draftUsername.trim().length > 0;

  const onSave = async () => {
    const name = draftUsername.trim();
    const invalid = validateCallsign(name);
    if (invalid) {
      setCallsignError(invalid);
      return;
    }
    setSaving(true);
    setCallsignError(null);
    try {
      // Server-first so a taken callsign is caught before the local one changes.
      const result = await syncProfile(name);
      if (result.error) {
        setCallsignError(result.error);
        return;
      }
      await setUsername(name);
    } finally {
      setSaving(false);
    }
  };

  const onAddBlock = async () => {
    if (!newBlock.trim()) return;
    await addBlock(newBlock.trim());
    setNewBlock('');
  };

  return (
    <ScreenScaffold title="Profile" navigation={navigation} activeTab="Profile" accent={accent}>
      <Card>
        <SectionLabel>Identity</SectionLabel>
        <Muted>Your callsign is shown to nearby riders and is how crews and blocks find you.</Muted>
        <TextField
          style={styles.field}
          value={draftUsername}
          onChangeText={(t) => {
            setDraftUsername(t);
            if (callsignError) setCallsignError(null);
          }}
          placeholder="Your callsign"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {callsignError ? <Text style={styles.callsignError}>{callsignError}</Text> : null}
        <PrimaryButton
          label={saving ? 'Saving' : 'Save callsign'}
          onPress={onSave}
          accent={accent}
          loading={saving}
          disabled={!dirty}
        />
      </Card>

      <Card>
        <SectionLabel>Account</SectionLabel>
        <ListRow label="Phone" right={<Text style={styles.value}>{session?.user.phone || '—'}</Text>} />
        <View style={styles.divider} />
        <GhostButton label={authLoading ? 'Signing out…' : 'Sign out'} onPress={logout} disabled={authLoading} danger />
      </Card>

      <Card>
        <SectionLabel>Rider-join alert</SectionLabel>
        <Muted>Buzz when a rider joins your channel mid-ride.</Muted>
        <View style={styles.segment}>
          {JOIN_ALERTS.map((opt) => {
            const on = opt.id === joinAlert;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  void setJoinAlert(opt.id);
                  playJoinAlert(opt.id);
                }}
                style={[
                  styles.seg,
                  { backgroundColor: on ? accent.base : 'transparent', borderColor: on ? accent.base : 'rgba(255,255,255,0.1)' },
                ]}
              >
                <Text style={[styles.segText, { color: on ? '#000' : 'rgba(255,255,255,0.62)' }]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {__DEV__ ? (
          <Pressable
            onPress={() => {
              // Play the in-helmet tone on the call stream the same way a real
              // join does — but with no peer needed, to verify SCO routing.
              const kind = joinAlert === 'off' ? 'short' : joinAlert;
              services.bluetooth.playJoinTone?.(kind);
              playJoinAlert(kind);
            }}
            style={styles.testTone}
          >
            <Text style={[styles.testToneText, { color: accent.base }]}>Test tone</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Blocked riders</SectionLabel>
        <Muted>You never share a channel with a blocked rider, in any mode.</Muted>
        <View style={styles.addRow}>
          <TextField
            style={styles.addField}
            value={newBlock}
            onChangeText={setNewBlock}
            placeholder="Callsign to block"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={onAddBlock} style={styles.addBtn}>
            <Text style={[styles.link, { color: accent.base }]}>Block</Text>
          </Pressable>
        </View>
        {blockedUsernames.length === 0 ? (
          <Muted>No blocked riders.</Muted>
        ) : (
          blockedUsernames.map((u) => (
            <ListRow
              key={u}
              label={u}
              right={
                <Pressable onPress={() => void removeBlock(u)}>
                  <Text style={[styles.link, { color: 'rgba(255,255,255,0.67)' }]}>Unblock</Text>
                </Pressable>
              }
            />
          ))
        )}
      </Card>

      <Card>
        <SectionLabel>Audio path</SectionLabel>
        <ListRow
          label="Helmet link"
          right={<Text style={[styles.value, { color: helmetConnected ? accent.base : 'rgba(255,255,255,0.62)' }]}>{helmetConnected ? 'Connected' : 'Phone audio'}</Text>}
        />
        <View style={styles.divider} />
        <ListRow label="Current route" right={<Text style={styles.value}>{audioRoute}</Text>} />
      </Card>

      <PermissionsCard />

      <Card>
        <SectionLabel>About</SectionLabel>
        <ListRow label="Version" right={<Text style={styles.value}>{APP_VERSION}</Text>} />
      </Card>
    </ScreenScaffold>
  );
}

/** Live status of the runtime permissions a ride needs, with tap-to-grant. */
function PermissionsCard() {
  const [status, setStatus] = useState<Record<PermKey, PermState> | null>(null);
  const refresh = useCallback(() => {
    void checkAllPermissions().then(setStatus);
  }, []);
  // Re-check on focus so returning from the system settings screen updates the row.
  useFocusEffect(refresh);

  if (Platform.OS !== 'android') return null;
  const keys: PermKey[] = ['location', 'microphone', 'notifications'];
  const onGrant = async (k: PermKey) => {
    await requestPermission(k);
    refresh();
  };

  return (
    <Card>
      <SectionLabel>Permissions</SectionLabel>
      <Muted>Live rides need these. Tap Grant if one is missing.</Muted>
      {keys.map((k, i) => {
        const granted = status?.[k] === 'granted';
        return (
          <View key={k}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <ListRow
              label={PERM_LABELS[k]}
              right={
                granted ? (
                  <Text style={[styles.value, { color: accent.base }]}>Granted</Text>
                ) : (
                  <Pressable onPress={() => void onGrant(k)}>
                    <Text style={[styles.link, { color: accent.base }]}>Grant</Text>
                  </Pressable>
                )
              }
            />
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 12, marginBottom: 14 },
  callsignError: { fontFamily: FONT, fontSize: 12, letterSpacing: 0.6, color: '#ff6b6b', marginTop: -4, marginBottom: 12 },
  value: { fontFamily: FONT, fontSize: 14, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  segment: { flexDirection: 'row', gap: 8, marginTop: 14 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  segText: { fontFamily: FONT, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  testTone: { marginTop: 14, alignSelf: 'flex-start', paddingVertical: 6 },
  testToneText: { fontFamily: FONT, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 6 },
  addField: { flex: 1, marginTop: 0 },
  addBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  link: { fontFamily: FONT, fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase' },
});
