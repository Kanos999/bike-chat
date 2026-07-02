# TURN relay for Bike Chat

Two riders on cellular are almost always behind carrier-grade NAT, where STUN-only
WebRTC can't open a direct path and voice silently fails to connect. A TURN server
relays the audio when a direct connection isn't possible.

The app already fetches ICE servers (STUN + **ephemeral** TURN credentials) from the
backend's authed `GET /turn-credentials` endpoint. You only need to (1) run a TURN
server and (2) point the backend at it. No client rebuild is required to turn TURN
on — it's driven entirely by backend env vars.

## 1. Run coturn on a VM with a public IP

TURN needs a public IP and a small range of open UDP relay ports. A tiny cloud VM
(Hetzner / DigitalOcean / a Fly.io Machine with a dedicated IPv4) is the reliable
path — plain PaaS HTTP hosting won't work because of the UDP relay ports.

1. Point a DNS record (e.g. `turn.yourdomain.com`) at the VM's public IP.
2. Copy `turnserver.conf` to the VM and edit:
   - `external-ip=` → the VM's public IP (`PUBLIC/PRIVATE` if the NIC holds a private address).
   - `static-auth-secret=` → a long random secret (generate: `openssl rand -hex 32`).
   - `realm=` → `turn.yourdomain.com`.
3. Open the firewall / security group: **3478/udp**, **3478/tcp**, **5349/tcp**
   (if using TLS), and **49160-49200/udp** (the relay range).
4. Run it with Docker:

   ```bash
   docker run -d --name coturn --restart unless-stopped --network host \
     -v "$PWD/turnserver.conf:/etc/coturn/turnserver.conf:ro" \
     coturn/coturn -c /etc/coturn/turnserver.conf
   ```

   `--network host` is important so coturn can use the relay port range directly.

## 2. Point the backend at it

Set these on the backend (must match the coturn config). For the Fly.io deployment:

```bash
cd ../backend
fly secrets set \
  TURN_SECRET="<same value as static-auth-secret>" \
  TURN_URLS="turn:turn.yourdomain.com:3478?transport=udp,turn:turn.yourdomain.com:3478?transport=tcp,turns:turn.yourdomain.com:5349?transport=tcp"
```

`TURN_URLS` is a comma-separated list. Drop the `turns:` entry if you didn't set up
TLS certs. Optional: `STUN_URLS` (defaults to Google STUN), `TURN_TTL_SECONDS`
(default 86400).

Verify the backend now reports TURN is on:

```bash
curl -s https://bike-chat.fly.dev/readyz
# => {"ok":true,...,"turn":"enabled"}
```

## 3. Verify the relay actually works

Before the ride, confirm TURN allocation succeeds with the Trickle ICE tester:
<https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>

- Get credentials: `curl -s -H "Authorization: Bearer <supabase-access-token>" \
  "https://bike-chat.fly.dev/turn-credentials?riderId=test"` — copy a `turn:` URL,
  `username`, `credential` into the tester.
- Add the server and "Gather candidates". You should see candidates of type
  **`relay`**. If you only see `host`/`srflx` and no `relay`, TURN isn't reachable
  (check firewall/relay ports and `external-ip`).

## Managed alternative

If you'd rather not run a server, a managed TURN provider that supports the same
`static-auth-secret` HMAC scheme (e.g. Metered, or Cloudflare Realtime TURN) can
drop straight into `TURN_SECRET` / `TURN_URLS` with no code change. Providers with a
bespoke credentials API would need a small tweak to `backend/src/turn.ts`.
