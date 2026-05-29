# Deploying the Bike Chat Backend

Follow these steps to get the backend running in production.

---

## 1. Build and run locally (sanity check)

```bash
cd backend
npm ci
npm run build
PORT=3001 npm start
```

You should see: `API + WebSocket listening on http://localhost:3001`.  
Test: `curl -X POST http://localhost:3001/presence -H "Content-Type: application/json" -d '{"riderId":"r1","lat":0,"lon":0}'` → 204.

---

## 2. Choose a host

- **PaaS (easiest):** Railway, Render, Fly.io, etc. → skip to step 4.
- **VPS (e.g. DigitalOcean, Linode, EC2):** You’ll need Node 18+ and a process manager (step 5).

---

## 3. Set environment

| Variable | Description |
|----------|-------------|
| `PORT` | Port the server listens on (default `3001`). Many PaaS set this automatically. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Enable Supabase-issued bearer-token auth on `/presence`, `/presence/channel`, `/ws`, and `/presence/subscribe`. **Set both before exposing the backend to the internet** — otherwise the server runs in `authMode: "none"` and anyone can write presence or open signalling sockets. |
| `AUTH_TOKEN` | Alternative to Supabase: a single shared bearer token. Useful for closed deployments. If set alongside Supabase, either accepted token authorises. |
| `PRESENCE_SNAPSHOT_PATH` | Optional. Path to a JSON file the in-memory presence store flushes to on writes — survives restarts. Point at a path on a persistent volume. |
| `REQUEST_LOGS`, `WS_LOGS` | Default on. Set to `0` (or `false`/`off`) to silence per-request HTTP/WS logs in production. |

Confirm auth is wired by hitting `/readyz` on the deployed host — it returns `{"authMode":"supabase"}` (or `"shared-token"`) when correctly configured.

---

## 4. Deploy (pick one)

### A. Fly.io (recommended)

Fly.io fits this backend well: native long-lived WebSocket support, auto-TLS, one small VM is enough (~$3–5/mo for an MVP), and you can pick a region close to your users. The repo already contains a working `backend/Dockerfile` and `backend/fly.toml`.

1. **Install flyctl & sign in**
   ```bash
   brew install flyctl      # macOS — or: curl -L https://fly.io/install.sh | sh
   fly auth signup          # or `fly auth login`
   ```

2. **Launch the app** (run from `backend/`)
   ```bash
   cd backend
   fly launch --no-deploy
   ```
   When prompted:
   - **App name** — pick one; flyctl will update `app =` in `fly.toml`.
   - **Region** — confirm or change `primary_region` in `fly.toml` to a region close to your users.
   - **Postgres / Redis / Sentry** — no.
   - **Use existing `fly.toml`?** — yes.

3. **Set auth secrets** (do this *before* the first deploy, otherwise the API is open)
   ```bash
   fly secrets set \
     SUPABASE_URL='https://<your-project>.supabase.co' \
     SUPABASE_ANON_KEY='<your-anon-key>'
   # …or a shared token:
   # fly secrets set AUTH_TOKEN='a-long-random-string'
   ```

4. **(Optional) Persistent presence**
   ```bash
   fly volumes create presence_data --size 1 --region <your-region>
   ```
   Then uncomment the `[mounts]` block and the `PRESENCE_SNAPSHOT_PATH` env line in `fly.toml`.

5. **Deploy**
   ```bash
   fly deploy
   ```

6. **Verify**
   ```bash
   fly status                                # 1 machine, healthy
   curl https://<app>.fly.dev/healthz        # {"ok":true}
   curl https://<app>.fly.dev/readyz         # confirms authMode
   fly logs                                  # tail to watch traffic
   ```

The mobile app should target `https://<app>.fly.dev` (see step 6 of this doc) — the client's WebSocket URLs are derived from that base by swapping the scheme, so signalling and `/presence/subscribe` automatically go over `wss://`.

### B. PaaS (Railway / Render)

1. Connect your repo.
2. Set **root** or **build directory** to `backend`.
3. **Build command:** `npm ci && npm run build`
4. **Start command:** `npm start`
5. Set `PORT` if the platform doesn’t inject it (e.g. Render uses `PORT` automatically).
6. Deploy. The service will get a URL like `https://your-app.onrender.com`.

### B. Docker (any host or PaaS)

From the **repo root**:

```bash
docker build -f backend/Dockerfile -t bike-chat-backend ./backend
docker run -p 3001:3001 -e PORT=3001 --name bike-chat-backend -d bike-chat-backend
```

To use a different port (e.g. 8080):

```bash
docker run -p 8080:8080 -e PORT=8080 --name bike-chat-backend -d bike-chat-backend
```

### C. VPS (bare Node + process manager)

1. Copy the `backend/` folder to the server (e.g. `/var/www/bike-chat-backend`).
2. On the server:
   ```bash
   cd /var/www/bike-chat-backend
   npm ci
   npm run build
   ```
3. Run under **PM2** (recommended):
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name bike-chat-backend
   pm2 save && pm2 startup
   ```
4. Or run under **systemd**: create `/etc/systemd/system/bike-chat-backend.service`:
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
   Then:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable bike-chat-backend
   sudo systemctl start bike-chat-backend
   ```

---

## 5. HTTPS and WebSocket (production)

- **PaaS:** Use the provided HTTPS URL; WebSocket works over `wss://` on the same host.
- **VPS / Docker:** Put a reverse proxy (Nginx or Caddy) in front:
  - Listen on 80/443 and terminate TLS.
   - Proxy HTTP and WebSocket to `http://localhost:3001` (or the port the app uses).
  - WebSocket: enable `Upgrade` and `Connection` headers; proxy `GET /ws` to the same backend.

Example Nginx location (inside a `server` block with `ssl` already configured):

```nginx
location / {
   proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

- **Firewall:** Open 80 and 443 (and SSH if needed). Do **not** expose 3001 to the internet if you use a proxy.

---

## 6. Point the app at the backend

In the React Native app, set the API base URL to your deployed host, e.g.:

- `https://your-app.onrender.com`
- `https://api.yourdomain.com`

Update `src/config.ts` (or use env) so `apiBaseUrl` and `wsBaseUrl` use this host. The app will then call:

- `POST https://your-host/presence`
- `GET https://your-host/presence/channel?riderId=...`
- `wss://your-host/ws?channelId=...&riderId=...`

---

## Quick reference

| Step              | Action |
|-------------------|--------|
| Build             | `npm ci && npm run build` |
| Run               | `npm start` (or `PORT=3001 npm start`) |
| Docker build      | `docker build -f backend/Dockerfile -t bike-chat-backend ./backend` |
| Docker run        | `docker run -p 3001:3001 -e PORT=3001 -d bike-chat-backend` |
| Health check      | `curl -s -o /dev/null -w "%{http_code}" https://your-host/presence/channel?riderId=test` → 200 |
