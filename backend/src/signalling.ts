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

function getMembers(channelId: string): string[] {
  const set = channelMembers.get(channelId);
  return set ? Array.from(set) : [];
}

export function startSignallingServer(server: import('http').Server, auth: AuthContextLike): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const channelId = url.searchParams.get('channelId') ?? '';
    const riderId = url.searchParams.get('riderId') ?? '';
    const token = url.searchParams.get('token');

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

      const members = getMembers(channelId).filter((id) => id !== riderId);

      const send = (msg: object) => {
        if (ws.readyState === 1) ws.send(JSON.stringify(msg));
      };

      send({ type: 'joined', channelId, members });

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
    wss.clients.forEach((client) => {
      if (client.readyState !== 1) return;
      const r = (client as import('ws').WebSocket & { riderId?: string }).riderId;
      if (r === toRiderId) client.send(JSON.stringify(payload));
    });
  }
}
