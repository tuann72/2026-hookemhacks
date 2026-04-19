// Lists clips inserted in the last 30 minutes.
//   npx tsx scripts/recent-clips.ts
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
config();

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await s
    .from("clips")
    .select("id, player_id, embedding_status, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) { console.error(error); process.exit(1); }
  console.log(`${data?.length ?? 0} clips in the last 30 min:`);
  for (const c of data ?? []) {
    console.log(
      `  ${c.id.slice(0, 8)}  ${String(c.embedding_status).padEnd(10)}  ${c.player_id}  ${c.created_at}`,
    );
  }
}
main();
