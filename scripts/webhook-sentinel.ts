// Inserts a throwaway clip row to force-fire the Supabase webhook. Watch the
// Vercel/dev logs after running to see if POST /api/embedder/tick arrives.
// The row references a nonexistent storage file, so the embedder will mark it
// 'failed' — that's expected. The point is to prove the webhook fires.
//
//   npx tsx scripts/webhook-sentinel.ts            # insert a sentinel
//   npx tsx scripts/webhook-sentinel.ts --clean    # delete all sentinels
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
config();

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  if (process.argv.includes("--clean")) {
    const { data, error } = await s
      .from("clips")
      .delete()
      .eq("player_id", "webhook-test")
      .select("id");
    console.log(`deleted ${data?.length ?? 0} sentinel rows`, error ?? "");
    return;
  }
  const { data, error } = await s
    .from("clips")
    .insert({
      match_id: null,
      player_id: "webhook-test",
      chunk_index: Date.now() % 1_000_000,
      storage_path: "does-not-exist.webm",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: 0,
      event_counts: {},
    })
    .select("id")
    .single();
  if (error) { console.error(error); process.exit(1); }
  console.log(`inserted sentinel clip id=${data?.id}`);
  console.log("→ within a few seconds, your Vercel logs should show POST /api/embedder/tick");
}
main();
