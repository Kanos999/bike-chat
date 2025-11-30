You are an expert React Native + TypeScript + mobile systems engineer.
You are helping me build an MVP of a motorcycle “proximity intercom” app.

====================
HIGH-LEVEL PRODUCT
====================

We are building a React Native mobile app for motorcyclists that:

- Lets riders opt into a “Ride Mode” before they start riding.
- While in Ride Mode, the app:
  - Connects to the rider’s Bluetooth helmet/headset for audio.
  - Uses Bluetooth Low Energy (BLE) + GPS to detect other riders nearby who are also running the app and are opted-in.
  - Automatically joins an audio “intercom” channel with nearby riders (no button press to talk).
  - Plays a short audible ping when a new rider becomes available nearby.
  - Keeps the microphone effectively “always ready” during Ride Mode and uses VAD (voice activity detection) / noise suppression so that only speech is transmitted, not constant wind noise.
- Riders can use headset buttons ONLY for:
  - Muting/unmuting their mic (local mute).
  - Optionally globally muting all rider audio for the current ride.
- Headset buttons must NOT be required to start talking; talking is automatic.

This MVP will target Android first, with code structured so iOS can be added later.

====================
TECH STACK & ARCHITECTURE
====================

CLIENT:
- React Native (TypeScript)
- State management: Zustand or Redux Toolkit (prefer Zustand)
- Navigation: @react-navigation/native
- Voice engine: WebRTC (via RN-compatible module)
- Native Modules (Android/Kotlin first) for:
  - BLE advertising and scanning
  - Headset connection + button events
  - Background-friendly location tracking
  - WebRTC/audio if needed

BACKEND (initially mocked):
- Node.js or TS service
- WebSocket or WebRTC signalling server
- Presence service (Redis-like or in-memory)
- Basic presence and channel APIs

Goal of phase 1:
- Scaffold RN app
- Implement domain modules and state machines
- Define TS interfaces for native modules and backend
- Use mocked behaviour to simulate proximity and voice channel changes

====================
CORE DOMAIN CONCEPTS
====================

1) RIDE MODE

Ride Mode states:
- IDLE
- INITIALISING
- ACTIVE_OPEN
- ACTIVE_FRIENDS_ONLY
- SUSPENDED
- ENDED

When ACTIVE:
- BLE advertising & scanning
- Location tracking
- Presence updates to backend
- Voice subsystem ready to join channels

2) PROXIMITY & CHANNELS

BLE beaconing + GPS presence:
- App advertises rider beacon with anonymised riderId + flags
- App scans for other beacons
- App sends periodic presence to backend

Backend assigns a “local channel” based on proximity.

Client rules:
- If channel becomes non-null → join it, play ping
- If channel becomes null → leave it
- If channel changes → leave old, join new

3) INTERCOM / VOICE MODEL

No push-to-talk.

When in a channel and not muted:
- Mic is live but gated by VAD + noise suppression
- Wind noise must not be transmitted

IntercomState:
- DISABLED
- IDLE
- OPEN
- MUTED_LOCAL
- MUTED_GLOBAL

4) HEADSET BUTTONS

Used ONLY for mute:
- Short press → toggle local mute
- Long press → toggle global mute

No talking button. Music controls should still work normally.

====================
REACT NATIVE STRUCTURE
====================

Project structure:
- src/app/ (app entry + navigation)
- src/screens/
  - HomeScreen.tsx
  - RideScreen.tsx
  - SettingsScreen.tsx
- src/components/
- src/state/
  - store.ts
  - rideSlice.ts
  - proximitySlice.ts
  - voiceSlice.ts
- src/modules/
  - ride/
  - proximity/
  - voice/
  - bluetooth/
  - location/
  - api/
  - audio/

Implement:
- TS interfaces for modules
- Mock implementations simulating:
  - Helmet connection
  - Rider proximity
  - Channel assignment
  - Intercom state changes

====================
NATIVE MODULE INTERFACES (TS)
====================

1) Bluetooth / Helmet Module

type RiderBeacon = {
  riderId: string;
  rssi: number;
  flags: number;
};

type HeadsetEventType = 'LOCAL_MUTE_TOGGLE' | 'GLOBAL_MUTE_TOGGLE';

interface BluetoothModule {
  startAdvertising(riderId: string, flags: number): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(onBeacon: (b: RiderBeacon) => void): Promise<void>;
  stopScanning(): Promise<void>;
  onHeadsetEvent(listener: (event: HeadsetEventType) => void): () => void;
  onHelmetConnectionChange(listener: (connected: boolean) => void): () => void;
}

2) Location Module

type Location = {
  lat: number;
  lon: number;
  speedKph: number | null;
  headingDeg: number | null;
};

interface LocationModule {
  startTracking(onLocation: (loc: Location) => void): Promise<void>;
  stopTracking(): Promise<void>;
  requestPermissions(): Promise<boolean>;
}

3) Voice / WebRTC Module

type IntercomState =
  | 'DISABLED'
  | 'IDLE'
  | 'OPEN'
  | 'MUTED_LOCAL'
  | 'MUTED_GLOBAL';

interface VoiceModule {
  init(): Promise<void>;
  joinChannel(channelId: string): Promise<void>;
  leaveChannel(): Promise<void>;
  setLocalMute(muted: boolean): Promise<void>;
  setGlobalMute(muted: boolean): Promise<void>;
  getState(): IntercomState;
  onStateChange(listener: (state: IntercomState) => void): () => void;
}

====================
BACKEND INTERFACE (CLIENT SIDE)
====================

interface PresenceUpdate {
  riderId: string;
  lat: number;
  lon: number;
  rideMode: 'OFF' | 'OPEN' | 'FRIENDS_ONLY';
  timestamp: number;
}

interface NearbyChannelResponse {
  channelId: string | null;
}

interface ApiClient {
  updatePresence(update: PresenceUpdate): Promise<void>;
  getAssignedChannel(): Promise<NearbyChannelResponse>;
}

Implement with mocked behaviour for now.

====================
STATE & FLOW
====================

1) Starting Ride Mode
- From HomeScreen: Start Ride
- Permissions checked
- BLE advertising + scanning starts
- Location tracking starts
- VoiceModule initialized
- Presence updates + channel polling begin
- Navigate to RideScreen

2) Detecting Nearby Riders
- Proximity module simulates riders appearing
- getAssignedChannel() returns channel or null
- If channel appears:
  - joinChannel()
  - set intercom state OPEN unless muted
  - trigger ping sound

3) Mute Controls
- LOCAL_MUTE_TOGGLE → OPEN <-> MUTED_LOCAL
- GLOBAL_MUTE_TOGGLE → any state <-> MUTED_GLOBAL

4) Ending Ride Mode
- Stop BLE, location, voice
- Final presence update
- Back to IDLE

====================
WHAT YOU MUST DO NOW
====================

1. Scaffold a new React Native + TypeScript project.
2. Implement folder structure described above.
3. Create Zustand store with rideSlice, proximitySlice, voiceSlice.
4. Implement TS interfaces for BluetoothModule, LocationModule, VoiceModule, ApiClient.
5. Provide mock JS implementations for these modules.
6. Build simple HomeScreen, RideScreen, SettingsScreen.
7. Wire the system so I can:
   - Start Ride Mode
   - Simulate proximity events
   - See intercom state transitions
   - Toggle mute via simulated headset events
   - End Ride Mode cleanly

Write clean, modular, well-typed code with clear comments showing where native or backend code will eventually replace mocks.

## Running the app (Android, React Native 0.73)

1) **Install prerequisites**

- Node.js 18+ and yarn or npm
- Android Studio with Android SDK, platform tools, and at least one Android 13 (API 33) image
- Java 17 (required by React Native 0.73 build tooling)

2) **Install JS dependencies**

```bash
yarn install
# or
npm install
```

3) **Configure an Android device/emulator**

- Start an emulator from Android Studio **or** connect a physical device with USB debugging enabled.
- Ensure `adb devices` lists your target.

4) **Start Metro (JavaScript bundler)**

In one terminal, from the repo root:

```bash
yarn start
# or
npm run start
```

5) **Build and launch the Android app**

In another terminal:

```bash
yarn android
# or
npm run android
```

> The current MVP uses mocked native/back-end services. No extra native setup is required beyond the standard React Native Android toolchain.
