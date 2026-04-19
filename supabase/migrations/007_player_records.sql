-- Per-player win/loss record. One row per player_id (text, anonymous — matches room_players / clips / match_events).
-- Rows are lazily created on first read by /api/career/[playerId]; match-end wiring is out of scope for this migration.

create table if not exists player_records (
  player_id       text primary key,
  wins            integer not null default 0 check (wins >= 0),
  losses          integer not null default 0 check (losses >= 0),
  matches_played  integer not null default 0 check (matches_played >= 0),
  last_played_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists player_records_last_played_idx
  on player_records (last_played_at desc);

alter table player_records enable row level security;
-- All access goes through service-role API routes. No client-facing policies.
