# Single-Device Verification Plan

This app can be meaningfully verified with:

- 1 physical Android phone running the React Native app
- 1 laptop running the backend
- 1 laptop browser tab acting as another rider via `/dev/harness.html`

That gives you a real mobile client, a real backend, and a second real WebRTC peer without needing a second phone.

## What this verifies

- Geolocation presence reaches the backend
- Channel assignment changes as riders move near/far
- WebSocket signalling works for join, peer arrival, relay, and leave
- WebRTC audio can flow between the Android phone and the browser peer

## Setup

1. Start the backend on your laptop:

```bash
cd backend
npm install
npm run dev
```

2. Find your laptop LAN IP, for example `192.168.0.79`.

3. Point the app at that backend before launch:

```ts
// index.tsx
(global as unknown as { __BikeChatApiBaseUrl?: string }).__BikeChatApiBaseUrl = 'http://192.168.0.79:3001';
```

4. Run the Android app on the phone.

5. Open the browser harness on the laptop:

```text
http://192.168.0.79:3001/dev/harness.html
```

Use the LAN IP, not `localhost`, so the phone and browser are targeting the same backend host.

## Test 1: Geolocation room matching

1. In the app, set a username in Settings.
2. In the browser harness, set a different `Rider ID`.
3. Put both riders in `OPEN`.
4. Start the browser rider.
5. Start ride mode on the phone.
6. Set the browser rider location close to the phone's current location.

Expected result:

- The app begins sending presence updates.
- The browser harness shows a non-null channel.
- The app shows the same `Channel`.
- Both clients converge on the same channel id within one or two poll intervals.

7. Click `Move Far Away` in the browser harness.

Expected result:

- The browser harness loses the assigned channel.
- The app leaves the channel shortly after.

8. Switch both sides to `FRIENDS_ONLY` and repeat.

Expected result:

- `FRIENDS_ONLY` matches `FRIENDS_ONLY`.
- `FRIENDS_ONLY` does not match `OPEN`.

## Test 2: Realtime audio

1. Keep the browser rider and phone rider in the same active channel.
2. Allow microphone access in the browser.
3. Speak into the phone and confirm audio arrives in the browser.
4. Speak into the browser mic and confirm audio arrives on the phone.
5. Toggle local mute from the phone UI and confirm phone-to-browser audio stops.
6. Toggle local mute off and confirm audio resumes.
7. End the ride on the phone.

Expected result:

- The browser harness log shows peer join, offer/answer exchange, and ICE traffic.
- Remote audio elements appear in the browser harness.
- Audio stops when the phone leaves the ride or loses the channel.

## Useful stress cases

- Open two browser tabs with different rider IDs to simulate a small group.
- Start the browser first, then the phone; then reverse the order. Both should still negotiate audio.
- Change rider IDs so lexical ordering flips; this checks that offer creation still works after the peer-joined signalling fix.

## Automated checks

Run backend regression tests:

```bash
cd backend
npm run build
npm test
```

These cover:

- stable nearby matching
- cross-geohash nearby matching
- far-apart riders not matching
- transitive component matching

To run the live WebSocket signalling test as well, use:

```bash
cd backend
npm run build
RUN_SOCKET_TESTS=1 npm test
```

That exercise covers peer-joined, relay, and left events.

## Limits of this setup

- It does not validate BLE discovery between two physical helmets/phones.
- It does not validate Android background execution reliability over a long ride.
- It does not validate wind-noise suppression quality under real riding conditions.

Those need on-bike testing after this harness pass.

## Next steps after this passes

1. Replace the current 5 second channel polling with server-pushed channel updates or a shorter adaptive interval.
2. Add explicit WebRTC connection-state and audio-level diagnostics to the app UI.
3. Add TURN and test off-LAN or mobile-network cases.
4. Add a foreground-service/background test pass for long rides on Android.
5. Replace mock BLE with a deterministic dev beacon mode, then validate phone-to-phone discovery.
6. Add VAD / noise suppression acceptance tests with recorded wind noise samples.
