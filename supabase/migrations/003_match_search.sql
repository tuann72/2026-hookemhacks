-- Phase 0: pgvector + trigram extensions
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Matches: one row per game session within a room
create table if not exists matches (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  status      text not null default 'active' check (status in ('active', 'finished'))
);

create index if not exists matches_room_idx on matches (room_id);

-- Authoritative event timeline. Named match_events; ActionEvent in client code
-- to avoid collision with GameEvent in lib/multiplayer/types.ts.
create table if not exists match_events (
  id            bigserial primary key,
  match_id      uuid not null references matches(id) on delete cascade,
  player_id     text not null,
  event_type    text not null,
  event_subtype text,
  occurred_at   timestamptz not null,
  match_time_ms integer not null,
  metadata      jsonb not null default '{}'::jsonb
);

create index if not exists match_events_match_idx  on match_events (match_id, match_time_ms);
create index if not exists match_events_player_idx on match_events (player_id, occurred_at desc);
create index if not exists match_events_type_idx   on match_events (event_type);

-- One row per 5-second clip. Embedding populated async by the embedder (Phase 4).
create table if not exists clips (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null references matches(id) on delete cascade,
  player_id        text not null,
  chunk_index      integer not null,
  storage_path     text not null,
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  duration_ms      integer not null,
  event_counts     jsonb not null default '{}'::jsonb,
  caption          text,
  embedding        vector(768),
  embedding_status text not null default 'pending'
    check (embedding_status in ('pending','processing','ready','failed')),
  created_at       timestamptz not null default now(),
  unique (match_id, player_id, chunk_index)
);

create index if not exists clips_match_idx        on clips (match_id);
create index if not exists clips_player_idx       on clips (player_id, started_at desc);
create index if not exists clips_event_counts_idx on clips using gin (event_counts jsonb_path_ops);
create index if not exists clips_status_idx       on clips (embedding_status) where embedding_status != 'ready';
-- Note: ivfflat index on embedding requires data first; add after initial bulk insert:
-- create index clips_embedding_idx on clips using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Per-match rollups written at match end.
create table if not exists match_summaries (
  match_id        uuid primary key references matches(id) on delete cascade,
  player_id       text not null,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  duration_ms     integer not null,
  event_totals    jsonb not null default '{}'::jsonb,
  best_combo_len  integer,
  created_at      timestamptz not null default now()
);

create index if not exists match_summaries_player_idx on match_summaries (player_id, started_at desc);

-- RLS: all writes go through service-role API routes, which bypass RLS.
-- No client-facing select policies yet.
alter table matches         enable row level security;
alter table match_events    enable row level security;
alter table clips           enable row level security;
alter table match_summaries enable row level security;

-- RPC called by /api/matches/end to aggregate events into a summary row.
-- Upserts so it's safe to call multiple times on the same match.
create or replace function write_match_summary(p_match_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into match_summaries (
    match_id, player_id, started_at, ended_at, duration_ms, event_totals
  )
  select
    t.match_id,
    t.player_id,
    min(t.occurred_at)  as started_at,
    max(t.occurred_at)  as ended_at,
    extract(epoch from (max(t.occurred_at) - min(t.occurred_at))) * 1000 as duration_ms,
    jsonb_object_agg(t.event_type, t.cnt) as event_totals
  from (
    select match_id, player_id, event_type, count(*) as cnt
    from match_events
    where match_id = p_match_id
    group by match_id, player_id, event_type
  ) t
  group by t.match_id, t.player_id
  on conflict (match_id) do update
    set ended_at     = excluded.ended_at,
        duration_ms  = excluded.duration_ms,
        event_totals = excluded.event_totals;
end;
$$;
