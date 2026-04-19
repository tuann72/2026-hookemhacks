import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const blob = form.get("chunk") as Blob | null;
  const metaRaw = form.get("meta") as string | null;

  if (!blob || !metaRaw) {
    return Response.json({ error: "missing chunk or meta" }, { status: 400 });
  }

  const meta = JSON.parse(metaRaw) as {
    matchId: string;
    playerId: string;
    chunkIndex: number;
    startedAt: number;   // epoch ms
    durationMs: number;
    rollup: { counts: Record<string, number> };
  };

  const endedAt = new Date(meta.startedAt + meta.durationMs).toISOString();
  const startedAt = new Date(meta.startedAt).toISOString();
  const path = `${meta.matchId}/${meta.playerId}/${meta.chunkIndex}.webm`;

  const supabase = serviceClient();

  const { error: upErr } = await supabase.storage
    .from("clips")
    .upload(path, blob, { contentType: "video/webm", upsert: true });

  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  const { data, error: insErr } = await supabase
    .from("clips")
    .insert({
      match_id: meta.matchId ?? null,
      player_id: meta.playerId,
      chunk_index: meta.chunkIndex,
      storage_path: path,
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: meta.durationMs,
      event_counts: meta.rollup.counts,
    })
    .select("id")
    .single();

  if (insErr) {
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ clipId: data.id });
}
