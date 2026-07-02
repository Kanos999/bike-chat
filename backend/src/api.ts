import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'http';
import path from 'path';
import type { PresenceUpdate } from './types';
import {
  configurePresenceStore,
  getChannelSnapshotForRider,
  upsertPresence,
  startPruneInterval,
} from './presenceStore';
import { startSignallingServer } from './signalling';
import { startPresenceSubscribeServer } from './presenceSubscribe';
import { createAuthContextFromEnv } from './auth';
import { createTurnConfigFromEnv } from './turn';
import { createLiveKitConfigFromEnv } from './livekit';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/dev', express.static(path.resolve(__dirname, '../public')));

app.get('/dev', (_req, res) => {
  res.redirect('/dev/harness.html');
});

const logRequests = !['0', 'false', 'no', 'off'].includes(String(process.env.REQUEST_LOGS ?? '').toLowerCase());

const auth = createAuthContextFromEnv();
const turn = createTurnConfigFromEnv();
const livekit = createLiveKitConfigFromEnv();

async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ok = await auth.authorizeHttp(req);
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/readyz', (_req, res) => {
  res.json({
    ok: true,
    snapshot: process.env.PRESENCE_SNAPSHOT_PATH ?? null,
    authMode: auth.mode,
    turn: turn.enabled ? 'enabled' : 'stun-only',
    voice: livekit.enabled ? 'livekit' : 'disabled',
  });
});

// Mint a LiveKit join token for the rider's currently-assigned channel (room).
// Authed so only signed-in riders get media access. Returns 503 until LiveKit is
// configured, so deploying this is safe ahead of the client cut-over.
app.get('/voice-token', authMiddleware, async (req, res) => {
  if (!livekit.enabled) {
    return res.status(503).json({ error: 'Voice not configured' });
  }
  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : '';
  const riderId = typeof req.query.riderId === 'string' ? req.query.riderId : '';
  if (!channelId || !riderId) {
    return res.status(400).json({ error: 'channelId and riderId required' });
  }
  try {
    const result = await livekit.generate(channelId, riderId);
    res.json(result);
  } catch (e) {
    if (logRequests) console.error('[http] /voice-token mint failed', e);
    res.status(500).json({ error: 'Failed to mint voice token' });
  }
});

// Ephemeral ICE server list (STUN always; TURN relay when configured). Authed so
// relay credentials are only handed to signed-in riders. Safe when TURN is not
// configured — clients simply fall back to STUN-only, as before.
app.get('/turn-credentials', authMiddleware, (req, res) => {
  const identifier = typeof req.query.riderId === 'string' ? req.query.riderId : 'bikechat';
  res.json(turn.generate(identifier));
});

app.post('/presence', authMiddleware, async (req, res) => {
  if (logRequests) {
    console.log('[http] POST /presence', {
      riderId: (req.body as any)?.riderId,
      hasAuth: Boolean(req.headers.authorization),
    });
  }
  const body = req.body as Partial<PresenceUpdate>;
  if (!body?.riderId || typeof body.lat !== 'number' || typeof body.lon !== 'number') {
    return res.status(400).json({ error: 'Invalid presence: need riderId, lat, lon' });
  }

  await upsertPresence({
    riderId: body.riderId,
    lat: body.lat,
    lon: body.lon,
    rideMode: body.rideMode ?? 'OPEN',
    timestamp: body.timestamp ?? Date.now(),
    headingDeg: typeof body.headingDeg === 'number' ? body.headingDeg : null,
    speedKph: typeof body.speedKph === 'number' ? body.speedKph : null,
    groupId: typeof body.groupId === 'string' ? body.groupId : null,
    blockedRiderIds: Array.isArray(body.blockedRiderIds)
      ? body.blockedRiderIds.filter((id): id is string => typeof id === 'string')
      : [],
  });
  res.status(204).end();
});

app.get('/presence/channel', authMiddleware, async (req, res) => {
  if (logRequests) {
    console.log('[http] GET /presence/channel', {
      riderId: req.query.riderId,
      hasAuth: Boolean(req.headers.authorization),
    });
  }
  const riderId = req.query.riderId as string;
  if (!riderId) {
    return res.status(400).json({ error: 'Missing riderId query' });
  }
  const snapshot = await getChannelSnapshotForRider(riderId);
  res.json(snapshot);
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

export async function startApi(): Promise<void> {
  await configurePresenceStore(process.env.PRESENCE_SNAPSHOT_PATH);
  const server = http.createServer(app);
  startSignallingServer(server, auth);
  startPresenceSubscribeServer(server, auth, getChannelSnapshotForRider);
  startPruneInterval();
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`API + WebSocket listening on http://localhost:${PORT}`);
      resolve();
    });
  });
}
