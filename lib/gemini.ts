import { GoogleGenAI } from "@google/genai";

export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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
