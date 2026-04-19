import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type RecordRow = {
  player_id: string;
  wins: number;
  losses: number;
  matches_played: number;
  last_played_at: string | null;
};

function toResponse(row: RecordRow) {
  const decided = row.wins + row.losses;
  return {
    playerId: row.player_id,
    wins: row.wins,
    losses: row.losses,
    matchesPlayed: row.matches_played,
    winRate: decided === 0 ? null : row.wins / decided,
    lastPlayedAt: row.last_played_at,
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await ctx.params;
  if (!playerId) {
    return Response.json({ error: "playerId required" }, { status: 400 });
  }

  const supabase = serviceClient();

  const { data: existing, error: readErr } = await supabase
    .from("player_records")
    .select("player_id, wins, losses, matches_played, last_played_at")
    .eq("player_id", playerId)
    .maybeSingle();

  if (readErr) {
    return Response.json({ error: readErr.message }, { status: 500 });
  }

  if (existing) {
    return Response.json(toResponse(existing as RecordRow));
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("player_records")
    .insert({ player_id: playerId })
    .select("player_id, wins, losses, matches_played, last_played_at")
    .single();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  return Response.json(toResponse(inserted as RecordRow));
}
