-- Hybrid clip search: filter structurally, then rank by cosine similarity.
-- p_player_id / p_event_type / p_min_count are optional (null = no filter).
create or replace function search_clips_hybrid(
  p_player_id text,
  p_event_type text,
  p_min_count  int,
  p_query_vec  vector(768),
  p_limit      int
) returns table (
  id           uuid,
  storage_path text,
  caption      text,
  event_counts jsonb,
  distance     float
) language sql stable as $$
  select
    id,
    storage_path,
    caption,
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
