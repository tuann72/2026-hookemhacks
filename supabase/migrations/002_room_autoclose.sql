-- Auto-close finished rooms 10 minutes after they end.
-- 1. Track when a room entered the 'finished' state.
-- 2. Update cleanup_old_rooms() to delete finished rooms older than 10 min.
-- 3. Schedule cleanup every minute via pg_cron (if the extension is enabled).

alter table rooms
  add column if not exists finished_at timestamptz;

-- Backfill: treat any pre-existing finished rows as just finished now so they
-- still get the 10-minute grace window before deletion.
update rooms
  set finished_at = now()
  where status = 'finished' and finished_at is null;

-- Stamp finished_at whenever a row transitions into 'finished'.
create or replace function set_finished_at() returns trigger language plpgsql as $$
begin
  if new.status = 'finished' and (old.status is null or old.status <> 'finished') then
    new.finished_at = now();
  elsif new.status <> 'finished' then
    new.finished_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_set_finished_at on rooms;
create trigger rooms_set_finished_at
  before update on rooms
  for each row
  execute function set_finished_at();

-- Delete rooms that have been finished for > 10 min, or waiting for > 1 hour.
create or replace function cleanup_old_rooms() returns void language sql as $$
  delete from rooms
  where (status = 'finished' and finished_at < now() - interval '10 minutes')
     or (status = 'waiting' and created_at < now() - interval '1 hour');
$$;

-- Schedule hourly cleanup via pg_cron if available.
-- Enable pg_cron in Supabase under Database → Extensions before this will run.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cleanup-rooms') then
      perform cron.unschedule('cleanup-rooms');
    end if;
    perform cron.schedule('cleanup-rooms', '* * * * *', 'select cleanup_old_rooms()');
  end if;
end $$;
