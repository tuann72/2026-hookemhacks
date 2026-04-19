import { geminiPlan, dispatch } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { question, playerId, sessionStart } = await req.json();
  if (!question) return Response.json({ error: "question required" }, { status: 400 });
  if (!playerId || typeof playerId !== "string") {
    return Response.json({ error: "playerId required" }, { status: 400 });
  }

  try {
    const plan = await geminiPlan(question, { sessionStart });
    const result = await dispatch(plan, playerId);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "request failed";
    console.error("[query] error", err);
    const status = msg === "could not understand question" ? 400 : 500;
    return Response.json({ error: msg }, { status });
  }
}
