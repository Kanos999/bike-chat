import { WebSocketServer } from 'ws';
import type { NearbyChannelResponse } from './types';
import { setOnGroupsRecomputed } from './presenceStore';

interface AuthContextLike {
  authorizeWsToken: (token: string | null) => Promise<boolean>;
}

interface SubscriberState {
  riderId: string;
  ws: import('ws').WebSocket;
  lastPushed: { channelId: string | null; memberKey: string } | null;
}

const subscribers = new Map<string, Set<SubscriberState>>();

// How often the subscribe layer sweeps all subscribers, asks the matcher for a
// fresh snapshot (which internally throttles its own recompute), and pushes any
// per-rider diff. This is the upper bound on push latency from a presence write.
const SUBSCRIBE_TICK_MS = 500;

const logWs = !['0', 'false', 'no', 'off'].includes(String(process.env.WS_LOGS ?? '').toLowerCase());

function memberKey(snap: NearbyChannelResponse): string {
  return snap.members.map((m) => m.riderId).sort().join(',');
}

function snapshotChanged(prev: SubscriberState['lastPushed'], snap: NearbyChannelResponse): boolean {
  if (!prev) return true;
  if (prev.channelId !== snap.channelId) return true;
  return prev.memberKey !== memberKey(snap);
}

/**
 * Per-rider WebSocket that the server uses to *push* channel-assignment changes,
 * removing the polling round-trip from the join-latency budget. Lives at
 * `/presence/subscribe?riderId=<id>` (auth token via query, like /ws).
 *
 * The server emits `{ type: 'channel', channelId, members }` on connect (initial
 * snapshot) and every time the rider's group changes — channel id changing, or a
 * member arriving/leaving. Membership-only churn (distance-of-existing-members)
 * does not push.
 */
export function startPresenceSubscribeServer(
  server: import('http').Server,
  auth: AuthContextLike,
  getSnapshot: (riderId: string) => Promise<NearbyChannelResponse>
): void {
  // noServer + per-path upgrade router (see signalling.ts for the rationale).
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url ?? '', `http://${req.headers.host}`);
    if (reqUrl.pathname !== '/presence/subscribe') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  const pushIfChanged = async (state: SubscriberState): Promise<void> => {
    if (state.ws.readyState !== 1) return;
    let snap: NearbyChannelResponse;
    try {
      snap = await getSnapshot(state.riderId);
    } catch {
      return;
    }
    if (!snapshotChanged(state.lastPushed, snap)) return;
    state.lastPushed = { channelId: snap.channelId, memberKey: memberKey(snap) };
    if (state.ws.readyState !== 1) return;
    state.ws.send(
      JSON.stringify({ type: 'channel', channelId: snap.channelId, members: snap.members })
    );
  };

  const sweepAllSubscribers = (): void => {
    for (const set of subscribers.values()) {
      for (const state of set) {
        void pushIfChanged(state);
      }
    }
  };

  // Periodic sweep is the primary push driver — pushIfChanged calls getSnapshot,
  // which lazily recomputes the matcher (throttled internally). With nothing
  // subscribed this loop is a no-op except for a couple of nanoseconds per tick.
  setInterval(sweepAllSubscribers, SUBSCRIBE_TICK_MS);

  // Also fan out *immediately* if a recompute happens for some other reason
  // (e.g. a regular REST poller is still in the mix) — saves up to one tick of
  // latency for those subscribers.
  setOnGroupsRecomputed(sweepAllSubscribers);

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const riderId = url.searchParams.get('riderId') ?? '';
    const token = url.searchParams.get('token');

    if (logWs) {
      console.log('[ws] subscribe connection', { riderId, hasToken: Boolean(token) });
    }

    if (!riderId) {
      ws.close(4000, 'riderId required');
      return;
    }

    void (async () => {
      const authorized = await auth.authorizeWsToken(token);
      if (!authorized) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      const state: SubscriberState = { riderId, ws, lastPushed: null };
      let set = subscribers.get(riderId);
      if (!set) {
        set = new Set();
        subscribers.set(riderId, set);
      }
      set.add(state);

      ws.on('close', () => {
        if (logWs) console.log('[ws] subscribe close', { riderId });
        const s = subscribers.get(riderId);
        if (!s) return;
        s.delete(state);
        if (s.size === 0) subscribers.delete(riderId);
      });

      ws.on('error', () => {
        // The 'close' handler will run after this.
      });

      // Initial snapshot: tells the client whether they already have a channel
      // (e.g. after a brief network blip and reconnect) without waiting for a tick.
      await pushIfChanged(state);
    })();
  });
}
