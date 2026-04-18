# HookEm Hacks 2026

A multiplayer body-detection game built for HookEm Hacks 2026. Players use their body as a controller via webcam, competing in a 3D environment with real-time score tracking.

## Tech Stack

- **Next.js** — frontend & backend
- **Supabase** — database & multiplayer (Realtime)
- **MediaPipe** — body detection via webcam
- **React Three Fiber** — 3D world rendering
- **Gemini API** — multimodal video search

## Team Links

- [WEBSITE](https://body-detection-game.vercel.app/)
- [Figma Plan](https://www.figma.com/board/XlKrQl0G165hF4V65BiNwI/HookemHacks?node-id=0-1&p=f&t=5tGlqyDiFWcEuPeS-0)
- [Hookem Credits](https://docs.google.com/document/d/1SyaQV4DvA0hYOQQOh-pW71v3mghBt8b-85yjcTLYRGU/edit?pli=1&tab=t.z9vxi6yg3hwc#heading=h.teajc0rms7db)
- [Hookem Website](https://www.hookemhacks.com/)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Supabase setup

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

These must also be set in Vercel (Project → Settings → Environment Variables) — `NEXT_PUBLIC_*` vars are inlined at build time, so a Vercel deploy without them will fail to prerender any page that touches the Supabase client.

Run the migration in `supabase/migrations/001_rooms.sql` against your Supabase project (SQL editor, or `supabase db push`). It provisions:

- `rooms(id, code, host_id, status, max_players, created_at)` — one row per game session, `code` is a 4-letter UNIQUE shareable word
- `room_players(room_id, player_id, joined_at)` — membership table with `UNIQUE(room_id, player_id)` for idempotent joins
- Cleanup helper for finished / stale-waiting rooms

## Multiplayer

### Architecture

Two cooperating layers:

1. **Room lifecycle** — Supabase Postgres. Rooms and members are persisted rows. Code collisions are retried automatically; joins are idempotent; host-only transitions are enforced in SQL (`startGame` updates only when `host_id` matches and status is `waiting`).
2. **Realtime game channel** — Supabase Realtime broadcast + presence, one channel per room (`room:{roomId}`). Presence is keyed by `playerId` so duplicate connections (StrictMode remounts, reconnects) collapse to one player in the UI.

Source of truth split: the DB owns *who is in the room and what state it's in*; the channel owns *what's happening this second*. Nothing in the realtime channel is durable — everything that needs to survive a refresh goes through `roomService`.

### What's implemented

End-to-end room flow wired into the real UI:

- `/` → `/create` calls `createRoom(playerId)` and displays the returned 4-letter code
- `/join` calls `joinRoom(code, playerId)` with inline validation for "not found / already started / full"
- `/lobby/[code]` fetches the room by code, shows live presence as the player list, host sees a Start button (disabled until 2 players), non-host sees "Waiting for host…"
- Host clicks Start → `startGame()` transitions the room row to `active` and broadcasts a `game_start` event; both clients navigate to `/game/[code]` together
- Leave calls `leaveRoom()`; when the last player leaves, the room is marked `finished`
- Identity persists across pages: `playerId` in localStorage, `playerName` in sessionStorage (see `hooks/useIdentity.ts`)

### Pose data sync — planned

The transport is in place but not yet wired into the body-tracking loop. Shape and rate were chosen to balance fidelity (enough to render a remote skeleton) against bandwidth (well under Supabase's 60 msgs/sec cap).

**Wire format (`PoseSnapshot` in `lib/multiplayer/types.ts`):**

- `arms` — 6 MediaPipe landmarks: shoulders, elbows, wrists (or `null` if pose lost that frame)
- `leftHand` / `rightHand` — 21 landmarks per hand, `null` when not detected
- `armStates` / `handStates` — pre-derived metrics (`elbowAngle`, `swingSpeed`, `raisedHeight`, `gesture`, `pinchDistance`) so receivers don't re-compute

~2 KB per snapshot, sent at ~15 Hz → ~30 KB/s per player. Coordinates stay normalized (0–1 image space); the receiver maps them into its own scene.

**What's prepared (transport only, no sender yet):**

- `broadcastPoseSnapshot()` + `onPoseSnapshot` on `GameChannel` and `useGameChannel`
- `buildPoseSnapshot(raw, body)` in `lib/multiplayer/poseSnapshot.ts` — packs a MediaPipe frame + `BodyTrackingState` into the wire shape

**Integration steps still to do:**

1. Expose raw MediaPipe frames from `useBodyDetectionProvider` (either an `onFrame` callback prop or a shared ref/source), so the game page can read them without re-running the tracking loop
2. Add a throttled sender to `/game/[code]` that calls `broadcastPoseSnapshot(buildPoseSnapshot(raw, body))` at ~15 Hz
3. Add a remote-pose store keyed by `playerId` that's fed by `onPoseSnapshot`, with staleness eviction (drop snapshots older than ~500 ms)
4. Render remote players from that store — arm skeleton + hand landmarks mirroring the debug canvas style, placed in the game scene
5. Drive game logic (hit detection, score) off the received `armStates` / `handStates` rather than the visual landmarks, so server-authoritative checks can be added later without rewriting rendering

### Out of scope for now

- **In-game attack / hit sync** — `AttackEvent` and `HitEvent` types exist on the channel but the game screen is still using mock data for combat. Will follow once pose sync is in and we can detect swings from `armStates.swingSpeed`.
- **Server-authoritative validation** — hits are currently planned as peer-broadcast. If cheating becomes a concern, move hit resolution into a Supabase Edge Function that reads both players' recent pose snapshots.
- **More than 2 players** — DB allows `max_players` per room but UI and channel load are tuned for 1v1.

### Testing locally

`playerId` lives in `localStorage`, so two tabs in the same browser profile share identity and collapse into one presence entry. To test 2-player flows on one machine, open the second client in an Incognito window or a different browser profile.

