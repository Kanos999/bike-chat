# Bike Chat MVP: Current State Analysis and Deployment Plan

## Updated implementation status

This update now includes a concrete **Supabase integration path** for authorization, while keeping the simple shared token fallback for local testing.

### ✅ Implemented in this change

1. **Audio/session resiliency improved (without requiring headset button controls)**
   - Voice WebSocket auth token support added in both real voice modules.
   - Ride start flow has guarded startup with rollback on failure, reducing partial-start broken states.

2. **Channel stability improved**
   - Backend channel IDs use **stable geohash cell IDs** (`channel-<geohash>`) instead of rider-set-derived IDs, reducing churn when nearby membership fluctuates.

3. **Presence durability improved**
   - Presence store supports **optional file-backed snapshots** (`PRESENCE_SNAPSHOT_PATH`) so state can survive process restart in simple deployments.

4. **Config safety improved**
   - Client dev base URL default uses Android emulator-safe `http://10.0.2.2:3000` instead of a hardcoded LAN IP.
   - Client supports global auth token wiring through `__BikeChatAuthToken` and `__BikeChatSupabaseAccessToken`.

5. **Authorization added (Supabase-enabled MVP)**
   - Backend supports optional shared bearer token auth with `AUTH_TOKEN`.
   - Backend also supports **Supabase access token validation** using:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
   - REST endpoints require bearer token when auth is configured.
   - WebSocket signalling requires `token` query param when auth is configured.

6. **Backend operability improved**
   - Added `/healthz` and `/readyz` endpoints.

7. **Test depth improved**
   - Added backend tests for stable channel assignment behavior and ride-mode compatibility.

---

## Deployment plan (revised)

### Phase 1 (now)
- Deploy backend with:
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` (preferred),
  - optional `AUTH_TOKEN` fallback for controlled internal testing,
  - optional `PRESENCE_SNAPSHOT_PATH=/data/presence.json`,
  - HTTPS/WSS via reverse proxy,
  - health checks on `/healthz` and `/readyz`.

### Phase 2
- Add user-to-rider mapping and per-user authorization checks.
- Introduce rate limits and abuse protection for REST + WS joins.

### Phase 3
- Replace file-backed presence with managed Redis for multi-instance scale.
- Add full signalling/session metrics and alerting.
