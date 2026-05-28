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

const app = express();
app.use(cors());
app.use(express.json());
app.use('/dev', express.static(path.resolve(__dirname, '../public')));

app.get('/dev', (_req, res) => {
  res.redirect('/dev/harness.html');
});

const logRequests = !['0', 'false', 'no', 'off'].includes(String(process.env.REQUEST_LOGS ?? '').toLowerCase());

const auth = createAuthContextFromEnv();

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
  });
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
