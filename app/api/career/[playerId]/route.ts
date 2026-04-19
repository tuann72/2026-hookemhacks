import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  CALORIES_PER_PUNCH,
  PUNCH_COUNT_DISPLAY_MULTIPLIER,
} from "@/lib/combat/damage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function toResponse(row: RecordRow, rawPunches: number) {
  const decided = row.wins + row.losses;
  const totalPunches = Math.round(rawPunches * PUNCH_COUNT_DISPLAY_MULTIPLIER);
  return {
    playerId: row.player_id,
    wins: row.wins,
    losses: row.losses,
    matchesPlayed: row.matches_played,
    winRate: decided === 0 ? null : row.wins / decided,
    lastPlayedAt: row.last_played_at,
    totalPunches,
    caloriesBurned: totalPunches * CALORIES_PER_PUNCH,
  };
}

async function countPunches(
  supabase: ReturnType<typeof serviceClient>,
  playerId: string
): Promise<number> {
  const { count } = await supabase
    .from("match_events")
    .select("*", { count: "exact", head: true })
    .eq("player_id", playerId)
    .eq("event_type", "punch");
  return count ?? 0;
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
    const punches = await countPunches(supabase, playerId);
    return Response.json(toResponse(existing as RecordRow, punches));
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("player_records")
    .insert({ player_id: playerId })
    .select("player_id, wins, losses, matches_played, last_played_at")
    .single();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  const punches = await countPunches(supabase, playerId);
  return Response.json(toResponse(inserted as RecordRow, punches));
}
