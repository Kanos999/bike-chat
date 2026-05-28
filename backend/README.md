# Bike Chat Backend

Node.js/TypeScript service that provides **presence**, **channel assignment**, and **WebSocket signalling** for the Bike Chat motorcycle intercom app. It runs as a single process: one HTTP server handles both REST and WebSocket upgrades.

---

## What the backend does

### 1. Presence (REST)

- **`POST /presence`**  
  Clients send their current position and ride mode so the server can group nearby riders.

  - **Body:** `{ riderId: string, lat: number, lon: number, rideMode?: 'OFF'|'OPEN'|'FRIENDS_ONLY', timestamp?: number }`
  - **Response:** `204 No Content` on success; `400` if `riderId`, `lat`, or `lon` are missing or invalid.
  - **Behaviour:** The server stores this as the rider’s latest presence. Each presence has a **TTL of 90 seconds**; if the client doesn’t send another update, the entry is removed. Presence is tagged with a **geohash** (precision 6, ~0.6-1.2 km cells) and indexed spatially so nearby riders can be found cheaply.

- **`GET /presence/channel?riderId=<id>`**  
  Returns the channel the rider should join, if any.

  - **Response:** `{ channelId: string | null }`
  - **Behaviour:** A rider gets a non-null `channelId` when at least two compatible riders are connected through proximity links, evaluated with **hysteresis**:
    - **Join radius: 150 m.** A new link forms when two compatible riders come within 150 m.
    - **Leave radius: 300 m.** An existing link is *retained* until the riders drift beyond 300 m. This keeps a paired group connected through normal spacing/traffic instead of flapping at the boundary.
  - **Mode compatibility is symmetric** — a link only forms between riders in the *same* mode:
    - **OPEN** pairs with OPEN.
    - **FRIENDS_ONLY** pairs only with FRIENDS_ONLY (a private crew is never pulled into an open rider's channel).
  - **Sticky channel id.** A group's `channelId` is assigned when the group first forms and persists for the group's lifetime — it does **not** change as the group moves, and on a merge the older group's id wins. So a crew riding together stays on one channel for the whole ride (no mid-ride rejoins). Minted ids look like `channel-<geohash>-<seq>`.
  - Membership is computed statefully and cached briefly (recomputed at most every ~500 ms), so a dense cluster is solved once per tick rather than once per rider-poll.

So: clients **push** presence with `POST /presence`, and **poll** `GET /presence/channel` to know when to join/leave a channel. No authentication in this MVP.

### 2. Presence store (in-memory)

- Implemented in `src/presenceStore.ts`.
- **Storage:** In-memory `Map` keyed by `riderId`. Each value is the latest presence plus an expiry time (now + 90 s).
- **Geohash:** Uses the `ngeohash` library with precision 6; the 3x3 cell neighbourhood around a rider covers the 300 m leave radius, so candidate peers are found via the index rather than scanning everyone.
- **Cleanup:** A timer runs every 30 seconds and deletes expired entries. Expired entries are also removed on read when iterating the store.

**Limitations:** Data is lost on restart and doesn’t scale across multiple server instances. For production you’d typically back this with Redis (or similar) and optional horizontal scaling.

### 3. WebSocket signalling (`/ws`)

- **Purpose:** After the app learns a `channelId` from `GET /presence/channel`, it opens a WebSocket to exchange WebRTC signalling messages (offer, answer, ICE candidates) with other riders in that channel.
- **URL:** Same host as the API, path `/ws`. Query params: **`channelId`** and **`riderId`** (required).

  Example: `ws://your-server:3001/ws?channelId=channel-9q8yy&riderId=rider-123`

- **On connect:** The server adds the client to the channel’s member set and sends a **`joined`** message: `{ type: 'joined', channelId, members }` (other members’ `riderId`s).
- **Relay:** Clients send JSON messages with `type: 'offer' | 'answer' | 'ice'` and `from`, `to`, plus `sdp` or `candidate`. The server forwards these only to the WebSocket client whose `riderId` equals `to`.
- **On disconnect:** The server removes the rider from the channel and sends **`left`** to the remaining members: `{ type: 'left', riderId }`.

So the backend does **not** handle media; it only relays signalling so peers can establish WebRTC connections (e.g. voice) directly with each other.

### 4. Single server, one port

- `src/api.ts` creates an `http.Server` from the Express app, then attaches the **ws** WebSocket server to the same server with `path: '/ws'`.
- All traffic is on one port (default **3001**): HTTP for REST, WebSocket for `/ws`.
- **CORS** is enabled for the REST API so browser or mobile clients can call it from other origins.

---

## Running locally

### Prerequisites

- Node.js 18+
- npm or yarn

### Commands

```bash
cd backend
npm install
```

- **Development (with reload):**  
  `npm run dev`  
  Uses `ts-node-dev`; compiles and runs `src/index.ts` and restarts on file changes.

- **Production-style (compiled):**  
  `npm run build`  
  then  
  `npm start`  
  Runs `node dist/index.js`.

### Environment

- **`PORT`** – Port to listen on. Default: `3001`.

  Example: `PORT=3001 npm run dev`

The server logs: `API + WebSocket listening on http://localhost:${PORT}`.

### Browser rider harness

For one-phone testing, the backend also serves a browser-based rider harness:

- `GET /dev/harness.html`

Open it from your laptop browser using the same host that the phone uses for the backend, for example:

```text
http://192.168.0.79:3001/dev/harness.html
```

The harness can:

- send presence updates with manual coordinates
- poll for assigned channels
- join `/ws`
- exchange WebRTC audio with the Android app
- simulate extra riders by opening multiple tabs with different rider IDs

---

## Running a deployed version

Deployment options that work well for a single Node process with HTTP + WebSocket:

### Option A: VPS / single machine (recommended for MVP)

Run the backend on a small Linux VM (e.g. DigitalOcean, Linode, EC2).

1. **Install Node 20 LTS** (or 18+) on the server.
2. **Clone/copy the app** (e.g. `backend/` folder) and install dependencies:
   ```bash
   cd backend
   npm ci
   npm run build
   ```
3. **Run under a process manager** so it restarts on crash and survives reboots:
   - **systemd** (example unit):
     ```ini
     [Unit]
     Description=Bike Chat Backend
     After=network.target

     [Service]
     Type=simple
     User=www-data
     WorkingDirectory=/var/www/bike-chat-backend
    Environment=PORT=3001
     ExecStart=/usr/bin/node dist/index.js
     Restart=on-failure
     RestartSec=5

     [Install]
     WantedBy=multi-user.target
     ```
     Install: `sudo systemctl enable bike-chat-backend && sudo systemctl start bike-chat-backend`
   - **PM2:**  
     `npm install -g pm2` then  
     `pm2 start dist/index.js --name bike-chat-backend`  
     and `pm2 save` + `pm2 startup` for persistence.
4. **Reverse proxy (recommended):** Put Nginx (or Caddy) in front so you can use HTTPS and a domain:
   - Terminate TLS at the proxy.
  - Proxy `http://localhost:3001` for both HTTP and WebSocket (e.g. `proxy_http_version 1.1`, `Upgrade`, `Connection` for `/ws`).
  - Clients then use `https://your-domain.com` (and `wss://your-domain.com/ws`) instead of opening port 3001 to the internet.
5. **Firewall:** Allow 80/443 (and optionally SSH); do not expose 3001 publicly if you use a proxy.

### Option B: PaaS (Railway, Render, Fly.io, etc.)

- **Railway / Render:** Connect the repo, set root or build directory to `backend`, build command `npm run build`, start command `npm start`, and set `PORT` from the platform (they often inject it). Enable HTTPS; the platform usually handles it.
- **Fly.io:** Use a `Dockerfile` that installs Node, copies `backend`, runs `npm ci && npm run build` and `node dist/index.js`, and exposes the port Fly gives you. Fly handles TLS and scaling.
- **Important:** Ensure the plan allows **long-lived WebSocket connections** and doesn’t aggressively close idle connections; signalling connections may be open for the duration of a ride.

### Option C: Docker (any host)

Example **Dockerfile** in `backend/`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
docker build -t bike-chat-backend ./backend
docker run -p 3001:3001 -e PORT=3001 bike-chat-backend
```

Use the same image behind a reverse proxy or in Kubernetes; set `PORT` as required by the environment.

### Option D: Serverless / edge

Not a good fit for this backend because:

- WebSocket signalling requires a long-lived connection per client; most serverless runtimes have short timeouts and don’t support stateful WS well.
- The in-memory presence store is per process; serverless is multi-instance and stateless, so you’d need Redis (or similar) and a separate WebSocket host (e.g. dedicated server or managed WS service).

Stick with a **single long-running process** (VPS, PaaS, or container) for a deployed version.

---

## Client configuration

Point the mobile app at the **deployed** backend:

- **REST base URL:** `https://your-domain.com` (no trailing slash). The app will call `POST /presence` and `GET /presence/channel?riderId=...`.
- **WebSocket URL:** `wss://your-domain.com/ws?channelId=...&riderId=...` (same host, path `/ws`, TLS in production).

Set the app’s base URL (e.g. in `src/config.ts` or via env) to your deployed host so it uses that instead of `http://10.0.2.2:3001` in development.

---

## Summary

| Component        | Role                                                                 |
|-----------------|----------------------------------------------------------------------|
| **POST /presence** | Update rider location and mode; stored in memory with 90 s TTL.     |
| **GET /presence/channel** | Return shared channel id for ≥2 same-mode riders linked with hysteresis (150 m join / 300 m leave); ids are sticky for the group's lifetime. |
| **Presence store** | In-memory map + geohash; pruned every 30 s.                         |
  | **WebSocket /ws**  | Join channel by `channelId`/`riderId`; relay offer/answer/ice.       |
  | **Single process** | One port (default 3001) for HTTP and WS.                            |

**Best way to run a deployed version:** Run the compiled app (`npm run build && npm start`) on a **single, long-running host** (VPS, PaaS, or container), put a **reverse proxy** in front for HTTPS/WSS, and point the mobile app at that base URL.

## Auth and readiness (MVP)

- Optional shared-token auth is enabled by setting `AUTH_TOKEN`.
  - REST: send `Authorization: Bearer <AUTH_TOKEN>`.
  - WebSocket: append `&token=<AUTH_TOKEN>` to `/ws` URL.
- Health endpoints:
  - `GET /healthz`
  - `GET /readyz`

## Optional presence snapshot persistence

Set `PRESENCE_SNAPSHOT_PATH` (for example `/data/presence.json`) to persist presence state snapshots across process restarts for single-instance deployments.

## Supabase integration (recommended MVP auth)

You can secure the backend using Supabase access tokens without adding server-side JWT libraries.

Set these environment variables:

- `SUPABASE_URL` (e.g. `https://<project-ref>.supabase.co`)
- `SUPABASE_ANON_KEY`

When these are set:

- REST endpoints require `Authorization: Bearer <supabase_access_token>`.
- WebSocket `/ws` requires `token=<supabase_access_token>` query param.
- The backend validates tokens by calling Supabase `GET /auth/v1/user`.

Compatibility notes:

- `AUTH_TOKEN` can still be set as an emergency/shared fallback.
- If both `AUTH_TOKEN` and Supabase env vars are set, either valid credential is accepted.
