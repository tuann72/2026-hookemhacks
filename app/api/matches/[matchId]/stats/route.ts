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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await ctx.params;
  const playerId = req.nextUrl.searchParams.get("playerId");
  if (!matchId) {
    return Response.json({ error: "matchId required" }, { status: 400 });
  }
  if (!playerId) {
    return Response.json({ error: "playerId required" }, { status: 400 });
  }

  const supabase = serviceClient();
  const { count, error } = await supabase
    .from("match_events")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .eq("event_type", "punch");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rawPunches = count ?? 0;
  const punches = Math.round(rawPunches * PUNCH_COUNT_DISPLAY_MULTIPLIER);
  return Response.json({
    matchId,
    playerId,
    punches,
    calories: punches * CALORIES_PER_PUNCH,
  });
}
