import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { Card, GhostButton, ListRow, Muted, PrimaryButton, SectionLabel, TextField } from '../components/ui';
import { accentFor, FONT } from '../components/bikerTheme';
import { JOIN_ALERTS, playJoinAlert } from '../modules/notify/joinAlert';
import type { AppNavigation } from '../app/App';
import { useAppStore } from '../state/store';

const accent = accentFor('open');

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
  const [newBlock, setNewBlock] = useState('');

  useEffect(() => {
    setDraftUsername(username);
  }, [username]);

  const dirty = draftUsername.trim() !== username.trim() && draftUsername.trim().length > 0;

  const onSave = async () => {
    setSaving(true);
    try {
      const name = draftUsername.trim();
      await setUsername(name);
      await syncProfile(name);
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
          onChangeText={setDraftUsername}
          placeholder="Your callsign"
          autoCapitalize="none"
          autoCorrect={false}
        />
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
                <Text style={[styles.segText, { color: on ? '#000' : 'rgba(255,255,255,0.5)' }]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
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
                  <Text style={[styles.link, { color: 'rgba(255,255,255,0.55)' }]}>Unblock</Text>
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
          right={<Text style={[styles.value, { color: helmetConnected ? accent.base : 'rgba(255,255,255,0.5)' }]}>{helmetConnected ? 'Connected' : 'Phone audio'}</Text>}
        />
        <View style={styles.divider} />
        <ListRow label="Current route" right={<Text style={styles.value}>{audioRoute}</Text>} />
      </Card>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 12, marginBottom: 14 },
  value: { fontFamily: FONT, fontSize: 14, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  segment: { flexDirection: 'row', gap: 8, marginTop: 14 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  segText: { fontFamily: FONT, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 6 },
  addField: { flex: 1, marginTop: 0 },
  addBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  link: { fontFamily: FONT, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' },
});
