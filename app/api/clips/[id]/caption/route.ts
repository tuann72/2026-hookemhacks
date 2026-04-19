import { createClient } from "@supabase/supabase-js";
import { gemini, MODELS } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clipId } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: existing } = await supabase
    .from("clips")
    .select("caption, storage_path")
    .eq("id", clipId)
    .single();

  if (!existing) return Response.json({ error: "clip not found" }, { status: 404 });
  if (existing.caption) return Response.json({ caption: existing.caption, cached: true });

  const { data: blob, error } = await supabase.storage
    .from("clips")
    .download(existing.storage_path);

  if (error || !blob) {
    return Response.json({ error: `storage download failed: ${error?.message}` }, { status: 500 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  const result = await gemini.models.generateContent({
    model: MODELS.caption,
    contents: [
      {
        parts: [
          {
            inlineData: { mimeType: "video/webm", data: buffer.toString("base64") },
          },
          {
            text: `Describe the physical action in this short gameplay clip in one sentence.
Focus on body movement: punches (jab/cross/hook), dodges, kicks, combos, pace, intensity.
Do not describe the background, UI, or clothing. Output plain text, no preamble.`,
          },
        ],
      },
    ],
  });

  const caption = result.text?.trim() ?? "";

  await supabase
    .from("clips")
    .update({ caption, caption_generated_at: new Date().toISOString() })
    .eq("id", clipId);

  return Response.json({ caption, cached: false });
}
