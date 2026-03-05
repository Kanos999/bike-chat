import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'http';
import type { PresenceUpdate } from './types';
import {
  configurePresenceStore,
  getChannelForRider,
  upsertPresence,
  startPruneInterval,
} from './presenceStore';
import { startSignallingServer } from './signalling';
import { createAuthContextFromEnv } from './auth';

const app = express();
app.use(cors());
app.use(express.json());

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
  });
  res.status(204).end();
});

app.get('/presence/channel', authMiddleware, async (req, res) => {
  const riderId = req.query.riderId as string;
  if (!riderId) {
    return res.status(400).json({ error: 'Missing riderId query' });
  }
  const channelId = await getChannelForRider(riderId);
  res.json({ channelId });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export async function startApi(): Promise<void> {
  await configurePresenceStore(process.env.PRESENCE_SNAPSHOT_PATH);
  const server = http.createServer(app);
  startSignallingServer(server, auth);
  startPruneInterval();
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`API + WebSocket listening on http://localhost:${PORT}`);
      resolve();
    });
  });
}
