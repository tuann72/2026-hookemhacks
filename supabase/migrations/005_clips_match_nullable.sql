-- Allow clips without a parent match (needed for dev tooling / direct uploads).
alter table clips alter column match_id drop not null;
alter table clips drop constraint if exists clips_match_id_fkey;
alter table clips add constraint clips_match_id_fkey
  foreign key (match_id) references matches(id) on delete cascade;
