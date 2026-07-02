# Scope: SFU migration for unlimited-size proximity voice

## Goal

Replace the 4-rider mesh cap in the voice layer with a **Selective Forwarding Unit
(SFU)** so any number of riders matched to the same proximity channel can all hear
each other, with Discord-grade reliability (seamless join/leave, automatic
reconnection across Wi-Fi/cellular handoff, no silent exclusions).

## Non-goals

- No change to **proximity matching** (geohash channels, hysteresis, heading gate,
  blocks, crews) — that stays exactly as-is in `backend/src/presenceStore.ts`.
- No change to presence push, BLE proximity, GPS/IMU, analytics, or ride flow.
- Not building a media server from scratch.

## The clean seam (why this is contained)

Voice is fully abstracted behind `VoiceModule`
([types.ts](../src/modules/voice/types.ts)) and `react-native-webrtc` is imported in
**exactly one file** ([webrtcVoiceModule.ts](../src/modules/voice/webrtcVoiceModule.ts)).
`rideSlice` only ever calls `services.voice.{init,joinChannel,leaveChannel,
setLocalMute,setGlobalMute,onStateChange,onPeersChange}`. So the SFU is a **drop-in
replacement of the voice module** plus a backend token endpoint — nothing in the
orchestration changes.

- SFU handles **media transport only**. A "channel" (the matcher's stable
  `channel-<geohash>-<seq>` id) maps 1:1 to an SFU **room**.
- When the existing matching flow changes a rider's channel, the client leaves the
  old room and joins the new one — same trigger as today's `joinChannel`.

## Decision: LiveKit Cloud (managed) — locked

Direction chosen: **LiveKit Cloud**. Client code is identical to a self-hosted
LiveKit; only `LIVEKIT_URL` + API key/secret differ, so we can move to self-hosting
later with no client changes if cost/scale demands it.

For "as reliable as Discord with the least build/ops," **LiveKit** is the strong
default:

- Purpose-built SFU with a first-class React Native SDK (`@livekit/react-native`).
- Rooms = channels; JWT tokens scoped to room + identity fit our authed backend.
- Built-in reconnection, ICE restart, network-change handling, active-speaker
  detection, audio-level metering (can finally power the currently-stubbed
  `subscribeToInputLevel` visualizer), DTX/RED redundancy for packet loss.
- **Includes its own TURN** — see "Impact on TURN work" below.
- One mic upload per rider regardless of group size (vs mesh's N−1). Scales to large
  group rides on cellular uplink, which mesh fundamentally cannot.

Alternatives considered:
- **mediasoup** (Node lib): maximum control, but we'd hand-build worker management,
  transport negotiation, a signalling protocol, and scaling — weeks of work.
- **Janus** (`audiobridge` plugin, server-side mixing): capable but C-server ops
  heavy.
- Recommendation stands on LiveKit unless we need to avoid a third party entirely.

## Impact on the TURN work just shipped (be aware)

LiveKit provides TURN itself, so **if we adopt LiveKit we do NOT need to stand up
coturn** — the `turn/` deploy work becomes unnecessary for voice. The backend
`/turn-credentials` endpoint and `turn.ts` can be left dormant or removed. Nothing is
wasted (it validated the ephemeral-credential pattern the voice-token endpoint will
reuse), but **hold off deploying coturn** until we pick a direction here.

## What changes

### Backend
- **New:** `GET /voice-token?channelId=&riderId=` (behind existing `authMiddleware`) —
  mints a LiveKit JWT scoped to `room = channelId`, `identity = riderId`. Mirrors the
  `/turn-credentials` pattern already in `api.ts`. Env: `LIVEKIT_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- Add `livekit-server-sdk` (token minting only; no media touches our backend).
- Everything else unchanged.

### Client
- **New:** `src/modules/voice/livekitVoiceModule.ts` implementing `VoiceModule`:
  - `init()` — connect prerequisites, warm token.
  - `joinChannel(channelId)` — fetch `/voice-token`, connect to the room, publish the
    mic track (with the same noise-suppression/DTX capture options we already tuned).
  - `leaveChannel()` — disconnect from the room.
  - `setLocalMute` → `setMicrophoneEnabled(false)`; `setGlobalMute` → mute/unsubscribe
    remote audio; map both to `IntercomState`.
  - `onPeersChange` → room participant events; `subscribeToInputLevel` → LiveKit audio
    levels.
- **Swap** in `services.ts`: `createWebRTCVoiceModule()` → `createLiveKitVoiceModule()`.
- Keep BLE audio routing (`startVoiceRoute`, `MODE_IN_COMMUNICATION`) so audio still
  lands in the helmet; verify LiveKit's RN audio session cooperates with our
  `AudioManager` mode (integration risk #2 below).
- The foreground service (already shipped) keeps the LiveKit connection alive in the
  background — no change needed.

### Dependencies (integration risk #1)
- `@livekit/react-native` depends on `@livekit/react-native-webrtc` (a fork of
  `react-native-webrtc`). The community `react-native-webrtc` and LiveKit's fork
  **cannot both be linked** (duplicate native symbols). Since only the old mesh module
  uses `react-native-webrtc`, the migration is a **cut-over**: remove
  `react-native-webrtc`, drop the mesh module from the build (keep the source for
  reference), depend on LiveKit's stack only. Not a runtime toggle.

### Deployment
- **LiveKit Cloud** (managed): least ops, global edge, built-in TURN, generous free
  tier. Set `LIVEKIT_*` secrets on the backend and go. Recommended for validating the
  product.
- **Self-hosted LiveKit** (Docker + Redis + TURN on a VM with a public IP): full
  control/cost at scale; more ops. Same client code, different `LIVEKIT_URL`.

## Reliability / UX parity with Discord (what we get)
- Seamless mid-ride join/leave (participant events, no mesh renegotiation storms).
- Automatic reconnection + ICE restart on network flaps and Wi-Fi↔cellular handoff.
- No silent 5th-rider exclusion — everyone in the room is in the call.
- Active-speaker + audio levels for UI (who's talking, the visualizer).
- Optional: subscribe only to the nearest N / active speakers to bound downlink on
  very large rides (audio is cheap, so likely unnecessary early).

## Risks & mitigations
1. **WebRTC dependency conflict** (above) — resolve by full cut-over to LiveKit's
   stack; verify a clean Android build first.
2. **Helmet audio routing** — LiveKit manages its own audio session on RN; confirm it
   coexists with our SCO/`MODE_IN_COMMUNICATION` route, or move routing to LiveKit's
   audio config. Test on a real BT helmet early.
3. **Third-party dependency / cost** — LiveKit Cloud is a vendor + usage cost; mitigated
   by the option to self-host the same open-source server with identical client code.
4. **Token/room lifecycle churn** — channels are sticky (geohash), so room joins are
   infrequent; reuse the token-cache pattern from `iceServers.ts`.

## Phased rollout
1. [DONE] Backend `/voice-token` + `livekit-server-sdk`; unit-tested token minting.
2. [DONE] `livekitVoiceModule` behind the existing interface; dependency cut-over
   (`react-native-webrtc` removed, mesh module retired); Kotlin bumped to 1.9.25;
   debug + release Android builds pass.
3. [TODO — needs device] Bench test: 2 phones, then 5+ participants in one room
   (extra joiners via LiveKit web/CLI) to prove the >4 case end-to-end.
4. [TODO — needs device] Real ride test with helmets; validate helmet audio routing
   (risk #2), background audio (FGS) + reconnection.
5. [TODO] Decide LiveKit Cloud vs self-host based on cost/scale; retire coturn + delete
   the retired client TURN/iceServers path (already removed) and backend turn.ts if
   unused.

## Status notes (post-implementation)
- Native build verified with `@livekit/react-native-webrtc` 144.1.1,
  `@livekit/react-native` 2.11.1, `livekit-client` 2.20.0.
- **Risk #2 still open:** the LiveKit `AudioSession` (communication preset, Bluetooth
  preferred) and the existing `BleModule.startVoiceRoute` both set
  `MODE_IN_COMMUNICATION`/select the BT device. rideSlice still calls startVoiceRoute.
  If the helmet route misbehaves on-device, the fix is to stop calling startVoiceRoute
  (let LiveKit own routing) and keep BleModule for route *detection* only.
- **Runtime setup:** `registerGlobals()` is called once when the real voice module is
  created; confirm no additional `MainApplication` init is needed for LiveKit audio on
  first device run.

## Rough effort (estimate)
- Backend token endpoint: ~0.5 day.
- LiveKit voice module + interface parity: ~2–3 days.
- Dependency cut-over + clean build + helmet audio verification: ~1–2 days (risk-driven).
- Deploy + multi-party bench/ride testing: ~1–2 days.
- **Total ≈ 1 to 1.5 weeks**, most of it in the dependency/audio-session integration
  and real-device testing, not the happy-path code.
