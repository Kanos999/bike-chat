import { WebSocketServer } from 'ws';

type SignallingMessage =
  | { type: 'join'; channelId: string; riderId: string }
  | { type: 'leave'; channelId: string; riderId: string }
  | { type: 'offer'; channelId: string; from: string; to: string; sdp: unknown }
  | { type: 'answer'; channelId: string; from: string; to: string; sdp: unknown }
  | { type: 'ice'; channelId: string; from: string; to: string; candidate: unknown };

const channelMembers = new Map<string, Set<string>>();

function getMembers(channelId: string): string[] {
  const set = channelMembers.get(channelId);
  return set ? Array.from(set) : [];
}

export function startSignallingServer(server: import('http').Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const channelId = url.searchParams.get('channelId') ?? '';
    const riderId = url.searchParams.get('riderId') ?? '';

    if (!channelId || !riderId) {
      ws.close(4000, 'channelId and riderId required');
      return;
    }

    if (!channelMembers.has(channelId)) channelMembers.set(channelId, new Set());
    channelMembers.get(channelId)!.add(riderId);
    (ws as import('ws').WebSocket & { riderId?: string }).riderId = riderId;

    const members = getMembers(channelId).filter((id) => id !== riderId);

    const send = (msg: object) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    };

    send({ type: 'joined', channelId, members });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as SignallingMessage;
        if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice') {
          broadcastTo(channelId, msg.to, { ...msg });
        }
      } catch {
        // ignore
      }
    });

    ws.on('close', () => {
      channelMembers.get(channelId)?.delete(riderId);
      getMembers(channelId).forEach((id) => {
        broadcastTo(channelId, id, { type: 'left', riderId });
      });
    });
  });

  function broadcastTo(channelId: string, toRiderId: string, payload: object): void {
    wss.clients.forEach((client) => {
      if (client.readyState !== 1) return;
      const r = (client as import('ws').WebSocket & { riderId?: string }).riderId;
      if (r === toRiderId) client.send(JSON.stringify(payload));
    });
  }
}
