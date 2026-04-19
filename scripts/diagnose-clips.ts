// Clip-pipeline diagnostic. Tells you what's in your clips table, surfaces
// stuck/failed rows, and optionally re-embeds them through the dev endpoint
// so you can see if Vertex (or AI Studio) is actually working.
//
//   npx tsx scripts/diagnose-clips.ts                     # overall stats + latest
//   npx tsx scripts/diagnose-clips.ts <playerId>          # scoped to one player
//   npx tsx scripts/diagnose-clips.ts <playerId> --reembed-failed
//   npx tsx scripts/diagnose-clips.ts <playerId> --reset-failed
//   npx tsx scripts/diagnose-clips.ts <playerId> --drain  # process ALL pending in a loop
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
// For --reembed-failed, dev server must be running on BASE_URL (default :3000).

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const [playerId, ...flags] = process.argv.slice(2);
const doReembed = flags.includes("--reembed-failed") || flags.includes("--reembed");
const doReset = flags.includes("--reset-failed");
const doDrain = flags.includes("--drain");

async function main() {
  console.log(`→ Supabase: ${SUPABASE_URL}`);
  console.log(`→ playerId filter: ${playerId ?? "(all players)"}`);
  console.log();

  const base = supabase.from("clips").select("embedding_status", { count: "exact", head: true });
  const scoped = playerId ? base.eq("player_id", playerId) : base;

  const statuses = ["pending", "processing", "ready", "failed", "skipped"];
  const counts: Record<string, number> = {};
  for (const s of statuses) {
    const q = playerId
      ? supabase.from("clips").select("id", { count: "exact", head: true })
          .eq("player_id", playerId).eq("embedding_status", s)
      : supabase.from("clips").select("id", { count: "exact", head: true })
          .eq("embedding_status", s);
    const { count, error } = await q;
    if (error) { console.error(`  ✗ count(${s}) failed:`, error.message); continue; }
    counts[s] = count ?? 0;
  }

  const total = (await scoped).count ?? 0;
  console.log(`total clips for this scope: ${total}`);
  for (const s of statuses) {
    const n = counts[s] ?? 0;
    if (n === 0) continue;
    const flag = s === "failed" ? " ⚠" : s === "pending" || s === "processing" ? " ⏳" : "";
    console.log(`  ${s.padEnd(11)} ${n}${flag}`);
  }
  console.log();

  const recentQ = playerId
    ? supabase.from("clips").select("id, player_id, embedding_status, storage_path, event_counts, created_at").eq("player_id", playerId).order("created_at", { ascending: false }).limit(5)
    : supabase.from("clips").select("id, player_id, embedding_status, storage_path, event_counts, created_at").order("created_at", { ascending: false }).limit(5);
  const { data: recent } = await recentQ;
  console.log("latest 5 clips:");
  for (const c of recent ?? []) {
    const events = Object.entries((c.event_counts ?? {}) as Record<string, unknown>)
      .map(([k, v]) => `${k}:${v}`).join(",") || "none";
    console.log(`  ${c.id.slice(0, 8)}  ${String(c.embedding_status).padEnd(10)}  ${c.player_id?.slice(0, 12) ?? "?"}  events=${events}`);
  }
  console.log();

  if (doReset) {
    console.log("→ resetting failed clips to pending…");
    const { data, error } = await (
      playerId
        ? supabase.from("clips").update({ embedding_status: "pending" }).eq("player_id", playerId).eq("embedding_status", "failed").select("id")
        : supabase.from("clips").update({ embedding_status: "pending" }).eq("embedding_status", "failed").select("id")
    );
    if (error) console.error("  ✗", error.message);
    else console.log(`  reset ${data?.length ?? 0} rows. Trigger re-embed via Supabase webhook or --reembed-failed.`);
    console.log();
  }

  if (doReembed || doDrain) {
    const batchSize = doDrain ? 50 : 10;
    let processed = 0;
    let ok = 0;
    let skipped = 0;
    let failed = 0;

    while (true) {
      // Reset any failed rows back to pending so /api/dev/process-clip can claim
      const resetQ = playerId
        ? supabase.from("clips").update({ embedding_status: "pending" }).eq("player_id", playerId).eq("embedding_status", "failed")
        : supabase.from("clips").update({ embedding_status: "pending" }).eq("embedding_status", "failed");
      await resetQ;

      const pendingQ = playerId
        ? supabase.from("clips").select("id").eq("player_id", playerId).eq("embedding_status", "pending").limit(batchSize)
        : supabase.from("clips").select("id").eq("embedding_status", "pending").limit(batchSize);
      const { data: batch, error } = await pendingQ;
      if (error) { console.error("  ✗ pending query:", error.message); break; }
      if (!batch?.length) break;

      console.log(`→ processing batch of ${batch.length} (${processed} done so far) via ${BASE_URL}/api/dev/process-clip …`);
      for (const c of batch) {
        const r = await fetch(`${BASE_URL}/api/dev/process-clip`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clipId: c.id }),
        });
        let body: Record<string, unknown> = {};
        try { body = await r.json(); } catch { /* non-JSON */ }
        processed++;
        if (r.ok && body.ok) ok++;
        else if (body.skipped) skipped++;
        else { failed++; console.log(`  ✗ ${c.id.slice(0, 8)} → ${r.status} ${JSON.stringify(body).slice(0, 220)}`); }
      }

      if (!doDrain) break;
    }

    console.log();
    console.log(`done: processed=${processed} ok=${ok} skipped=${skipped} failed=${failed}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
