# HookEm Hacks 2026 — Beach Box

A 2-player webcam-controlled fighting game. Players use their body as a
controller via MediaPipe pose + hand tracking; matches are rendered in a 3D
arena and synced peer-to-peer over Supabase Realtime. Clips of every match
are recorded, embedded with Gemini, and made searchable with natural-language
queries.

**[Play it →](https://body-detection-game.vercel.app/)**

## Tech stack

- **Next.js 16** — app + API routes
- **Supabase** — Postgres (rooms, matches, clips, player_records) + Realtime + Storage
- **MediaPipe** (`@mediapipe/tasks-vision`) — in-browser pose + hand landmarkers
- **React Three Fiber** — 3D arena, avatars, collisions
- **Zustand** — client-side state (pose, game, calibration)
- **Gemini 2.5** — clip embeddings (video input), captioning, query-plan generation
- **Tailwind v4**

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...     # server-only
GEMINI_API_KEY=...                # server-only
EMBEDDER_WEBHOOK_SECRET=...       # server-only
```

`NEXT_PUBLIC_*` vars are inlined at build time — a Vercel deploy without them
will fail to prerender pages that touch the Supabase client. Set them in the
Vercel project settings before deploying.

### Database

Apply migrations in order (Supabase SQL editor or `supabase db push`):

```
supabase/migrations/
  001_rooms.sql               rooms + room_players + cleanup helper
  002_room_autoclose.sql      trigger that closes empty rooms
  003_match_search.sql        matches + match_events + match_summaries
  004_search_hybrid.sql       search_clips_hybrid RPC (pgvector)
  005_clips_match_nullable.sql
  006_vector_1536.sql         embedding dim = 1536
  007_player_records.sql      career wins/losses
```

Also required:

1. A Supabase Storage bucket named `clips`.
2. A database webhook on `clips` INSERT → `POST {your_url}/api/embedder/tick`
   with header `x-webhook-secret: $EMBEDDER_WEBHOOK_SECRET`.
3. A cron (Vercel Cron every 5 min is fine) hitting
   `POST /api/embedder/sweep` with the same header — resets clips stuck in
   `processing` for >10 min.

## How it works

### Rooms

- `/` — home
- `/create` — `createRoom(playerId)` inserts a `rooms` row with a random
  4-letter code; redirects to `/lobby/[code]`
- `/join` — `joinRoom(code, playerId)` with inline validation for "not found /
  already started / full"
- `/lobby/[code]` — live presence-driven player list; host sees Start
  (disabled until 2 players), non-host sees "Waiting for host…"
- Host presses Start → `startGame()` flips the row to `active` and broadcasts
  `game_start`; both clients navigate to `/game/[code]`
- Leave → `leaveRoom()`; last player leaving marks the room `finished`

Identity persists locally: `playerId` in localStorage, `playerName` in
sessionStorage (`hooks/useIdentity.ts`).

### In-match pose sync

```
webcam → MediaPipe landmarkers
  → lib/rigging → humanoid bone rotations
  → usePoseStore (self slot)
    ├─→ local Avatar renders immediately
    └─→ usePoseSync broadcasts rig @ 12 Hz → peer's usePoseStore (remote slot)
```

Each `PoseSnapshot` carries a pre-solved `rig` (so the receiver doesn't
re-run Kalidokit), optional raw arms/hands, and guard flags. ~2 KB per
snapshot at 12 Hz ≈ 24 KB/s per player, well under Supabase Realtime's 60
msg/sec cap.

Hits, attacks, and game events flow over the same channel. Damage is applied
locally on both sides (peer-broadcast trust model).

See [`lib/multiplayer/types.ts`](lib/multiplayer/types.ts) for the wire
format and [`hooks/useGameChannel.ts`](hooks/useGameChannel.ts) for the
subscribe / broadcast surface.

### Combat feedback

- **HP bars** — opponent top-right, you bottom-left, fighting-game style.
- **Camera shake** — direct unguarded hits on you wobble the camera in place
  and settle back to the first-person POV.
- **Guard indicators** — black shield bottom-center when *you* guard, red
  shield floating over the *opponent's* head when they guard.
- **SFX** — `public/sound/hit.mp3` plays on each unguarded landing; `end.mp3`
  plays once when HP hits zero. Global mute toggle lives on `/world`.

### Lobby

Pick one of six avatar colors by clicking your avatar circle — the dropdown
broadcasts your choice to the peer via a dedicated tint event (presence-only
updates don't reliably re-sync on Supabase Realtime, so we use a broadcast
overlay). Both players' colors persist to `localStorage`.

### Clip pipeline

During a match (`lib/ingestion/useIngestion.ts`):

1. `POST /api/matches/start` opens a `matches` row.
2. A `MediaRecorder` emits **5-second `.webm` chunks**; each is uploaded to
   the `clips` bucket and a `clips` row is inserted with
   `embedding_status='pending'` (`POST /api/clips/upload`).
3. Queued action events (punches, dodges, kicks, blocks) are flushed every
   2.5 s (`POST /api/match-events`).

A Supabase webhook fires `POST /api/embedder/tick` per inserted clip. That
handler claims the row atomically (`pending` → `processing`), skips clips
with zero detected events, embeds the `.webm` through Gemini's
`embedContent` endpoint with `outputDimensionality=1536`, normalizes, and
writes back `embedding_status='ready'`. The heavy work runs in `after()` so
the webhook returns fast.

`POST /api/matches/end` closes the match row and calls the
`write_match_summary` RPC to aggregate `match_events` into per-player
totals.

### Search

`POST /api/query` takes a natural-language question and:

1. **Plans** with Gemini 2.5 Flash → one of three Zod-validated shapes:
   - `aggregate` — "how many punches did I throw today?"
   - `retrieve` — "clips where I threw 10+ punches"
   - `hybrid` — "clips of amazing combos" (structured filter + vector similarity)
2. **Dispatches** against Postgres. Hybrid queries call the
   `search_clips_hybrid` pgvector RPC and return signed clip URLs.

See [`lib/search/index.ts`](lib/search/index.ts).

### Career

`GET /api/career/[playerId]` returns wins/losses/matchesPlayed/winRate,
lazily creating the row on first read. Rendered at `/career`.

## Repo layout

```
app/
  api/                      Route handlers
  (auth)/login/             Auth scaffold (not fully wired)
  career/                   Career page
  create/, join/            Room entry
  lobby/[roomId]/           Lobby
  game/[roomId]/            Match page (calibration → combat → results)
  cv-debug/, punch-test/,
  recorder-test/, test-multiplayer/,
  gestures/, world/         Dev-only test benches (not linked from nav)
components/                 detection, game, pages, scenery, search, shared, ui
hooks/                      useBodyDetection, useGameChannel, useIdentity,
                            usePoseSync, usePunchDetector, useRoom
lib/                        combat, detection, game, ingestion, mediapipe,
                            multiplayer, recorder, rigging, search, store,
                            supabase, gemini.ts
supabase/migrations/        Numbered .sql migrations
types/                      Cross-track shared types
```

## Scripts

```bash
npm run dev                 # Next dev server on :3000
npm run build
npm run start
npm run lint
npm run test:e2e            # end-to-end ingestion + embedding smoke test
npm run test:e2e:cleanup    # teardown test data
```

## Testing locally with two players

`playerId` lives in localStorage, so two tabs in the same profile share
identity and collapse to one presence entry. For a real 2-player test:

- Open the second client in an **Incognito window**, or
- Use a different browser profile, or
- Open on two different machines on the same network.

Dev-only routes (cv-debug, punch-test, recorder-test, test-multiplayer,
gestures, world) are reachable by URL but not linked anywhere. Use them as
scratch space. `/world` in particular has:

- **Debug · punches** button — opens the calibration panel with sliders,
  guard / punch counts, reset-camera, and hide-body toggles.
- **Sound · on/off** button — global mute gate for the hit/end SFX (also
  affects `/game` since the flag is one shared Zustand store).

## Out of scope (for now)

- **Server-authoritative hit validation** — all combat resolution is
  peer-broadcast. If cheating becomes an issue, move hit resolution into a
  Supabase Edge Function that reads both players' recent pose snapshots.
- **More than 2 players per room** — the DB `max_players` column supports it,
  but the UI and channel load are tuned for 1v1.
- **Full auth** — `(auth)/login` is a scaffold; `playerId` is still a
  randomly-generated localStorage string.
- **Montage / commentary generation** — stubs exist at
  `/api/generate/montage` and `/api/generate/commentary` but return empty.

## Team links

- [Live demo](https://body-detection-game.vercel.app/)
- [Figma plan](https://www.figma.com/board/XlKrQl0G165hF4V65BiNwI/HookemHacks?node-id=0-1&p=f&t=5tGlqyDiFWcEuPeS-0)
- [Hookem Credits](https://docs.google.com/document/d/1SyaQV4DvA0hYOQQOh-pW71v3mghBt8b-85yjcTLYRGU/edit?pli=1&tab=t.z9vxi6yg3hwc#heading=h.teajc0rms7db)
- [Hookem Hacks website](https://www.hookemhacks.com/)

For Claude Code sessions: see [CLAUDE.md](CLAUDE.md) for architectural
context, conventions, and known gotchas.
