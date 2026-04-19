import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Controlled vocabulary keeps embeddings consistent across clips.
const CAPTION_SYSTEM = `You are a sports motion analyst. Describe what the player's body is doing in the video clip in 1-2 short sentences. Focus only on physical actions: punches, dodges, jumps, stances, arm swings. Use simple, consistent vocabulary. Do not describe clothing, background, or emotion. Do not hedge — be direct.`;

export async function captionClip(videoBytes: Uint8Array, mimeType = "video/webm"): Promise<string> {
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: CAPTION_SYSTEM,
  });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: Buffer.from(videoBytes).toString("base64"),
      },
    },
    "Describe the player's physical actions in this clip.",
  ]);

  return result.response.text().trim();
}
