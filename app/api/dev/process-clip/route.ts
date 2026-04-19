// DEV ONLY — not protected by webhook secret, only enabled outside production.
// Triggers the embedder pipeline for a given clipId so you can test without
// setting up a real Supabase webhook.
import { createClient } from "@supabase/supabase-js";
import { gemini, MODELS, EMBED_DIM, normalize } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("not available in production", { status: 403 });
  }

  const { clipId } = await req.json();
  if (!clipId) return Response.json({ error: "clipId required" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: claimed } = await supabase
    .from("clips")
    .update({ embedding_status: "processing" })
    .eq("id", clipId)
    .eq("embedding_status", "pending")
    .select("id, storage_path, event_counts")
    .single();

  if (!claimed) {
    return Response.json({ ok: false, skipped: true, reason: "not pending or not found" });
  }

  try {
    const { data: blob, error } = await supabase.storage
      .from("clips")
      .download(claimed.storage_path);

    if (error || !blob) throw new Error(`storage download failed: ${error?.message}`);

    const buffer = Buffer.from(await blob.arrayBuffer());

    const result = await gemini.models.embedContent({
      model: MODELS.embed,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "video/webm",
                data: buffer.toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        outputDimensionality: EMBED_DIM,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    });

    const embedding = result.embeddings?.[0]?.values;
    if (!embedding || embedding.length !== EMBED_DIM) {
      throw new Error(`unexpected embedding shape: ${embedding?.length}`);
    }

    await supabase
      .from("clips")
      .update({ embedding: normalize(embedding), embedding_status: "ready" })
      .eq("id", claimed.id);

    return Response.json({ ok: true, clipId });
  } catch (err) {
    await supabase.from("clips").update({ embedding_status: "failed" }).eq("id", claimed.id);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
