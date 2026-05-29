import fs from 'fs';
import path from 'path';
import geohash from 'ngeohash';
import type { ChannelMemberSummary, NearbyChannelResponse, PresenceUpdate, StoredPresence } from './types';

const TTL_MS = 90_000;

// Hysteresis: riders pair when they come within JOIN, and stay paired until they
// drift past the larger LEAVE radius. This prevents flapping at the boundary.
const JOIN_RADIUS_METERS = 150;
const LEAVE_RADIUS_METERS = 300;

// Spatial index precision. A geohash-6 cell is ~0.6km x ~1.2km, so the 3x3
// neighbourhood comfortably covers the LEAVE radius in every direction (the old
// precision-7 cells were too small to see retained links out to 300m).
const PROXIMITY_INDEX_PRECISION = 6;
// Precision used only to make a freshly-minted channel id human-readable.
const CHANNEL_ID_GEOHASH_PRECISION = 7;

const MIN_GROUP_SIZE = 2;

// At road speeds, the matcher additionally requires both riders to be heading in
// broadly the same direction before a *new* link forms — this is what stops a
// median-separated highway, a crossroads, or a petrol-station encounter from
// pairing you with oncoming/perpendicular traffic. The gate only applies when
// both riders are clearly moving (GPS heading is unreliable below this).
const MOVING_SPEED_THRESHOLD_KPH = 10;
const HEADING_MAX_DIFF_DEG = 60;

// Group membership is recomputed lazily, at most once per this interval, and the
// result is shared by every rider's poll within the window — so a dense cluster
// is solved once per tick rather than once per (rider x poll).
const DEFAULT_RECOMPUTE_INTERVAL_MS = 500;

interface StoredPresenceEntry {
  data: StoredPresence;
  expiresAt: number;
  cellKey: string;
}

interface PresenceRepository {
  upsert(update: PresenceUpdate): Promise<void>;
  get(riderId: string): Promise<StoredPresence | null>;
  listActive(): Promise<StoredPresence[]>;
  listNearby(reference: StoredPresence): Promise<StoredPresence[]>;
  pruneExpired(): Promise<void>;
}

class InMemoryPresenceRepository implements PresenceRepository {
  protected readonly store = new Map<string, StoredPresenceEntry>();
  private readonly ridersByCell = new Map<string, Set<string>>();

  private getCellKeyForPresence(presence: StoredPresence): string {
    return geohash.encode(presence.lat, presence.lon, PROXIMITY_INDEX_PRECISION);
  }

  private getNearbyCellKeys(presence: StoredPresence): string[] {
    const center = this.getCellKeyForPresence(presence);
    return [center, ...geohash.neighbors(center)];
  }

  private addToCell(cellKey: string, riderId: string): void {
    if (!this.ridersByCell.has(cellKey)) this.ridersByCell.set(cellKey, new Set());
    this.ridersByCell.get(cellKey)!.add(riderId);
  }

  private removeFromCell(cellKey: string, riderId: string): void {
    const cell = this.ridersByCell.get(cellKey);
    if (!cell) return;
    cell.delete(riderId);
    if (cell.size === 0) this.ridersByCell.delete(cellKey);
  }

  protected restoreEntry(riderId: string, entry: Omit<StoredPresenceEntry, 'cellKey'> & { cellKey?: string }): void {
    const cellKey = entry.cellKey ?? this.getCellKeyForPresence(entry.data);
    this.store.set(riderId, { data: entry.data, expiresAt: entry.expiresAt, cellKey });
    this.addToCell(cellKey, riderId);
  }

  protected deleteEntry(riderId: string): void {
    const entry = this.store.get(riderId);
    if (!entry) return;
    this.store.delete(riderId);
    this.removeFromCell(entry.cellKey, riderId);
  }

  private getActiveEntry(riderId: string): StoredPresenceEntry | null {
    const entry = this.store.get(riderId);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.deleteEntry(riderId);
      return null;
    }
    return entry;
  }

  async upsert(update: PresenceUpdate): Promise<void> {
    if (update.rideMode === 'OFF') {
      this.deleteEntry(update.riderId);
      return;
    }

    const data = { ...update };
    const cellKey = this.getCellKeyForPresence(data);
    const existing = this.store.get(update.riderId);
    if (existing && existing.cellKey !== cellKey) {
      this.removeFromCell(existing.cellKey, update.riderId);
    }

    this.store.set(update.riderId, {
      data,
      expiresAt: Date.now() + TTL_MS,
      cellKey,
    });
    this.addToCell(cellKey, update.riderId);
  }

  async get(riderId: string): Promise<StoredPresence | null> {
    return this.getActiveEntry(riderId)?.data ?? null;
  }

  async listActive(): Promise<StoredPresence[]> {
    const active: StoredPresence[] = [];
    for (const riderId of this.store.keys()) {
      const entry = this.getActiveEntry(riderId);
      if (!entry) continue;
      active.push(entry.data);
    }
    return active;
  }

  async listNearby(reference: StoredPresence): Promise<StoredPresence[]> {
    const nearby = new Map<string, StoredPresence>();

    for (const cellKey of this.getNearbyCellKeys(reference)) {
      const riders = this.ridersByCell.get(cellKey);
      if (!riders) continue;

      for (const riderId of riders) {
        const entry = this.getActiveEntry(riderId);
        if (!entry) continue;
        nearby.set(riderId, entry.data);
      }
    }

    return Array.from(nearby.values());
  }

  async pruneExpired(): Promise<void> {
    for (const riderId of this.store.keys()) {
      this.getActiveEntry(riderId);
    }
  }
}

class FileBackedPresenceRepository extends InMemoryPresenceRepository {
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly filePath: string) {
    super();
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<
        string,
        { data: StoredPresence; expiresAt: number; cellKey?: string }
      >;
      for (const [k, v] of Object.entries(parsed)) {
        if (v.expiresAt > Date.now()) this.restoreEntry(k, v);
      }
    } catch {
      // ignore malformed snapshot
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 500);
  }

  private flush(): void {
    const obj = Object.fromEntries(this.store.entries());
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(obj));
  }

  async upsert(update: PresenceUpdate): Promise<void> {
    await super.upsert(update);
    this.scheduleFlush();
  }

  async pruneExpired(): Promise<void> {
    await super.pruneExpired();
    this.scheduleFlush();
  }
}

/* ----------------------------------------------------------------------------
 * Stateful group matcher
 *
 * Membership persists across ticks in `groups` / `riderGroup`. Each recompute
 * uses the *previous* tick's membership to decide:
 *   - hysteresis: an existing pair is kept while within LEAVE; new pairs need JOIN
 *   - sticky ids: a group keeps its id as it moves and absorbs the oldest id on a
 *     merge, so a moving crew stays on one channel for the whole ride
 * -------------------------------------------------------------------------- */

interface GroupState {
  members: Set<string>;
  createdAt: number;
}

let repository: PresenceRepository = new InMemoryPresenceRepository();

let groups = new Map<string, GroupState>();
let riderGroup = new Map<string, string>();
let channelSeq = 0;
let lastComputedAt = 0;
let recomputeIntervalMs = DEFAULT_RECOMPUTE_INTERVAL_MS;
let recomputeInFlight: Promise<void> | null = null;
// Bumped on every presence change. ensureGroupsFresh compares this against the
// version captured at the *start* of the last recompute — so writes that arrive
// during a recompute force a follow-up pass instead of being absorbed into the
// stale snapshot.
let mutationVersion = 0;
let lastComputedVersion = -1;

// Fired after each recompute so the push subscribers know to re-evaluate. Single
// callback (overwrites) — sufficient for this app's transport layer.
let onGroupsRecomputed: () => void = () => {};

export function setOnGroupsRecomputed(cb: () => void): void {
  onGroupsRecomputed = cb;
}

export interface PresenceStoreOptions {
  /** Max age of a cached group computation before the next read recomputes. 0 = always. */
  recomputeIntervalMs?: number;
}

export async function configurePresenceStore(
  snapshotPath?: string,
  options?: PresenceStoreOptions
): Promise<void> {
  repository = snapshotPath
    ? new FileBackedPresenceRepository(snapshotPath)
    : new InMemoryPresenceRepository();
  groups = new Map();
  riderGroup = new Map();
  channelSeq = 0;
  lastComputedAt = 0;
  recomputeInFlight = null;
  mutationVersion = 0;
  lastComputedVersion = -1; // forces the first read to recompute
  recomputeIntervalMs = options?.recomputeIntervalMs ?? DEFAULT_RECOMPUTE_INTERVAL_MS;
}

export async function upsertPresence(update: PresenceUpdate): Promise<void> {
  await repository.upsert(update);
  // Bump the version so the next read knows the cache is stale. We deliberately
  // *don't* trigger a recompute here: writes arrive one rider at a time, and
  // recomputing between sequential writes makes the matcher see incoherent
  // half-moved-group states (which breaks sticky-id reuse and produces spurious
  // splits/merges). The subscribe layer drives recomputes on a fixed cadence
  // instead, which naturally coalesces bursts.
  mutationVersion += 1;
}

function isActiveMode(mode: PresenceUpdate['rideMode']): mode is 'OPEN' | 'FRIENDS_ONLY' {
  return mode === 'OPEN' || mode === 'FRIENDS_ONLY';
}

// Symmetric compatibility: a link only exists when both riders are in the same
// mode. OPEN talks to OPEN, FRIENDS_ONLY only to FRIENDS_ONLY — so a private crew
// is never pulled into an open rider's channel (this also removes the old
// one-sided "phantom channel" the asymmetric rule produced).
function canLink(a: StoredPresence, b: StoredPresence): boolean {
  return isActiveMode(a.rideMode) && a.rideMode === b.rideMode;
}

function distanceMeters(a: StoredPresence, b: StoredPresence): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Heading gate applies only when both riders are actually moving and both have a
// reported heading; otherwise it's a no-op (a stationary rider has no meaningful
// direction, and an absent heading from the client shouldn't be punished).
function headingsAlignedForNewLink(a: StoredPresence, b: StoredPresence): boolean {
  const bothMoving =
    (a.speedKph ?? 0) >= MOVING_SPEED_THRESHOLD_KPH &&
    (b.speedKph ?? 0) >= MOVING_SPEED_THRESHOLD_KPH;
  if (!bothMoving) return true;
  if (a.headingDeg == null || b.headingDeg == null) return true;
  return bearingDiff(a.headingDeg, b.headingDeg) <= HEADING_MAX_DIFF_DEG;
}

// Hysteresis edge test, evaluated against the previous tick's membership.
function isLinked(a: StoredPresence, b: StoredPresence, prevRiderGroup: Map<string, string>): boolean {
  const d = distanceMeters(a, b);
  if (d <= JOIN_RADIUS_METERS) {
    // Form a new link only if directions agree (no-op when stationary / unknown).
    return headingsAlignedForNewLink(a, b);
  }
  if (d <= LEAVE_RADIUS_METERS) {
    // Retain an existing link out to the leave radius, regardless of heading —
    // brief direction divergence (overtake, exit, weaving) shouldn't drop audio.
    const ga = prevRiderGroup.get(a.riderId);
    const gb = prevRiderGroup.get(b.riderId);
    return ga !== undefined && ga === gb;
  }
  return false;
}

function mintChannelId(memberIds: string[], byId: Map<string, StoredPresence>): string {
  let lat = 0;
  let lon = 0;
  for (const id of memberIds) {
    const p = byId.get(id)!;
    lat += p.lat;
    lon += p.lon;
  }
  const cell = geohash.encode(lat / memberIds.length, lon / memberIds.length, CHANNEL_ID_GEOHASH_PRECISION);
  channelSeq += 1;
  return `channel-${cell}-${channelSeq.toString(36)}`;
}

async function recomputeGroups(): Promise<void> {
  const active = await repository.listActive();
  const byId = new Map(active.map((p) => [p.riderId, p]));
  const prevRiderGroup = riderGroup;
  const prevGroups = groups;

  // Union-Find over active riders.
  const parent = new Map<string, string>();
  for (const p of active) parent.set(p.riderId, p.riderId);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Build edges from the spatial index (candidates already limited to nearby cells).
  for (const a of active) {
    const candidates = await repository.listNearby(a);
    for (const b of candidates) {
      if (b.riderId <= a.riderId) continue; // each pair once, skip self
      if (!canLink(a, b)) continue;
      if (isLinked(a, b, prevRiderGroup)) union(a.riderId, b.riderId);
    }
  }

  // Collect connected components.
  const components = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = components.get(root);
    if (list) list.push(id);
    else components.set(root, [id]);
  }

  // Assign sticky channel ids. Process deterministically (by smallest member id)
  // so that when a group splits, the same sub-component keeps the original id.
  const minId = (c: string[]) => c.reduce((m, x) => (x < m ? x : m), c[0]);
  const realComponents = [...components.values()]
    .filter((c) => c.length >= MIN_GROUP_SIZE)
    .sort((x, y) => minId(x).localeCompare(minId(y)));

  const newGroups = new Map<string, GroupState>();
  const newRiderGroup = new Map<string, string>();
  const usedIds = new Set<string>();

  for (const comp of realComponents) {
    // Existing ids carried by this component's members, oldest first (merges keep
    // the senior id), skipping any id already claimed by an earlier component.
    const candidateIds = new Set<string>();
    for (const rid of comp) {
      const g = prevRiderGroup.get(rid);
      if (g && prevGroups.has(g)) candidateIds.add(g);
    }
    const ranked = [...candidateIds].sort((a, b) => {
      const ca = prevGroups.get(a)!.createdAt;
      const cb = prevGroups.get(b)!.createdAt;
      return ca - cb || a.localeCompare(b);
    });

    let survivingId = ranked.find((id) => !usedIds.has(id));
    let createdAt: number;
    if (survivingId) {
      createdAt = prevGroups.get(survivingId)!.createdAt;
    } else {
      survivingId = mintChannelId(comp, byId);
      createdAt = Date.now();
    }

    usedIds.add(survivingId);
    newGroups.set(survivingId, { members: new Set(comp), createdAt });
    for (const rid of comp) newRiderGroup.set(rid, survivingId);
  }

  groups = newGroups;
  riderGroup = newRiderGroup;
  lastComputedAt = Date.now();

  // Notify the push layer after each recompute. Wrapped so a buggy subscriber
  // can never break the matcher.
  try {
    onGroupsRecomputed();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[presenceStore] onGroupsRecomputed handler threw', e);
  }
}

async function ensureGroupsFresh(): Promise<void> {
  // Serve the cached groups when nothing has changed *and* the cache is recent.
  if (
    mutationVersion === lastComputedVersion &&
    lastComputedAt !== 0 &&
    Date.now() - lastComputedAt < recomputeIntervalMs
  ) {
    return;
  }

  // A recompute is already running — wait for it. But because writes may have
  // landed *after* it started, we may need to kick another pass once it's done.
  if (recomputeInFlight) {
    await recomputeInFlight;
    if (mutationVersion !== lastComputedVersion) await ensureGroupsFresh();
    return;
  }

  // Capture the version *at the start* of the recompute. If a write arrives
  // mid-compute, `mutationVersion` will move ahead and the next ensure call
  // will trigger another pass instead of being absorbed by the time-throttle.
  const versionAtStart = mutationVersion;
  recomputeInFlight = recomputeGroups()
    .then(() => {
      lastComputedVersion = versionAtStart;
    })
    .finally(() => {
      recomputeInFlight = null;
    });
  await recomputeInFlight;
}

export async function getChannelForRider(riderId: string): Promise<string | null> {
  return (await getChannelSnapshotForRider(riderId)).channelId;
}

export async function getChannelSnapshotForRider(riderId: string): Promise<NearbyChannelResponse> {
  const me = await repository.get(riderId);
  if (!me || me.rideMode === 'OFF') return { channelId: null, members: [] };

  await ensureGroupsFresh();

  const channelId = riderGroup.get(riderId);
  const group = channelId ? groups.get(channelId) : undefined;
  if (!channelId || !group || group.members.size < MIN_GROUP_SIZE) {
    return { channelId: null, members: [] };
  }

  const members: ChannelMemberSummary[] = [];
  for (const memberId of group.members) {
    if (memberId === riderId) continue;
    const p = await repository.get(memberId);
    if (!p) continue;
    members.push({
      riderId: memberId,
      rideMode: p.rideMode === 'OPEN' ? 'OPEN' : 'FRIENDS_ONLY',
      lat: p.lat,
      lon: p.lon,
      distanceMeters: Math.round(distanceMeters(me, p)),
    });
  }
  members.sort((a, b) => a.distanceMeters - b.distanceMeters || a.riderId.localeCompare(b.riderId));

  // A member may have just expired; only surface a channel if peers remain.
  if (members.length === 0) return { channelId: null, members: [] };
  return { channelId, members };
}

let pruneInterval: NodeJS.Timeout | null = null;

export function startPruneInterval(): void {
  if (pruneInterval) return;
  pruneInterval = setInterval(async () => {
    await repository.pruneExpired();
    // Expired riders leaving may break a group — bump the version so the next
    // subscriber tick (or next read) picks up the change.
    mutationVersion += 1;
  }, 30_000);
}
