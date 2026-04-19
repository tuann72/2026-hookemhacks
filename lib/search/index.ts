import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

// ─── Plan schemas ─────────────────────────────────────────────────────────────

const FilterSchema = z.object({
  eventType: z.string().optional(),
  playerId: z.string().optional(),
  matchId: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

const RetrieveFilterSchema = FilterSchema.extend({
  minCount: z.number().optional(),
});

const AggregatePlanSchema = z.object({
  kind: z.literal("aggregate"),
  metric: z.enum(["count", "sum", "avg", "max"]),
  target: z.enum(["match_events", "match_summaries"]),
  filters: FilterSchema,
  groupBy: z.enum(["match", "event_type", "day"]).optional(),
  orderBy: z.enum(["metric_desc", "metric_asc"]).optional(),
  limit: z.number().optional(),
});

const RetrievePlanSchema = z.object({
  kind: z.literal("retrieve"),
  filters: RetrieveFilterSchema,
  semanticQuery: z.string().optional(),
  limit: z.number().optional(),
});

const HybridPlanSchema = z.object({
  kind: z.literal("hybrid"),
  filters: RetrieveFilterSchema,
  semanticQuery: z.string(),
  limit: z.number().optional(),
});

export const QueryPlanSchema = z.discriminatedUnion("kind", [
  AggregatePlanSchema,
  RetrievePlanSchema,
  HybridPlanSchema,
]);

export type QueryPlan = z.infer<typeof QueryPlanSchema>;
export type AggregatePlan = z.infer<typeof AggregatePlanSchema>;
export type RetrievePlan = z.infer<typeof RetrievePlanSchema>;
export type HybridPlan = z.infer<typeof HybridPlanSchema>;

// ─── Planner ──────────────────────────────────────────────────────────────────

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM = `
You convert a player's natural-language question into a structured query plan for a
gameplay search system. Output ONLY a JSON object matching one of three shapes:
aggregate, retrieve, or hybrid.

Use "aggregate" for questions about counts, totals, averages, or rankings.
Use "retrieve" for questions that ask for clips matching exact structured criteria.
Use "hybrid" when the question combines a structured filter with a fuzzy/descriptive
concept like "amazing", "fast", "powerful", "sloppy".

Allowed event types: punch, dodge, kick, block.
Current player id: {playerId}.

Examples:
Q: "How many punches have I thrown this session?"
A: {"kind":"aggregate","metric":"count","target":"match_events","filters":{"eventType":"punch","playerId":"{playerId}","since":"{sessionStart}"}}

Q: "Show me a clip where I did 10 punches."
A: {"kind":"retrieve","filters":{"eventType":"punch","minCount":10,"playerId":"{playerId}"},"limit":5}

Q: "Find a clip where I threw an amazing combo."
A: {"kind":"hybrid","filters":{"eventType":"punch","minCount":3,"playerId":"{playerId}"},"semanticQuery":"amazing combo attack","limit":5}

Q: "What was my best round?"
A: {"kind":"aggregate","metric":"max","target":"match_summaries","filters":{"playerId":"{playerId}"},"orderBy":"metric_desc","limit":1}
`;

export async function geminiPlan(
  question: string,
  ctx: { playerId?: string; sessionStart?: string }
): Promise<unknown> {
  const system = SYSTEM
    .replace(/{playerId}/g, ctx.playerId ?? "")
    .replace(/{sessionStart}/g, ctx.sessionStart ?? new Date(0).toISOString());

  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: system,
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await model.generateContent(question);
  return JSON.parse(result.response.text());
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function dispatch(plan: QueryPlan) {
  const supabase = serviceClient();
  if (plan.kind === "aggregate") return runAggregate(supabase, plan);
  if (plan.kind === "retrieve") return runRetrieve(supabase, plan);
  return runHybrid(supabase, plan);
}

async function runAggregate(supabase: ReturnType<typeof serviceClient>, p: AggregatePlan) {
  if (p.target === "match_events" && p.metric === "count") {
    let q = supabase.from("match_events").select("*", { count: "exact", head: true });
    if (p.filters.playerId) q = q.eq("player_id", p.filters.playerId);
    if (p.filters.eventType) q = q.eq("event_type", p.filters.eventType);
    if (p.filters.since) q = q.gte("occurred_at", p.filters.since);
    if (p.filters.until) q = q.lte("occurred_at", p.filters.until);
    const { count, error } = await q;
    if (error) throw error;
    return { answer: `${count ?? 0}`, count: count ?? 0 };
  }

  if (p.target === "match_summaries") {
    let q = supabase.from("match_summaries").select("*");
    if (p.filters.playerId) q = q.eq("player_id", p.filters.playerId);
    if (p.orderBy === "metric_desc") q = q.order("event_totals->punch", { ascending: false });
    if (p.filters.since) q = q.gte("created_at", p.filters.since);
    q = q.limit(p.limit ?? 5);
    const { data, error } = await q;
    if (error) throw error;
    return { matches: data };
  }

  return { answer: "Unsupported aggregate shape" };
}

async function runRetrieve(supabase: ReturnType<typeof serviceClient>, p: RetrievePlan) {
  let q = supabase
    .from("clips")
    .select("id, storage_path, caption, event_counts, started_at")
    .eq("embedding_status", "ready");

  if (p.filters.playerId) q = q.eq("player_id", p.filters.playerId);
  if (p.filters.matchId) q = q.eq("match_id", p.filters.matchId);
  if (p.filters.since) q = q.gte("started_at", p.filters.since);
  if (p.filters.until) q = q.lte("started_at", p.filters.until);
  if (p.filters.eventType && p.filters.minCount) {
    q = q.gte(`event_counts->>${p.filters.eventType}`, p.filters.minCount);
  }

  q = q.limit(p.limit ?? 5);
  const { data, error } = await q;
  if (error) throw error;
  return { clips: await withSignedUrls(supabase, data ?? []) };
}

async function runHybrid(supabase: ReturnType<typeof serviceClient>, p: HybridPlan) {
  const queryVec = await embedText(p.semanticQuery);

  const { data, error } = await supabase.rpc("search_clips_hybrid", {
    p_player_id: p.filters.playerId ?? null,
    p_event_type: p.filters.eventType ?? null,
    p_min_count: p.filters.minCount ?? null,
    p_query_vec: queryVec,
    p_limit: p.limit ?? 5,
  });

  if (error) throw error;
  return { clips: await withSignedUrls(supabase, data ?? []) };
}

type ClipRow = { storage_path: string; [key: string]: unknown };

async function withSignedUrls(supabase: ReturnType<typeof serviceClient>, clips: ClipRow[]) {
  return Promise.all(
    clips.map(async (c) => {
      const { data } = await supabase.storage
        .from("clips")
        .createSignedUrl(c.storage_path, 300);
      return { ...c, videoUrl: data?.signedUrl ?? null };
    })
  );
}
