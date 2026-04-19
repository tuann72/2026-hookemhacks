import { geminiPlan, QueryPlanSchema, dispatch } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { question, playerId, sessionStart } = await req.json();
  if (!question) return Response.json({ error: "question required" }, { status: 400 });

  let raw: unknown;
  try {
    raw = await geminiPlan(question, { playerId, sessionStart });
  } catch (err) {
    console.error("[query] planner error", err);
    return Response.json({ error: "planner failed" }, { status: 500 });
  }

  const parsed = QueryPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "could not understand question" }, { status: 400 });
  }

  try {
    const result = await dispatch(parsed.data);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "dispatch failed";
    console.error("[query] dispatch error", err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
