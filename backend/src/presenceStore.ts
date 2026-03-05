import fs from 'fs';
import path from 'path';
import geohash from 'ngeohash';
import type { PresenceUpdate, StoredPresence } from './types';

const TTL_MS = 90_000;
const GEOHASH_PRECISION = 7;

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
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, { data: StoredPresence; expiresAt: number }>;
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
  repository = snapshotPath ? new FileBackedPresenceRepository(snapshotPath) : new InMemoryPresenceRepository();
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

export async function getChannelForRider(riderId: string): Promise<string | null> {
  const me = await repository.get(riderId);
  if (!me || me.rideMode === 'OFF') return null;

  const myCell = geohash.encode(me.lat, me.lon, GEOHASH_PRECISION);
  const nearby = (await repository.listActive()).filter((candidate) => {
    if (!isCompatibleRideMode(me.rideMode, candidate.rideMode)) return false;
    return geohash.encode(candidate.lat, candidate.lon, GEOHASH_PRECISION) === myCell;
  });

  if (nearby.length < 2) return null;
  return `channel-${myCell}`;
}

let pruneInterval: NodeJS.Timeout | null = null;

export function startPruneInterval(): void {
  if (pruneInterval) return;
  pruneInterval = setInterval(() => {
    void repository.pruneExpired();
  }, 30_000);
}
