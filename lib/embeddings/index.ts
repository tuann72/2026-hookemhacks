// Text embedding via gemini-embedding-2-preview (RETRIEVAL_QUERY task).
// Clips are embedded directly as video at ingest — this is only used for query-side text.
import { gemini, MODELS, EMBED_DIM, normalize } from "@/lib/gemini";

export async function embedText(text: string): Promise<number[]> {
  const result = await gemini.models.embedContent({
    model: MODELS.embed,
    contents: [{ parts: [{ text }] }],
    config: {
      outputDimensionality: EMBED_DIM,
      taskType: "RETRIEVAL_QUERY",
    },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values) throw new Error("no embedding returned");
  return normalize(values);
}
