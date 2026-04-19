import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { captionClip } from "@/lib/generation";
import { embedText } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  if (req.headers.get("x-webhook-secret") !== process.env.EMBEDDER_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await req.json();
  const clipId = body.record?.id as string | undefined;
  if (!clipId) return new Response("no id", { status: 400 });

  // Claim the row atomically before responding — if claim fails (already
  // processing or done) we bail early without doing any Gemini work.
  const supabase = serviceClient();
  const { data: claimed } = await supabase
    .from("clips")
    .update({ embedding_status: "processing" })
    .eq("id", clipId)
    .eq("embedding_status", "pending")
    .select("id, storage_path")
    .single();

  if (!claimed) return Response.json({ ok: true, skipped: true });

  // after() keeps the function alive for slow work after the 200 is sent.
  after(processClip(supabase, claimed).catch((err) =>
    console.error("[embedder] failed", clipId, err)
  ));

  return Response.json({ ok: true, queued: true });
}

async function processClip(
  supabase: ReturnType<typeof serviceClient>,
  claimed: { id: string; storage_path: string }
) {
  try {
    // 1. Download the WebM clip from storage.
    const { data: blob, error } = await supabase.storage
      .from("clips")
      .download(claimed.storage_path);

    if (error || !blob) throw new Error(`storage download failed: ${error?.message}`);

    const videoBytes = new Uint8Array(await blob.arrayBuffer());

    // 2. Caption with Gemini 2.5 flash.
    const caption = await captionClip(videoBytes);

    // 3. Embed the caption with text-embedding-004.
    const embedding = await embedText(caption);

    // 4. Write results back.
    await supabase
      .from("clips")
      .update({ caption, embedding, embedding_status: "ready" })
      .eq("id", claimed.id);
  } catch (err) {
    await supabase
      .from("clips")
      .update({ embedding_status: "failed" })
      .eq("id", claimed.id);
    throw err;
  }
}
