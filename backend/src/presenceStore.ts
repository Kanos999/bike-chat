import fs from 'fs';
import path from 'path';
import geohash from 'ngeohash';
import type { PresenceUpdate, StoredPresence } from './types';

const TTL_MS = 90_000;
const GEOHASH_PRECISION = 7;
const PROXIMITY_RADIUS_METERS = 150;

interface PresenceRepository {
  upsert(update: PresenceUpdate): Promise<void>;
  get(riderId: string): Promise<StoredPresence | null>;
  listActive(): Promise<StoredPresence[]>;
  pruneExpired(): Promise<void>;
}

class InMemoryPresenceRepository implements PresenceRepository {
  protected readonly store = new Map<string, { data: StoredPresence; expiresAt: number }>();

  async upsert(update: PresenceUpdate): Promise<void> {
    this.store.set(update.riderId, { data: { ...update }, expiresAt: Date.now() + TTL_MS });
  }

  async get(riderId: string): Promise<StoredPresence | null> {
    const entry = this.store.get(riderId);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(riderId);
      return null;
    }
    return entry.data;
  }

  async listActive(): Promise<StoredPresence[]> {
    const now = Date.now();
    const active: StoredPresence[] = [];
    for (const [riderId, entry] of this.store) {
      if (entry.expiresAt < now) {
        this.store.delete(riderId);
        continue;
      }
      active.push(entry.data);
    }
    return active;
  }

  async pruneExpired(): Promise<void> {
    const now = Date.now();
    for (const [riderId, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(riderId);
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
        { data: StoredPresence; expiresAt: number }
      >;
      for (const [k, v] of Object.entries(parsed)) {
        if (v.expiresAt > Date.now()) this.store.set(k, v);
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

let repository: PresenceRepository = new InMemoryPresenceRepository();

export async function configurePresenceStore(snapshotPath?: string): Promise<void> {
  repository = snapshotPath
    ? new FileBackedPresenceRepository(snapshotPath)
    : new InMemoryPresenceRepository();
}

export async function upsertPresence(update: PresenceUpdate): Promise<void> {
  await repository.upsert(update);
}

function isCompatibleRideMode(
  riderMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY',
  peerMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY'
): boolean {
  if (riderMode === 'OFF' || peerMode === 'OFF') return false;
  if (riderMode === 'FRIENDS_ONLY') return peerMode === 'FRIENDS_ONLY';
  return true;
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

function buildComponentFromRider(
  me: StoredPresence,
  everyone: StoredPresence[]
): StoredPresence[] {
  const byId = new Map(everyone.map((p) => [p.riderId, p]));
  const queue = [me.riderId];
  const seen = new Set<string>();
  const component: StoredPresence[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const current = byId.get(id);
    if (!current) continue;

    if (!isCompatibleRideMode(me.rideMode, current.rideMode)) continue;

    component.push(current);

    for (const candidate of everyone) {
      if (seen.has(candidate.riderId)) continue;
      if (!isCompatibleRideMode(me.rideMode, candidate.rideMode)) continue;
      if (distanceMeters(current, candidate) <= PROXIMITY_RADIUS_METERS) {
        queue.push(candidate.riderId);
      }
    }
  }

  return component;
}

function stableChannelIdForComponent(component: StoredPresence[]): string {
  const centroid = component.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }),
    { lat: 0, lon: 0 }
  );
  const count = component.length;
  const centerLat = centroid.lat / count;
  const centerLon = centroid.lon / count;
  const cell = geohash.encode(centerLat, centerLon, GEOHASH_PRECISION);
  return `channel-${cell}`;
}

export async function getChannelForRider(riderId: string): Promise<string | null> {
  const me = await repository.get(riderId);
  if (!me || me.rideMode === 'OFF') return null;

  const active = await repository.listActive();
  const component = buildComponentFromRider(me, active);

  if (component.length < 2) return null;
  return stableChannelIdForComponent(component);
}

let pruneInterval: NodeJS.Timeout | null = null;

export function startPruneInterval(): void {
  if (pruneInterval) return;
  pruneInterval = setInterval(() => {
    void repository.pruneExpired();
  }, 30_000);
}
