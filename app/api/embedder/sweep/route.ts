import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Resets clips stuck in 'processing' for more than 10 minutes back to 'pending'
// so they get retried. Call this on a cron (e.g. Vercel Cron every 5 minutes).
export async function POST(req: Request) {
  if (req.headers.get("x-webhook-secret") !== process.env.EMBEDDER_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("clips")
    .update({ embedding_status: "pending" })
    .eq("embedding_status", "processing")
    .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .select("id");

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, reset: data?.length ?? 0 });
}
