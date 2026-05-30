import { StateCreator } from 'zustand';
import {
  blockUser,
  createGroup as createGroupRequest,
  deleteGroup as deleteGroupRequest,
  fetchBlocks,
  fetchMembers,
  fetchMyGroups,
  Group,
  GroupMember,
  joinGroupByCode,
  leaveGroup as leaveGroupRequest,
  renameGroup as renameGroupRequest,
  unblockUser,
  upsertProfile,
} from '../modules/groups/supabaseData';
import { DEFAULT_JOIN_ALERT, JoinAlert, playJoinAlert } from '../modules/notify/joinAlert';
import { services } from '../modules/services';
import { saveActiveGroupId, saveJoinAlert, StoredProfile } from './profileStorage';
import type { AuthSlice } from './authSlice';

export interface GroupsSlice {
  groups: Group[];
  activeGroupId: string | null;
  membersByGroup: Record<string, GroupMember[]>;
  blockedUsernames: string[];
  joinAlert: JoinAlert;
  groupsLoading: boolean;
  groupsError: string | null;
  hydrateGroupPrefs: (profile: StoredProfile) => void;
  loadGroups: () => Promise<void>;
  loadMembers: (groupId: string) => Promise<void>;
  createGroup: (name: string) => Promise<Group | null>;
  joinGroup: (code: string) => Promise<Group | null>;
  leaveGroup: (groupId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  setActiveGroup: (groupId: string | null) => Promise<void>;
  addBlock: (username: string) => Promise<void>;
  removeBlock: (username: string) => Promise<void>;
  setJoinAlert: (kind: JoinAlert) => Promise<void>;
  syncProfile: (username: string) => Promise<void>;
  notifyJoin: () => void;
}

type Store = GroupsSlice & AuthSlice;

export const createGroupsSlice: StateCreator<
  Store,
  [['zustand/devtools', never]],
  [],
  GroupsSlice
> = (set, get) => ({
  groups: [],
  activeGroupId: null,
  membersByGroup: {},
  blockedUsernames: [],
  joinAlert: DEFAULT_JOIN_ALERT,
  groupsLoading: false,
  groupsError: null,

  hydrateGroupPrefs: (profile) =>
    set({ activeGroupId: profile.activeGroupId, joinAlert: profile.joinAlert }),

  loadGroups: async () => {
    set({ groupsLoading: true, groupsError: null });
    try {
      const [groups, blocks] = await Promise.all([fetchMyGroups(), fetchBlocks()]);
      const blockedUsernames = blocks.map((b) => b.blocked_username);
      // Drop the active crew if we're no longer a member of it.
      const active = get().activeGroupId;
      const stillMember = active != null && groups.some((g) => g.id === active);
      set({
        groups,
        blockedUsernames,
        groupsLoading: false,
        activeGroupId: stillMember ? active : null,
      });
      if (active != null && !stillMember) await saveActiveGroupId(null);
    } catch (e) {
      set({ groupsLoading: false, groupsError: e instanceof Error ? e.message : 'Failed to load crews' });
    }
  },

  loadMembers: async (groupId) => {
    try {
      const members = await fetchMembers(groupId);
      set((s) => ({ membersByGroup: { ...s.membersByGroup, [groupId]: members } }));
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to load members' });
    }
  },

  createGroup: async (name) => {
    set({ groupsError: null });
    try {
      const group = await createGroupRequest(name);
      set((s) => ({ groups: [...s.groups, group] }));
      await get().setActiveGroup(group.id);
      return group;
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to create crew' });
      return null;
    }
  },

  joinGroup: async (code) => {
    set({ groupsError: null });
    try {
      const group = await joinGroupByCode(code);
      await get().loadGroups();
      await get().setActiveGroup(group.id);
      return group;
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to join crew' });
      return null;
    }
  },

  leaveGroup: async (groupId) => {
    try {
      await leaveGroupRequest(groupId);
      set((s) => {
        const { [groupId]: _removed, ...rest } = s.membersByGroup;
        return {
          groups: s.groups.filter((g) => g.id !== groupId),
          membersByGroup: rest,
          activeGroupId: s.activeGroupId === groupId ? null : s.activeGroupId,
        };
      });
      if (get().activeGroupId === null) await saveActiveGroupId(null);
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to leave crew' });
    }
  },

  renameGroup: async (groupId, name) => {
    try {
      await renameGroupRequest(groupId, name);
      set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) }));
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to rename crew' });
    }
  },

  deleteGroup: async (groupId) => {
    try {
      await deleteGroupRequest(groupId);
      set((s) => ({
        groups: s.groups.filter((g) => g.id !== groupId),
        activeGroupId: s.activeGroupId === groupId ? null : s.activeGroupId,
      }));
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to delete crew' });
    }
  },

  setActiveGroup: async (groupId) => {
    set({ activeGroupId: groupId });
    await saveActiveGroupId(groupId);
  },

  addBlock: async (username) => {
    const name = username.trim();
    if (!name) return;
    try {
      await blockUser(name);
      set((s) => (s.blockedUsernames.includes(name) ? s : { blockedUsernames: [...s.blockedUsernames, name] }));
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to block rider' });
    }
  },

  removeBlock: async (username) => {
    try {
      await unblockUser(username);
      set((s) => ({ blockedUsernames: s.blockedUsernames.filter((u) => u !== username) }));
    } catch (e) {
      set({ groupsError: e instanceof Error ? e.message : 'Failed to unblock rider' });
    }
  },

  setJoinAlert: async (kind) => {
    set({ joinAlert: kind });
    await saveJoinAlert(kind);
  },

  syncProfile: async (username) => {
    const session = get().session;
    if (!session) return;
    try {
      await upsertProfile(session.user.id, username, session.user.phone ?? null);
    } catch (e) {
      // Non-fatal: the local username still works for the matcher.
      set({ groupsError: e instanceof Error ? e.message : 'Failed to sync profile' });
    }
  },

  notifyJoin: () => {
    const kind = get().joinAlert;
    if (kind === 'off') return;
    // In-helmet tone on the call stream (rides the SCO link to the intercom), with
    // a vibration companion that also covers platforms without the native tone.
    services.bluetooth.playJoinTone?.(kind);
    playJoinAlert(kind);
  },
});
