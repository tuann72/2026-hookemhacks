-- Migrate embedding column from vector(768) to vector(1536) for gemini-embedding-2-preview.
-- Also adds caption_generated_at for lazy caption tracking.
-- Run this against your Supabase project before deploying the new embedder.

drop index if exists clips_embedding_idx;

alter table clips alter column embedding type vector(1536);

alter table clips add column if not exists caption_generated_at timestamptz;

create index clips_embedding_idx on clips
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Update hybrid search RPC to use 1536-dim vectors.
-- Caption removed from return — captions are now generated lazily on demand.
drop function if exists search_clips_hybrid(text,text,integer,vector,integer);

create or replace function search_clips_hybrid(
  p_player_id  text,
  p_event_type text,
  p_min_count  int,
  p_query_vec  vector(1536),
  p_limit      int
) returns table (
  id           uuid,
  storage_path text,
  event_counts jsonb,
  distance     float
) language sql stable as $$
  select
    id,
    storage_path,
    event_counts,
    embedding <=> p_query_vec as distance
  from clips
  where embedding_status = 'ready'
    and (p_player_id is null or player_id = p_player_id)
    and (
      p_event_type is null
      or (event_counts ->> p_event_type)::int >= coalesce(p_min_count, 1)
    )
  order by embedding <=> p_query_vec
  limit p_limit;
$$;
