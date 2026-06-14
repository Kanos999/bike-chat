import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { Card, Chip, ListRow, Muted, PrimaryButton, SectionLabel, TextField } from '../components/ui';
import { accentFor, FONT } from '../components/bikerTheme';
import type { Friend } from '../modules/groups/supabaseData';
import type { AppNavigation } from '../app/App';
import { useAppStore } from '../state/store';

const accent = accentFor('group');

type Tab = 'Friends' | 'Crews';

export default function GroupsScreen({ navigation }: { navigation: AppNavigation }) {
  const [tab, setTab] = useState<Tab>('Crews');
  const groupsError = useAppStore((s) => s.groupsError);

  return (
    <ScreenScaffold title="Crews" navigation={navigation} activeTab="Groups" accent={accent} rings>
      <View style={styles.segment}>
        {(['Friends', 'Crews'] as Tab[]).map((t) => {
          const on = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.seg,
                { backgroundColor: on ? accent.base : 'transparent', borderColor: on ? accent.base : 'rgba(255,255,255,0.1)' },
              ]}
            >
              <Text style={[styles.segText, { color: on ? '#000' : 'rgba(255,255,255,0.5)' }]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      {groupsError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{groupsError}</Text>
        </Card>
      ) : null}

      {tab === 'Friends' ? <FriendsTab /> : <CrewsTab />}
    </ScreenScaffold>
  );
}

/* ============================ Friends ============================ */

function FriendsTab() {
  const friends = useAppStore((s) => s.friends);
  const friendRequests = useAppStore((s) => s.friendRequests);
  const userSearchResults = useAppStore((s) => s.userSearchResults);
  const loadFriends = useAppStore((s) => s.loadFriends);
  const searchUsers = useAppStore((s) => s.searchUsers);
  const clearUserSearch = useAppStore((s) => s.clearUserSearch);
  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const respondFriendRequest = useAppStore((s) => s.respondFriendRequest);
  const removeFriend = useAppStore((s) => s.removeFriend);

  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const incoming = friendRequests.filter((r) => r.direction === 'incoming');
  const outgoing = friendRequests.filter((r) => r.direction === 'outgoing');
  const knownIds = new Set<string>([
    ...friends.map((f) => f.id),
    ...friendRequests.map((r) => r.id),
  ]);

  const onSearch = (text: string) => {
    setQuery(text);
    if (text.trim()) void searchUsers(text);
    else clearUserSearch();
  };

  const onRemove = (f: Friend) => {
    Alert.alert('Remove friend', `Remove ${f.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeFriend(f.id) },
    ]);
  };

  return (
    <>
      <Card>
        <SectionLabel>Find riders</SectionLabel>
        <TextField
          style={styles.field}
          value={query}
          onChangeText={onSearch}
          placeholder="Search by callsign"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.trim() && userSearchResults.length === 0 ? <Muted>No riders found.</Muted> : null}
        {userSearchResults.map((u) => {
          const known = knownIds.has(u.id);
          return (
            <ListRow
              key={u.id}
              label={u.username}
              accent={accent}
              right={
                known ? (
                  <Text style={styles.mutedTag}>Added</Text>
                ) : (
                  <Pressable onPress={() => void sendFriendRequest(u.username)}>
                    <Text style={[styles.link, { color: accent.base }]}>Add</Text>
                  </Pressable>
                )
              }
            />
          );
        })}
      </Card>

      {incoming.length > 0 ? (
        <Card>
          <SectionLabel>Requests</SectionLabel>
          {incoming.map((r) => (
            <ListRow
              key={r.id}
              label={r.username}
              sub="wants to be friends"
              accent={accent}
              right={
                <View style={styles.rowActions}>
                  <Pressable onPress={() => void respondFriendRequest(r.id, true)}>
                    <Text style={[styles.link, { color: accent.base }]}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => void respondFriendRequest(r.id, false)}>
                    <Text style={[styles.link, styles.danger]}>Decline</Text>
                  </Pressable>
                </View>
              }
            />
          ))}
        </Card>
      ) : null}

      <SectionLabel>Friends</SectionLabel>
      {friends.length === 0 && outgoing.length === 0 ? (
        <Card>
          <Muted>No friends yet. Search for riders above to send a request.</Muted>
        </Card>
      ) : (
        <Card>
          {friends.map((f) => (
            <ListRow
              key={f.id}
              label={f.username}
              accent={accent}
              right={
                <Pressable onPress={() => onRemove(f)}>
                  <Text style={[styles.link, styles.danger]}>Remove</Text>
                </Pressable>
              }
            />
          ))}
          {outgoing.map((r) => (
            <ListRow key={r.id} label={r.username} sub="request sent" accent={accent} right={<Text style={styles.mutedTag}>Pending</Text>} />
          ))}
        </Card>
      )}
    </>
  );
}

/* ============================ Crews ============================ */

function CrewsTab() {
  const session = useAppStore((s) => s.session);
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const membersByGroup = useAppStore((s) => s.membersByGroup);
  const groupsLoading = useAppStore((s) => s.groupsLoading);
  const friends = useAppStore((s) => s.friends);
  const loadMembers = useAppStore((s) => s.loadMembers);
  const joinGroup = useAppStore((s) => s.joinGroup);
  const leaveGroup = useAppStore((s) => s.leaveGroup);
  const deleteGroup = useAppStore((s) => s.deleteGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const createCrewWithFriends = useAppStore((s) => s.createCrewWithFriends);
  const addCrewMember = useAppStore((s) => s.addCrewMember);
  const removeCrewMember = useAppStore((s) => s.removeCrewMember);
  const addBlock = useAppStore((s) => s.addBlock);

  const [newName, setNewName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const group = await createCrewWithFriends(newName.trim(), Array.from(picked));
      if (group) {
        setNewName('');
        setPicked(new Set());
      }
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

  const onLeaveOrDelete = (groupId: string, name: string, owner: boolean) => {
    const verb = owner ? 'Delete' : 'Leave';
    Alert.alert(`${verb} crew`, `${verb} "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: verb,
        style: 'destructive',
        onPress: () => void (owner ? deleteGroup(groupId) : leaveGroup(groupId)),
      },
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
    <>
      <Card>
        <SectionLabel>Start a crew</SectionLabel>
        <Muted>Private channel — only members who set this crew active connect to each other.</Muted>
        <TextField style={styles.field} value={newName} onChangeText={setNewName} placeholder="Crew name" autoCapitalize="words" />
        {friends.length > 0 ? (
          <>
            <Text style={styles.pickLabel}>Add friends</Text>
            <View style={styles.chipWrap}>
              {friends.map((f) => {
                const on = picked.has(f.id);
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => togglePicked(f.id)}
                    style={[
                      styles.pickChip,
                      { borderColor: on ? accent.base : 'rgba(255,255,255,0.12)', backgroundColor: on ? accent.dim : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.pickChipText, { color: on ? accent.base : 'rgba(255,255,255,0.55)' }]}>{f.username}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <Muted>Add friends first to build a crew from them, or just create an empty crew and share its code.</Muted>
        )}
        <PrimaryButton label="Create crew" onPress={onCreate} accent={accent} loading={busy} disabled={!newName.trim()} style={styles.createBtn} />
      </Card>

      <Card>
        <SectionLabel>Join with a code</SectionLabel>
        <View style={styles.joinRow}>
          <TextField
            style={styles.joinField}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            placeholder="6-CHAR CODE"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable onPress={onJoin} disabled={!joinCode.trim()}>
            <Text style={[styles.link, { color: joinCode.trim() ? accent.base : 'rgba(255,255,255,0.3)' }]}>Join</Text>
          </Pressable>
        </View>
      </Card>

      <SectionLabel>Your crews</SectionLabel>
      {groups.length === 0 ? (
        <Card>
          <Muted>{groupsLoading ? 'Loading…' : 'No crews yet. Create one above or join with a code.'}</Muted>
        </Card>
      ) : (
        groups.map((g) => {
          const active = g.id === activeGroupId;
          const owner = !!session && g.owner_id === session.user.id;
          const expanded = expandedId === g.id;
          const members = membersByGroup[g.id] ?? [];
          const memberIds = new Set(members.map((m) => m.member_id));
          const addableFriends = friends.filter((f) => !memberIds.has(f.id));
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
                  <TextField style={styles.renameField} value={renameText} onChangeText={setRenameText} placeholder="New name" autoFocus />
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
                <Pressable onPress={() => onLeaveOrDelete(g.id, g.name, owner)}>
                  <Text style={[styles.link, styles.danger]}>{owner ? 'Delete' : 'Leave'}</Text>
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
                              <View style={styles.rowActions}>
                                {owner ? (
                                  <Pressable onPress={() => void removeCrewMember(g.id, m.member_id)}>
                                    <Text style={styles.link}>Remove</Text>
                                  </Pressable>
                                ) : null}
                                <Pressable onPress={() => onBlock(m.username)}>
                                  <Text style={[styles.link, styles.danger]}>Block</Text>
                                </Pressable>
                              </View>
                            )
                          }
                        />
                      );
                    })
                  )}

                  {owner ? (
                    <>
                      <Pressable onPress={() => setAddingTo(addingTo === g.id ? null : g.id)} style={styles.addFromFriends}>
                        <Text style={[styles.link, { color: accent.base }]}>
                          {addingTo === g.id ? 'Done adding' : 'Add from friends'}
                        </Text>
                      </Pressable>
                      {addingTo === g.id ? (
                        addableFriends.length === 0 ? (
                          <Muted>All your friends are already in this crew.</Muted>
                        ) : (
                          addableFriends.map((f) => (
                            <ListRow
                              key={f.id}
                              label={f.username}
                              accent={accent}
                              right={
                                <Pressable onPress={() => void addCrewMember(g.id, f)}>
                                  <Text style={[styles.link, { color: accent.base }]}>Add</Text>
                                </Pressable>
                              }
                            />
                          ))
                        )
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  segText: { fontFamily: FONT, fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase' },

  field: { marginTop: 12, marginBottom: 14 },
  errorCard: { borderColor: 'rgba(255,107,107,0.4)' },
  errorText: { fontFamily: FONT, fontSize: 12, letterSpacing: 1, color: '#ff6b6b' },

  link: { fontFamily: FONT, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' },
  danger: { color: '#ff6b6b' },
  mutedTag: { fontFamily: FONT, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' },
  rowActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },

  pickLabel: {
    fontFamily: FONT,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 10,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pickChipText: { fontFamily: FONT, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  createBtn: { marginTop: 16 },

  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  joinField: { flex: 1 },

  actions: { flexDirection: 'row', gap: 18, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  members: { marginTop: 6 },
  addFromFriends: { paddingVertical: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  renameField: { flex: 1, marginTop: 0 },
});
