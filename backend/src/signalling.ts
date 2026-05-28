import { WebSocketServer } from 'ws';

interface AuthContextLike {
  authorizeWsToken: (token: string | null) => Promise<boolean>;
}

type SignallingMessage =
  | { type: 'join'; channelId: string; riderId: string }
  | { type: 'leave'; channelId: string; riderId: string }
  | { type: 'offer'; channelId: string; from: string; to: string; sdp: unknown }
  | { type: 'answer'; channelId: string; from: string; to: string; sdp: unknown }
  | { type: 'ice'; channelId: string; from: string; to: string; candidate: unknown };

const channelMembers = new Map<string, Set<string>>();
const riderSockets = new Map<string, Set<import('ws').WebSocket>>();

const logWs = !['0', 'false', 'no', 'off'].includes(String(process.env.WS_LOGS ?? '').toLowerCase());

function getMembers(channelId: string): string[] {
  const set = channelMembers.get(channelId);
  return set ? Array.from(set) : [];
}

function addSocketForRider(riderId: string, ws: import('ws').WebSocket): void {
  if (!riderSockets.has(riderId)) riderSockets.set(riderId, new Set());
  riderSockets.get(riderId)!.add(ws);
}

function removeSocketForRider(riderId: string, ws: import('ws').WebSocket): void {
  const sockets = riderSockets.get(riderId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) riderSockets.delete(riderId);
}

export function startSignallingServer(server: import('http').Server, auth: AuthContextLike): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const channelId = url.searchParams.get('channelId') ?? '';
    const riderId = url.searchParams.get('riderId') ?? '';
    const token = url.searchParams.get('token');

    if (logWs) {
      console.log('[ws] connection', {
        channelId,
        riderId,
        hasToken: Boolean(token),
      });
    }

    if (!channelId || !riderId) {
      ws.close(4000, 'channelId and riderId required');
      return;
    }

    void (async () => {
      const authorized = await auth.authorizeWsToken(token);
      if (!authorized) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      if (!channelMembers.has(channelId)) channelMembers.set(channelId, new Set());
      channelMembers.get(channelId)!.add(riderId);
      (ws as import('ws').WebSocket & { riderId?: string }).riderId = riderId;
      addSocketForRider(riderId, ws);

      const members = getMembers(channelId).filter((id) => id !== riderId);

      const send = (msg: object) => {
        if (ws.readyState === 1) ws.send(JSON.stringify(msg));
      };

      send({ type: 'joined', channelId, members });
      members.forEach((id) => {
        broadcastTo(id, { type: 'peer-joined', channelId, riderId });
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as SignallingMessage;
          if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice') {
            broadcastTo(msg.to, { ...msg });
          }
        } catch {
          // ignore
        }
      });

      ws.on('close', () => {
        if (logWs) console.log('[ws] close', { channelId, riderId });
        removeSocketForRider(riderId, ws);
        const membersSet = channelMembers.get(channelId);
        membersSet?.delete(riderId);
        if (membersSet && membersSet.size === 0) {
          channelMembers.delete(channelId);
        }
        getMembers(channelId).forEach((id) => {
          broadcastTo(id, { type: 'left', riderId });
        });
      });
    })();
  });

  function broadcastTo(toRiderId: string, payload: object): void {
    const clients = riderSockets.get(toRiderId);
    if (!clients || clients.size === 0) return;

    const encoded = JSON.stringify(payload);
    clients.forEach((client) => {
      if (client.readyState === 1) client.send(encoded);
    });
  }
}
