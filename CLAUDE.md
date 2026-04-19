# CLAUDE.md — project context for Claude Code

Orientation for AI coding sessions on this repo. Read this before making
non-trivial changes.

---

## What this is

**Kaiju Cove** — a 2-player webcam-controlled fighting game built for HookEm
Hacks 2026. Players use their body (via MediaPipe pose + hand tracking) as the
controller. No keyboard, no mouse in-game. Matches are played through a 3D
arena rendered with React Three Fiber, and Supabase Realtime syncs pose data
between the two clients.

Secondary feature: match recordings are embedded with Gemini and become
searchable ("show me a clip where I threw a big hook") via a natural-language
query bar.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | SSR-friendly, API routes co-located |
| Language | TypeScript strict | Type safety across client/server boundary |
| State | Zustand (`lib/store/`) | Small, no-provider, fine-grained subscriptions |
| 3D | `@react-three/fiber` + `drei` + `three` | Canonical React+Three stack |
| CV | `@mediapipe/tasks-vision` (Pose + Hand landmarkers) | Runs in-browser, no server GPU |
| DB | Supabase Postgres | Rooms, matches, clips, player records |
| Realtime | Supabase Realtime (broadcast + presence) | One channel per room, keyed by `playerId` |
| Storage | Supabase Storage, bucket `clips` | `.webm` chunks uploaded during a match |
| AI | Gemini 2.5 (`@google/genai`) | Video embeddings, caption gen, query planning |
| Styling | Tailwind v4 + scoped `<style>` blocks | Tailwind for layout, inline styles for page-specific visuals |

Legacy `@google/generative-ai` is also in `package.json` — only
`lib/generation/index.ts` uses it, the rest uses `@google/genai`. Consider
migrating when touching that file.

---

## Repo layout

```
app/
  (auth)/login/       Auth flow (stub — not wired to actual auth yet)
  api/                Route handlers (see "API routes" below)
  career/             Public career page (wins/losses per playerId)
  create/, join/      Room creation + join-by-code entry points
  lobby/[roomId]/     Pre-game lobby, host gates the Start button
  game/[roomId]/      The match itself — calibration → combat → results
  cv-debug/, punch-test/, recorder-test/,
  test-multiplayer/, gestures/, world/   Dev-only test benches

components/
  detection/    BodyDetector, PunchDetector, CalibrateGuardPanel, GuardVignette
                (black shield bottom-center when local player guards)
  game/         Avatar, stage, HPBars, collision, scene props,
                OpponentGuardBadge (red shield over opponent's head when they guard)
  pages/        Page-level compositions (Calibration, GameScreen, Lobby, Results)
  scenery/      Backdrop
  search/       QueryBar + ResultsGrid (clip-search UI)
  shared/       Constants and types used across many components
  ui/           Tweaks (dev knobs)

hooks/
  useBodyDetection.ts    MediaPipe loop + frame publishing
  useGameChannel.ts      Room realtime channel subscribe + broadcast helpers
  useIdentity.ts         Persistent playerId (localStorage) + playerName (sessionStorage)
  usePoseSync.ts         Pulls rig from poseStore, broadcasts at 12 Hz
  usePunchDetector.ts    Local punch classifier
  useRoom.ts             Room CRUD wrapper around roomService

lib/
  combat/        Damage math (MAX_HP, PUNCH_DAMAGE_BASE, guard multiplier)
  detection/     Punch geometry (shared by local + remote)
  embeddings/    (stub placeholder)
  game/          Scoring, sport-style layout helpers, avatarColors (6-color picker palette)
  generation/    Gemini text gen (uses @google/generative-ai — legacy)
  ingestion/     Match lifecycle + chunk upload + event tracker
  mediapipe/     Pose + Hand landmarker creation
  multiplayer/   gameChannel, roomService, poseSnapshot, hitBroadcaster, types
  recorder/      MediaRecorder wrapper that emits 5-second .webm chunks
  recording/     (stub placeholder)
  rigging/       Landmarks → humanoid bone rotations, applyPunchKeyframe (triangle-IK)
  search/        Gemini query planner + dispatcher (aggregate / retrieve / hybrid)
  sound/         SFX player (hit/end cues) with pooled <audio> elements
  store/         Zustand stores — one file each:
                 game, pose, armSim, punchCalibration, calibrationSignal,
                 remoteGuard, camera (reset + shake), viewSettings (hide-body),
                 sound (global mute)
  supabase/      client.ts (browser) + server.ts (SSR) + realtime helpers
  gemini.ts      Shared Gemini client + MODELS map + normalize()

public/sound/    hit.mp3 + end.mp3 — fetched via /sound/*.mp3 at runtime

supabase/migrations/   Numbered SQL files — see "Database" below
types/                 Shared cross-track types (PoseLandmark, RigRotations, etc.)
scripts/               Dev scripts (e2e pipeline test)
```

---

## Architectural pillars

### 1. Rooms and realtime (multiplayer)

Two cooperating layers — **do not cross them**:

- **Postgres** owns durable state: who's in the room, room status
  (`waiting`/`active`/`finished`), host identity. Mutations go through
  `lib/multiplayer/roomService.ts`. Host-only transitions are enforced in SQL.
- **Realtime channel** (`room:{roomId}`) owns ephemeral per-tick state:
  presence (player list), pose snapshots, hits, game events. Nothing here is
  durable — if it needs to survive a refresh, it goes through the DB.

Presence is keyed by `playerId` so a StrictMode remount or a tab reconnect
collapses back to one player. The channel auto-reconnects with exponential
backoff (500 ms → 8 s cap). `useGameChannel` adds a kick-on-peer-arrival loop
to handle the "fast side subscribed before slow side booted MediaPipe" case.

**Local identity split across two slots:** `SELF_PLAYER_ID` and
`REMOTE_PLAYER_ID` (both in `types/index.ts`). These are perspective-local
constants — when a hit broadcast arrives, we flip the `attackerId`/`targetId`
because their "remote" is our "self."

**Game events** sent over the channel (`GameEvent.type` in
`lib/multiplayer/types.ts`):
- `game_start` — host broadcasts on Start button; joiners route to `/game/[code]`.
- `game_end` — any client broadcasts on Leave; everyone returns to `/lobby`.
- `guard_ready` — each client broadcasts once its 3-2-1 calibration completes;
  the game-screen loading overlay waits on the peer's `guard_ready` before
  arming combat so one side can't start punching a still-calibrating opponent.
- `rematch` — "Play again" broadcasts; both sides reset HP via
  `useGameStore.reset()` and bump `useCalibrationSignalStore.requestTick` to
  re-run the 3-2-1 countdown.

**Tint (avatar color) sync** is belt-and-braces. Presence carries the tint
but Supabase Realtime does **not** reliably fire `sync` on updates to an
existing presence key, so `setTint` also fires a dedicated `"tint"`
broadcast event. `useGameChannel` maintains a `tintOverrides: Record<playerId,
tint>` map merged into the returned `players` array via `useMemo`. Pose
snapshots piggy-back `tint` too for a 12 Hz redundancy channel. Consumers
keep reading `players[i].tint` — the overlay is transparent to them.

### 2. Pose pipeline (CV + sync)

```
webcam → MediaPipe pose+hand landmarkers
  → lib/rigging  → humanoid bone rotations
  → usePoseStore (Zustand, keyed by playerId)
    ├─→ Avatar renderer (R3F) reads this directly
    └─→ usePoseSync broadcasts own rig at 12 Hz → peer
                                                 → their usePoseStore under REMOTE_PLAYER_ID
```

Wire format is `PoseSnapshot` in `lib/multiplayer/types.ts`. Senders broadcast
a pre-solved `rig` (not raw landmarks) so receivers don't re-run Kalidokit.
Receivers optionally get raw arms/hands if the sender includes them, for
future client-side resolve/smoothing experiments.

`WireLandmark` and `PoseLandmark` have identical shapes but live in separate
files intentionally — the multiplayer types are meant to be dependency-free.

### 3. Ingestion + embedding + search

During a match, **`useIngestion`** does three things in parallel:
1. Opens a `matches` row (`POST /api/matches/start`).
2. Runs a `MediaRecorder` that emits 5-second `.webm` chunks; each chunk is
   uploaded to Supabase Storage and gets a `clips` row
   (`POST /api/clips/upload`).
3. Flushes queued `ActionEvent`s (punches, dodges, etc.) every 2.5 s
   (`POST /api/match-events`).

Clips insert with `embedding_status='pending'`. A Supabase webhook fires
`POST /api/embedder/tick` per new clip (secured via `x-webhook-secret`
header). That handler:
- Claims the row (`pending` → `processing`).
- Skips if `event_counts` sums to 0.
- Downloads the `.webm`, sends it to Gemini's embedContent endpoint with
  `outputDimensionality=1536`, normalizes, and writes back with
  `embedding_status='ready'`.
- Runs in `after()` so the webhook returns fast.

A cron (`POST /api/embedder/sweep`) resets rows stuck in `processing` for
>10 min back to `pending`.

For dev testing, `POST /api/dev/process-clip` runs the same pipeline without
the webhook-secret check (gated on `NODE_ENV !== 'production'`).

Search is three-shaped (`lib/search/index.ts`):
- **aggregate** — counts/sums over `match_events` or `match_summaries`.
- **retrieve** — structured filter on `clips` (eventType + minCount + playerId + time).
- **hybrid** — structured filter *and* vector similarity via the
  `search_clips_hybrid` Postgres RPC. Used when a query has a fuzzy term
  ("amazing combo", "sloppy").

The route (`POST /api/query`) uses Gemini 2.5 Flash as a planner (system prompt
has examples), validates the plan with Zod, then dispatches.

### 4. Combat feedback (camera + sound + UI cues)

A landed, unguarded hit fires three things in parallel:

- **Camera shake** — `useCameraStore.requestShake()` bumps `shakeTick`;
  `CameraShakeController` inside `<Canvas>` captures the current camera
  position and applies a decaying high-frequency offset for ~380 ms before
  restoring. Only fires when the *target* was ungarded (checked via
  `isTargetInGuard(SELF)` in the game page's `onHit`).
- **Hit SFX** — `playHit()` from `lib/sound/player.ts`. Pooled
  `HTMLAudioElement` (4 slots) so rapid back-to-back hits don't cut each
  other off. Gated on `useSoundStore.enabled` — the /world debug panel has a
  Sound · on/off button.
- **Guard indicators** — black shield (`GuardVignette`) bottom-center when
  the local player is in guard; red shield (`OpponentGuardBadge`, drei
  `<Html>` anchored in world space) over the opponent's head when their
  pose broadcast reports `inGuard` on either hand.

End-of-round plays `playEnd()` once in the HP→outcome effect.

`useCameraStore` also owns a `resetTick` for the "snap back to first-person
POV" button in the debug panel — `CameraController` subscribes and re-seats
the camera at P1's head on each bump.

### 5. Hit-sound routing (why only one side plays per hit)

`applyDamage` is called from two places: `PunchCollisionDetector` (inside
`<Canvas>`, runs in `/game`) and `useArmSimDriver.onPunch` (CV punch
detection, both `/world` and `/game`). If both played the hit cue we'd
double-trigger on every `/game` punch.

Split:
- **`useArmSimDriver.onPunch`** plays the cue *only when
  `broadcastOnHit=false`* — i.e., in `/world`, where no collision detector
  is mounted.
- **`PunchCollisionDetector`** plays the cue when the attacker is `SELF` and
  the hit wasn't guarded — the canonical path in `/game`.
- **Target side** plays the cue in the game page's `onHit` handler when the
  remapped target is `SELF` and local guard is down.

---

## API routes (current state)

Implemented:
- `GET  /api/career/[playerId]` — returns/creates a `player_records` row
- `POST /api/clips/upload` — multipart: `chunk` (Blob) + `meta` (JSON) → inserts `clips` row
- `POST /api/clips/[id]/caption` — generates a 1-sentence Gemini caption, cached on the row
- `POST /api/dev/process-clip` — dev-only embed trigger (403 in prod)
- `POST /api/embedder/sweep` — cron, resets stuck `processing` → `pending`
- `POST /api/embedder/tick` — webhook, embeds one clip via Gemini
- `POST /api/match-events` — batch insert into `match_events`
- `POST /api/matches/start` — insert `matches` row for a room
- `POST /api/matches/end` — close + call `write_match_summary` RPC
- `POST /api/query` — plan + dispatch a natural-language question

Stub (TODO — return empty responses, no callers):
- `POST /api/embeddings`
- `POST /api/generate/commentary`
- `POST /api/generate/montage`
- `POST /api/rooms` (real room creation is client-side via `roomService`)
- `POST /api/score`
- `POST /api/search` (real search is `/api/query`)

When touching a stub, first check whether it should exist at all — most
duplicate features already implemented elsewhere.

---

## Database (Supabase)

Migrations are numbered. Apply in order with `supabase db push` or the SQL
editor:

1. `001_rooms.sql` — `rooms` + `room_players` + cleanup helper
2. `002_room_autoclose.sql` — trigger closing empty rooms
3. `003_match_search.sql` — `matches` + `match_events` + `match_summaries`
4. `004_search_hybrid.sql` — `search_clips_hybrid` RPC (pgvector)
5. `005_clips_match_nullable.sql` — make `clips.match_id` nullable
6. `006_vector_1536.sql` — bump embedding dim to 1536
7. `007_player_records.sql` — career wins/losses

A Supabase storage bucket named `clips` must exist. A database webhook on
`clips` INSERTs should POST to `/api/embedder/tick` with
`x-webhook-secret: $EMBEDDER_WEBHOOK_SECRET`.

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...     # server-only, do NOT expose
GEMINI_API_KEY=...                # server-only
EMBEDDER_WEBHOOK_SECRET=...       # server-only, matches Supabase webhook header
```

`NEXT_PUBLIC_*` are inlined at build time. Anything without that prefix is
server-only and must never appear in a client component or the bundle.

`.env` is gitignored; set production values in Vercel's project settings.

---

## Dev loop

```bash
npm install
npm run dev       # Next dev server on :3000
npm run build     # production build
npm run lint      # ESLint
npm run test:e2e  # run scripts/e2e-pipeline.ts
```

Two-player testing on one machine: open the second client in an Incognito
window or a second browser profile. Two tabs in the same profile share
`playerId` (localStorage) and collapse to one presence entry.

Dev-only routes under `app/` (cv-debug, punch-test, recorder-test,
test-multiplayer, gestures, world) are reachable by URL but not linked from
the main nav. Treat them as scratch space.

---

## Conventions

- **Client components declare `"use client"` explicitly**; everything else
  defaults to server.
- **Zustand stores live in `lib/store/` as individual files** — no barrel
  export. Import from the specific store.
- **Supabase service client** (with the service-role key) is recreated per
  request in each API route. Don't hoist it to a module-level singleton —
  Next's per-request isolation is the point.
- **Ref-sync pattern in `useGameChannel`**: five separate `useEffect`s, one
  per callback, intentionally. A prior attempt to collapse them into one
  caused a broadcast-visibility regression on one side; don't re-collapse
  without repro-ing the 2-browser test first.
- **Type duplication between `PoseLandmark` (`types/`) and `WireLandmark`
  (`lib/multiplayer/types.ts`)** is intentional — multiplayer types are
  dependency-free by design.
- **Game-state damage is applied locally** on both sides (peer-broadcast
  trust). If cheating becomes a concern, move hit resolution into an Edge
  Function.
- **Effects that subscribe to external systems (channels, recorders,
  intervals)** must return a cleanup. `hooks/useGameChannel.ts` is the
  reference pattern — note the `cancelled` flag for StrictMode double-mount.

---

## Known gotchas

- **Supabase Realtime can appear connected while broadcasts are silently
  dropped.** `useGameChannel` watches for "peer in presence but no broadcast
  received" and kicks `reconnect()` up to 6 times with per-client jitter.
  Don't remove this logic.
- **`CHANNEL_ERROR` is swallowed on subscribe** — fires during StrictMode
  remount and brief Cloudflare hiccups. The consumer-visible symptom is
  handled by the kick loop; a dev-overlay popup would be noise.
- **`NEXT_PUBLIC_SUPABASE_*` must be set in Vercel before a build** — they're
  inlined, so a missing var fails prerender for any page touching the
  Supabase client.
- **Webhook replays**: the embedder claim is `.eq("embedding_status","pending")`
  so duplicate webhook fires are no-ops. Don't weaken that filter.
- **Pose broadcast is 12 Hz, snapshot is ~2 KB → ~24 KB/s per player.** Stay
  well under Supabase's 60 msg/sec cap. If you raise the rate, drop the
  optional raw-landmark fields first.
- **Two Gemini SDKs coexist** (`@google/genai` and `@google/generative-ai`).
  Don't add new code to the legacy one.
- **Presence updates to an existing key don't reliably fire `sync`.** Any
  mutable per-player field that needs to propagate at runtime (tint, etc.)
  should use a dedicated broadcast event in addition to `track()`. See
  `gameChannel.setTint` + the `"tint"` broadcast handler for the pattern.
- **Audio autoplay policy** — `Audio.play()` throws if the user hasn't
  interacted with the page yet. The game flow guarantees a user gesture
  (Start button) before any SFX plays, but `playHit`/`playEnd` catch + swallow
  the rejection defensively.
- **`/game` mount resets `useGameStore`.** Stores are singletons, so a
  return-to-lobby-then-new-match would otherwise carry the prior match's
  ending HP (often 0) into the next fight and instant-KO. Don't remove the
  mount-time `reset()` in `app/game/[roomId]/page.tsx`.

---

## When planning a change

1. Is this ephemeral per-match state or durable? Pick the channel vs DB
   accordingly.
2. Does the pose/rig shape change? Update `lib/multiplayer/types.ts` and both
   sides of `poseSnapshot.ts` before touching renderers.
3. Touching `clips` or `match_events` schema? Add a numbered migration under
   `supabase/migrations/`.
4. Adding a new Gemini call? Reuse `gemini.ts` (`MODELS`, `EMBED_DIM`,
   `normalize`) rather than re-declaring.
5. Touching an API route that still has a stub copy? Prefer implementing in
   the real route and deleting the stub, not both.
