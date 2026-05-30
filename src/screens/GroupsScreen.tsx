import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { Card, Chip, GhostButton, ListRow, Muted, PrimaryButton, SectionLabel, TextField } from '../components/ui';
import { accentFor, FONT } from '../components/bikerTheme';
import type { AppNavigation } from '../app/App';
import { useAppStore } from '../state/store';

const accent = accentFor('group');

export default function GroupsScreen({ navigation }: { navigation: AppNavigation }) {
  const session = useAppStore((s) => s.session);
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const membersByGroup = useAppStore((s) => s.membersByGroup);
  const groupsError = useAppStore((s) => s.groupsError);
  const groupsLoading = useAppStore((s) => s.groupsLoading);
  const loadGroups = useAppStore((s) => s.loadGroups);
  const loadMembers = useAppStore((s) => s.loadMembers);
  const createGroup = useAppStore((s) => s.createGroup);
  const joinGroup = useAppStore((s) => s.joinGroup);
  const leaveGroup = useAppStore((s) => s.leaveGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const addBlock = useAppStore((s) => s.addBlock);

  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  const onCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const group = await createGroup(newName.trim());
      if (group) setNewName('');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const group = await joinGroup(joinCode.trim());
      if (group) setJoinCode('');
    } finally {
      setBusy(false);
    }
  };

  const onToggleExpand = (groupId: string) => {
    if (expandedId === groupId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(groupId);
    void loadMembers(groupId);
  };

  const onLeave = (groupId: string, name: string) => {
    Alert.alert('Leave crew', `Leave "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void leaveGroup(groupId) },
    ]);
  };

  const onSaveRename = async (groupId: string) => {
    if (renameText.trim()) await renameGroup(groupId, renameText.trim());
    setRenameId(null);
    setRenameText('');
  };

  const onBlock = (username: string) => {
    Alert.alert('Block rider', `Block ${username}? You will never share a channel.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void addBlock(username) },
    ]);
  };

  return (
    <ScreenScaffold
      title="Crews"
      navigation={navigation}
      activeTab="Groups"
      accent={accent}
      rings
      headerRight={<Chip label={activeGroup ? activeGroup.name : 'No crew'} accent={accent} on={!!activeGroup} />}
    >
      {groupsError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{groupsError}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionLabel>Start a crew</SectionLabel>
        <Muted>Private channel — only members who set this crew active connect to each other.</Muted>
        <TextField
          style={styles.field}
          value={newName}
          onChangeText={setNewName}
          placeholder="Crew name"
          autoCapitalize="words"
        />
        <PrimaryButton label="Create crew" onPress={onCreate} accent={accent} loading={busy} disabled={!newName.trim()} />
      </Card>

      <Card>
        <SectionLabel>Join with a code</SectionLabel>
        <TextField
          style={styles.field}
          value={joinCode}
          onChangeText={(t) => setJoinCode(t.toUpperCase())}
          placeholder="6-CHAR CODE"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <PrimaryButton label="Join crew" onPress={onJoin} accent={accent} loading={busy} disabled={!joinCode.trim()} />
      </Card>

      <SectionLabel>Your crews</SectionLabel>
      {groups.length === 0 ? (
        <Card>
          <Muted>{groupsLoading ? 'Loading…' : 'No crews yet. Create one or join with a code.'}</Muted>
        </Card>
      ) : (
        groups.map((g) => {
          const active = g.id === activeGroupId;
          const owner = !!session && g.owner_id === session.user.id;
          const expanded = expandedId === g.id;
          const members = membersByGroup[g.id] ?? [];
          return (
            <Card key={g.id}>
              <ListRow
                label={g.name}
                sub={`Code ${g.join_code}`}
                highlight={active}
                accent={accent}
                onPress={() => void setActiveGroup(active ? null : g.id)}
                right={<Chip label={active ? 'Active' : 'Set active'} accent={accent} on={active} />}
              />

              {renameId === g.id ? (
                <View style={styles.renameRow}>
                  <TextField
                    style={styles.renameField}
                    value={renameText}
                    onChangeText={setRenameText}
                    placeholder="New name"
                    autoFocus
                  />
                  <Pressable onPress={() => void onSaveRename(g.id)}>
                    <Text style={[styles.link, { color: accent.base }]}>Save</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable onPress={() => onToggleExpand(g.id)}>
                  <Text style={styles.link}>{expanded ? 'Hide riders' : 'Riders'}</Text>
                </Pressable>
                {owner ? (
                  <Pressable
                    onPress={() => {
                      setRenameId(renameId === g.id ? null : g.id);
                      setRenameText(g.name);
                    }}
                  >
                    <Text style={styles.link}>Rename</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => onLeave(g.id, g.name)}>
                  <Text style={[styles.link, styles.danger]}>Leave</Text>
                </Pressable>
              </View>

              {expanded ? (
                <View style={styles.members}>
                  {members.length === 0 ? (
                    <Muted>No riders loaded.</Muted>
                  ) : (
                    members.map((m) => {
                      const isMe = !!session && m.member_id === session.user.id;
                      return (
                        <ListRow
                          key={m.member_id}
                          label={m.username || 'rider'}
                          sub={isMe ? 'You' : undefined}
                          accent={accent}
                          right={
                            isMe ? undefined : (
                              <Pressable onPress={() => onBlock(m.username)}>
                                <Text style={[styles.link, styles.danger]}>Block</Text>
                              </Pressable>
                            )
                          }
                        />
                      );
                    })
                  )}
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 12, marginBottom: 14 },
  errorCard: { borderColor: 'rgba(255,107,107,0.4)' },
  errorText: { fontFamily: FONT, fontSize: 12, letterSpacing: 1, color: '#ff6b6b' },
  actions: { flexDirection: 'row', gap: 18, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  link: { fontFamily: FONT, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' },
  danger: { color: '#ff6b6b' },
  members: { marginTop: 6 },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  renameField: { flex: 1, marginTop: 0 },
});
