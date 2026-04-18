create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id text not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  max_players int not null default 2,
  created_at timestamptz not null default now()
);

create table room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id text not null,
  joined_at timestamptz not null default now(),
  unique(room_id, player_id)
);

create index on rooms(code);
create index on room_players(room_id);

-- Auto-clean finished/stale rooms older than 1 hour
create or replace function cleanup_old_rooms() returns void language sql as $$
  delete from rooms
  where status = 'finished'
    or (status = 'waiting' and created_at < now() - interval '1 hour');
$$;
