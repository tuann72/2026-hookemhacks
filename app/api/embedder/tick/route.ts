import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gemini, MODELS, EMBED_DIM, normalize } from "@/lib/gemini";

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

  const supabase = serviceClient();
  const { data: claimed } = await supabase
    .from("clips")
    .update({ embedding_status: "processing" })
    .eq("id", clipId)
    .eq("embedding_status", "pending")
    .select("id, storage_path, event_counts")
    .single();

  if (!claimed) return Response.json({ ok: true, skipped: true });

  after(processClip(supabase, claimed).catch((err) =>
    console.error("[embedder] failed", clipId, err)
  ));

  return Response.json({ ok: true, queued: true });
}

async function processClip(
  supabase: ReturnType<typeof serviceClient>,
  claimed: { id: string; storage_path: string; event_counts: Record<string, number> | null }
) {
  // Skip clips with no detected events — nothing to search for.
  const totalEvents = Object.values(claimed.event_counts ?? {})
    .reduce((a, b) => a + (Number(b) || 0), 0);

  if (totalEvents === 0) {
    await supabase.from("clips").update({ embedding_status: "skipped" }).eq("id", claimed.id);
    return;
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
  } catch (err) {
    await supabase.from("clips").update({ embedding_status: "failed" }).eq("id", claimed.id);
    throw err;
  }
}
