# Chandrappan Chettante Chayakkada

A cozy 3D Kerala tea-shop game set in rainy Munnar, built with Three.js, TypeScript and Vite. No external assets: every model, texture and sound is generated in code.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Multiplayer works locally out of the box: open a second browser window, create a room in one, join with the code in the other.

## Multiplayer (up to 4 cooks) with proximity voice

- **Play with friends** on the title screen → **Create a room** gives a 4-letter code and an invite link (`?room=CODE`).
- The host sets up the shop; everyone cooks and serves in the same chayakkada. Each player has their own hands and their own cooking station (two people can't use the same station at once).
- **Voice:** press **T** (or the 🎙 button) to turn your mic on. Voices come from each player's position and fade out over about 10 m, so walk up to someone to talk and wander off to the bus stop for privacy. Headphones avoid echo.
- Walk anywhere around the shop, yard, annex and bus stop with **WASD**.

### How it works

- **Game and voice are peer-to-peer (WebRTC).** The host's browser runs the shop; guests send their actions (cook, pick up, serve) and the host broadcasts snapshots ~12×/s. Audio goes directly between players.
- **`api/signal.ts`** is a tiny Vercel Function used only to introduce players (exchanging WebRTC offers/answers/ICE through short-lived mailboxes). Once a guest is connected to the host, further signaling is relayed over the host's data channel, so the server is quiet during play.
- In development the same handler runs inside the Vite dev server (`vite.config.ts`) with an in-memory store.

### Deploying on Vercel

1. **Add a Redis store** so rooms work across serverless instances: in the Vercel dashboard open your project → **Storage** (or **Marketplace**) → **Upstash for Redis** → create and connect it to this project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) automatically. The free tier is plenty: the server is only used while someone joins.
   - Without it the function falls back to memory, which only works when one warm instance happens to serve everyone. The host lobby shows a warning in that case.
2. **(Optional) TURN server** for players on strict networks (some offices, mobile carriers) where direct peer-to-peer fails. Set:
   - `TURN_URLS` – comma-separated, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349`
   - `TURN_USERNAME`, `TURN_CREDENTIAL`
3. Redeploy. The build command stays `npm run build`; the function in `api/` is picked up automatically.

### Limits and notes

- Max 4 players per room (a full mesh keeps voice latency low).
- The host's tab runs the game: if the host leaves, the room closes for everyone. A host tab in the background keeps ticking at a lower rate.
- Microphones need HTTPS (Vercel provides it) or `localhost`.
- Upgrades and the next day are chosen by the host; the host panel (**H**) is host-only.

## Controls

| Key | Action |
| --- | --- |
| Drag / WASD | Look / walk (first person) |
| 1 / 2 | Look at the counter / kitchen |
| V | Switch to the overview camera |
| T | Microphone on/off (multiplayer) |
| P | Pause (host / solo) |
| M | Mute game sounds |
| H | Host controls |
| Esc | Close panel / put food down |
