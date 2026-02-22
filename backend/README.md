# Bike Chat Backend

Node.js/TypeScript service that provides **presence**, **channel assignment**, and **WebSocket signalling** for the Bike Chat motorcycle intercom app. It runs as a single process: one HTTP server handles both REST and WebSocket upgrades.

---

## What the backend does

### 1. Presence (REST)

- **`POST /presence`**  
  Clients send their current position and ride mode so the server can group nearby riders.

  - **Body:** `{ riderId: string, lat: number, lon: number, rideMode?: 'OFF'|'OPEN'|'FRIENDS_ONLY', timestamp?: number }`
  - **Response:** `204 No Content` on success; `400` if `riderId`, `lat`, or `lon` are missing or invalid.
  - **Behaviour:** The server stores this as the rider’s latest presence. Each presence has a **TTL of 90 seconds**; if the client doesn’t send another update, the entry is removed. Presence is tagged with a **geohash** (precision 5, ~5 km cells) for grouping.

- **`GET /presence/channel?riderId=<id>`**  
  Returns the channel the rider should join, if any.

  - **Response:** `{ channelId: string | null }`
  - **Behaviour:** A rider gets a non-null `channelId` only when **at least two riders** are in the same geohash cell and their ride modes are compatible:
    - **OPEN:** any rider in the same cell can share a channel.
    - **FRIENDS_ONLY:** only riders with `rideMode: 'FRIENDS_ONLY'` in the same cell are grouped.
  - Channel id format: `channel-<geohash>` (e.g. `channel-9q8yy`).

So: clients **push** presence with `POST /presence`, and **poll** `GET /presence/channel` to know when to join/leave a channel. No authentication in this MVP.

### 2. Presence store (in-memory)

- Implemented in `src/presenceStore.ts`.
- **Storage:** In-memory `Map` keyed by `riderId`. Each value is the latest presence plus an expiry time (now + 90 s).
- **Geohash:** Uses the `ngeohash` library with precision 5 so riders within roughly the same ~5 km cell can be assigned the same channel.
- **Cleanup:** A timer runs every 30 seconds and deletes expired entries. Expired entries are also removed on read when iterating the store.

**Limitations:** Data is lost on restart and doesn’t scale across multiple server instances. For production you’d typically back this with Redis (or similar) and optional horizontal scaling.

### 3. WebSocket signalling (`/ws`)

- **Purpose:** After the app learns a `channelId` from `GET /presence/channel`, it opens a WebSocket to exchange WebRTC signalling messages (offer, answer, ICE candidates) with other riders in that channel.
- **URL:** Same host as the API, path `/ws`. Query params: **`channelId`** and **`riderId`** (required).

  Example: `ws://your-server:3000/ws?channelId=channel-9q8yy&riderId=rider-123`

- **On connect:** The server adds the client to the channel’s member set and sends a **`joined`** message: `{ type: 'joined', channelId, members }` (other members’ `riderId`s).
- **Relay:** Clients send JSON messages with `type: 'offer' | 'answer' | 'ice'` and `from`, `to`, plus `sdp` or `candidate`. The server forwards these only to the WebSocket client whose `riderId` equals `to`.
- **On disconnect:** The server removes the rider from the channel and sends **`left`** to the remaining members: `{ type: 'left', riderId }`.

So the backend does **not** handle media; it only relays signalling so peers can establish WebRTC connections (e.g. voice) directly with each other.

### 4. Single server, one port

- `src/api.ts` creates an `http.Server` from the Express app, then attaches the **ws** WebSocket server to the same server with `path: '/ws'`.
- All traffic is on one port (default **3000**): HTTP for REST, WebSocket for `/ws`.
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

- **`PORT`** – Port to listen on. Default: `3000`.

  Example: `PORT=3001 npm run dev`

The server logs: `API + WebSocket listening on http://localhost:${PORT}`.

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
     Environment=PORT=3000
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
   - Proxy `http://localhost:3000` for both HTTP and WebSocket (e.g. `proxy_http_version 1.1`, `Upgrade`, `Connection` for `/ws`).
   - Clients then use `https://your-domain.com` (and `wss://your-domain.com/ws`) instead of opening port 3000 to the internet.
5. **Firewall:** Allow 80/443 (and optionally SSH); do not expose 3000 publicly if you use a proxy.

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
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
docker build -t bike-chat-backend ./backend
docker run -p 3000:3000 -e PORT=3000 bike-chat-backend
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

Set the app’s base URL (e.g. in `src/config.ts` or via env) to your deployed host so it uses that instead of `http://10.0.2.2:3000` in development.

---

## Summary

| Component        | Role                                                                 |
|-----------------|----------------------------------------------------------------------|
| **POST /presence** | Update rider location and mode; stored in memory with 90 s TTL.     |
| **GET /presence/channel** | Return shared channel id when ≥2 riders in same geohash/mode.       |
| **Presence store** | In-memory map + geohash; pruned every 30 s.                         |
| **WebSocket /ws**  | Join channel by `channelId`/`riderId`; relay offer/answer/ice.       |
| **Single process** | One port (default 3000) for HTTP and WS.                            |

**Best way to run a deployed version:** Run the compiled app (`npm run build && npm start`) on a **single, long-running host** (VPS, PaaS, or container), put a **reverse proxy** in front for HTTPS/WSS, and point the mobile app at that base URL.
