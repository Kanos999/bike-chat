import cors from 'cors';
import express from 'express';
import http from 'http';
import type { PresenceUpdate } from './types';
import { getChannelForRider, upsertPresence, startPruneInterval } from './presenceStore';
import { startSignallingServer } from './signalling';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/presence', (req, res) => {
  console.log('presence', req.body);
  const body = req.body as PresenceUpdate;
  if (!body?.riderId || typeof body.lat !== 'number' || typeof body.lon !== 'number') {
    return res.status(400).json({ error: 'Invalid presence: need riderId, lat, lon' });
  }
  upsertPresence({
    riderId: body.riderId,
    lat: body.lat,
    lon: body.lon,
    rideMode: body.rideMode ?? 'OPEN',
    timestamp: body.timestamp ?? Date.now(),
  });
  res.status(204).end();
});

app.get('/presence/channel', (req, res) => {
  console.log('get channel', req.query);
  const riderId = req.query.riderId as string;
  if (!riderId) {
    return res.status(400).json({ error: 'Missing riderId query' });
  }
  const channelId = getChannelForRider(riderId);
  res.json({ channelId });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export function startApi(): Promise<void> {
  const server = http.createServer(app);
  startSignallingServer(server);
  startPruneInterval();
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`API + WebSocket listening on http://localhost:${PORT}`);
      resolve();
    });
  });
}
