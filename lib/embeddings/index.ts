import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// IMPORTANT: must use the same model at query time (Phase 6) — mixing models produces garbage results.
const embedModel = genai.getGenerativeModel({ model: "text-embedding-004" });

export async function embedText(text: string): Promise<number[]> {
  const result = await embedModel.embedContent(text);
  return result.embedding.values; // 768 dimensions
}
