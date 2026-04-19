import { GoogleGenAI } from "@google/genai";

// Vertex mode when GOOGLE_CLOUD_PROJECT is set — uses Application Default
// Credentials (gcloud auth application-default login locally, service account
// in prod), bills against the GCP project's credits. Falls back to AI Studio
// with GEMINI_API_KEY when the Vertex env isn't configured.
//
// Vertex supports `gemini-embedding-2-preview` at 1536 dim with video input,
// so embeddings stay compatible with existing rows in `clips.embedding`.
export const gemini = process.env.GOOGLE_CLOUD_PROJECT
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
    })
  : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const MODELS = {
  embed: "gemini-embedding-2-preview",
  caption: "gemini-2.5-flash-lite",
  plan: "gemini-2.5-flash",
} as const;

export const EMBED_DIM = 1536;

export function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}
