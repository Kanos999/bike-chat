import assert from 'node:assert/strict';
import http from 'http';
import test from 'node:test';
import WebSocket from 'ws';
import { startSignallingServer } from './signalling';

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: WebSocket.RawData) => {
      cleanup();
      resolve(JSON.parse(raw.toString()));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

async function connectClient(baseUrl: string, channelId: string, riderId: string): Promise<WebSocket> {
  const ws = new WebSocket(`${baseUrl}/ws?channelId=${encodeURIComponent(channelId)}&riderId=${encodeURIComponent(riderId)}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return ws;
}

test(
  'signalling notifies existing members about new peers and relays messages',
  { skip: process.env.RUN_SOCKET_TESTS !== '1' },
  async (t) => {
    const server = http.createServer();
    startSignallingServer(server, {
      authorizeWsToken: async () => true,
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    t.after(() => {
      server.close();
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `ws://127.0.0.1:${address.port}`;

    const riderA = await connectClient(baseUrl, 'channel-test', 'alpha');
    t.after(() => riderA.close());

    const joinedA = await waitForMessage(riderA);
    assert.deepEqual(joinedA, {
      type: 'joined',
      channelId: 'channel-test',
      members: [],
    });

    const peerJoinedPromise = waitForMessage(riderA);

    const riderB = await connectClient(baseUrl, 'channel-test', 'bravo');
    t.after(() => riderB.close());

    const joinedB = await waitForMessage(riderB);
    assert.deepEqual(joinedB, {
      type: 'joined',
      channelId: 'channel-test',
      members: ['alpha'],
    });

    assert.deepEqual(await peerJoinedPromise, {
      type: 'peer-joined',
      channelId: 'channel-test',
      riderId: 'bravo',
    });

    const offer = {
      type: 'offer',
      channelId: 'channel-test',
      from: 'alpha',
      to: 'bravo',
      sdp: { type: 'offer', sdp: 'fake-offer' },
    };

    const offerReceived = waitForMessage(riderB);
    riderA.send(JSON.stringify(offer));
    assert.deepEqual(await offerReceived, offer);

    const leftReceived = waitForMessage(riderA);
    riderB.close();
    assert.deepEqual(await leftReceived, {
      type: 'left',
      riderId: 'bravo',
    });
  });
