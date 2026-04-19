import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { gemini, MODELS, EMBED_DIM, normalize } from "@/lib/gemini";

// ─── Plan schemas ─────────────────────────────────────────────────────────────
//
// playerId is deliberately absent from filters — the route injects the caller's
// player identity at dispatch time. The planner cannot see, invent, or leak it.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FilterSchema = z.object({
  eventType: z.string().optional(),
  // Reject planner hallucinations like "latest" — only real UUIDs allowed.
  matchId: z.string().regex(UUID_RE).optional(),
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
  orderBy: z
    .enum(["metric_desc", "metric_asc", "duration_desc", "recent"])
    .optional(),
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

const PlayerRecordPlanSchema = z.object({
  kind: z.literal("player_record"),
  field: z.enum(["wins", "losses", "matches_played", "win_rate"]),
});

const UnknownPlanSchema = z.object({
  kind: z.literal("unknown"),
  reason: z.string(),
});

export const QueryPlanSchema = z.discriminatedUnion("kind", [
  AggregatePlanSchema,
  RetrievePlanSchema,
  HybridPlanSchema,
  PlayerRecordPlanSchema,
  UnknownPlanSchema,
]);

export type QueryPlan = z.infer<typeof QueryPlanSchema>;
export type AggregatePlan = z.infer<typeof AggregatePlanSchema>;
export type RetrievePlan = z.infer<typeof RetrievePlanSchema>;
export type HybridPlan = z.infer<typeof HybridPlanSchema>;
export type PlayerRecordPlan = z.infer<typeof PlayerRecordPlanSchema>;

// ─── Planner ──────────────────────────────────────────────────────────────────

const SYSTEM = `
You convert a player's natural-language question into a structured query plan for
their personal gameplay archive. Output ONLY a JSON object matching one of five
shapes: aggregate, retrieve, hybrid, player_record, or unknown.

Everything is already scoped to the current player — do NOT ask about player identity,
and do NOT put playerId in filters (the server injects it).

Shape picker:
- "aggregate": counts / totals / averages / rankings over matches or match events.
  target=match_events for per-action counts, target=match_summaries for per-match rollups.
  orderBy options on match_summaries: metric_desc/asc (by punch total), duration_desc
  (longest match), recent (most recent).
- "retrieve": find clips matching exact structured criteria (event type + min count + time).
- "hybrid": clips matching a fuzzy descriptor ("amazing", "sloppy", "wild") combined
  with structured filters.
- "player_record": direct lookup on the player's overall record. field options:
  wins, losses, matches_played, win_rate.
- "unknown": the question is not about this player's matches, clips, punches, or record.
  Include a one-sentence reason. Use this instead of forcing an unrelated question
  into another shape.

Allowed event types: punch, dodge, kick, block.

Rules:
- matchId must be a real UUID you were given — NEVER invent values like "latest".
- Omit matchId entirely unless the user gave you a specific match UUID.
- Omit filters you have no concrete value for.

Examples:
Q: "How many punches have I thrown this session?"
A: {"kind":"aggregate","metric":"count","target":"match_events","filters":{"eventType":"punch","since":"{sessionStart}"}}

Q: "Show me a clip where I did 10 punches."
A: {"kind":"retrieve","filters":{"eventType":"punch","minCount":10},"limit":5}

Q: "Find a clip where I threw an amazing combo."
A: {"kind":"hybrid","filters":{"eventType":"punch","minCount":3},"semanticQuery":"amazing combo attack","limit":5}

Q: "What was my longest match?"
A: {"kind":"aggregate","metric":"max","target":"match_summaries","filters":{},"orderBy":"duration_desc","limit":1}

Q: "Show me my recent matches."
A: {"kind":"aggregate","metric":"count","target":"match_summaries","filters":{},"orderBy":"recent","limit":5}

Q: "How many wins do I have?"
A: {"kind":"player_record","field":"wins"}

Q: "What's my win rate?"
A: {"kind":"player_record","field":"win_rate"}

Q: "How many matches have I played?"
A: {"kind":"player_record","field":"matches_played"}

Q: "Who won the NBA finals?"
A: {"kind":"unknown","reason":"I can only answer questions about your Kaiju Cove matches, clips, and record."}
`;

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function camelKey(k: string): string {
  return k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[camelKey(k)] = normalizeKeys(v);
    }
    return out;
  }
  return value;
}

async function callPlanner(
  question: string,
  system: string,
  errorHint?: string
): Promise<unknown> {
  const userText = errorHint
    ? `${question}\n\nYour previous answer failed validation with: ${errorHint}. Return a corrected JSON plan.`
    : question;

  const result = await gemini.models.generateContent({
    model: MODELS.plan,
    contents: [{ role: "user", parts: [{ text: userText }] }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
    },
  });

  const text = stripCodeFence(result.text ?? "{}");
  try {
    return normalizeKeys(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function geminiPlan(
  question: string,
  ctx: { sessionStart?: string }
): Promise<QueryPlan> {
  const system = SYSTEM.replace(
    /{sessionStart}/g,
    ctx.sessionStart ?? new Date(0).toISOString()
  );

  let raw = await callPlanner(question, system);
  let parsed = QueryPlanSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    console.warn("[query] plan failed, retrying", { raw, issues });
    raw = await callPlanner(question, system, issues);
    parsed = QueryPlanSchema.safeParse(raw);
  }

  if (!parsed.success) {
    console.error("[query] plan unparseable after retry", {
      raw,
      errors: parsed.error.issues,
    });
    throw new Error("could not understand question");
  }

  return parsed.data;
}

// ─── Query embedding ──────────────────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[]> {
  const result = await gemini.models.embedContent({
    model: MODELS.embed,
    contents: [{ parts: [{ text }] }],
    config: {
      outputDimensionality: EMBED_DIM,
      taskType: "RETRIEVAL_QUERY",
    },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values) throw new Error("no query embedding returned");
  return normalize(values);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function dispatch(plan: QueryPlan, playerId: string) {
  const supabase = serviceClient();
  if (plan.kind === "aggregate") return runAggregate(supabase, plan, playerId);
  if (plan.kind === "retrieve") return runRetrieve(supabase, plan, playerId);
  if (plan.kind === "hybrid") return runHybrid(supabase, plan, playerId);
  if (plan.kind === "player_record") return runPlayerRecord(supabase, plan, playerId);
  return { answer: plan.reason };
}

async function runAggregate(
  supabase: ReturnType<typeof serviceClient>,
  p: AggregatePlan,
  playerId: string
) {
  if (p.target === "match_events" && p.metric === "count") {
    let q = supabase
      .from("match_events")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId);
    if (p.filters.eventType) q = q.eq("event_type", p.filters.eventType);
    if (p.filters.since) q = q.gte("occurred_at", p.filters.since);
    if (p.filters.until) q = q.lte("occurred_at", p.filters.until);
    const { count, error } = await q;
    if (error) throw error;
    return { answer: `${count ?? 0}`, count: count ?? 0 };
  }

  if (p.target === "match_summaries") {
    let q = supabase.from("match_summaries").select("*").eq("player_id", playerId);
    switch (p.orderBy) {
      case "metric_desc":
        q = q.order("event_totals->punch", { ascending: false });
        break;
      case "metric_asc":
        q = q.order("event_totals->punch", { ascending: true });
        break;
      case "duration_desc":
        q = q.order("duration_ms", { ascending: false });
        break;
      case "recent":
      default:
        q = q.order("started_at", { ascending: false });
    }
    if (p.filters.since) q = q.gte("created_at", p.filters.since);
    if (p.filters.until) q = q.lte("created_at", p.filters.until);
    const limit = p.limit ?? 5;
    q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;

    if (p.orderBy === "duration_desc" && limit === 1) {
      const top = data?.[0] as { duration_ms?: number } | undefined;
      if (!top) return { answer: "No finished matches yet." };
      return { answer: `Your longest match lasted ${formatDuration(top.duration_ms ?? 0)}.` };
    }

    return { matches: data };
  }

  return { answer: "That aggregate shape isn't supported yet." };
}

async function runRetrieve(
  supabase: ReturnType<typeof serviceClient>,
  p: RetrievePlan,
  playerId: string
) {
  let q = supabase
    .from("clips")
    .select("id, storage_path, caption, event_counts, started_at")
    .eq("embedding_status", "ready")
    .eq("player_id", playerId);

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

async function runHybrid(
  supabase: ReturnType<typeof serviceClient>,
  p: HybridPlan,
  playerId: string
) {
  const queryVec = await embedQuery(p.semanticQuery);

  const { data, error } = await supabase.rpc("search_clips_hybrid", {
    p_player_id: playerId,
    p_event_type: p.filters.eventType ?? null,
    p_min_count: p.filters.minCount ?? null,
    p_query_vec: queryVec,
    p_limit: p.limit ?? 5,
  });

  if (error) throw error;
  return { clips: await withSignedUrls(supabase, data ?? []) };
}

async function runPlayerRecord(
  supabase: ReturnType<typeof serviceClient>,
  p: PlayerRecordPlan,
  playerId: string
) {
  const { data, error } = await supabase
    .from("player_records")
    .select("wins, losses, matches_played")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw error;

  const wins = data?.wins ?? 0;
  const losses = data?.losses ?? 0;
  const matches = data?.matches_played ?? 0;
  const decided = wins + losses;

  if (p.field === "wins") {
    return { answer: `${wins} win${wins === 1 ? "" : "s"} on the books.`, count: wins };
  }
  if (p.field === "losses") {
    return {
      answer: `${losses} loss${losses === 1 ? "" : "es"} on the books.`,
      count: losses,
    };
  }
  if (p.field === "matches_played") {
    return {
      answer: `${matches} match${matches === 1 ? "" : "es"} played.`,
      count: matches,
    };
  }
  if (decided === 0) {
    return { answer: "No finished matches yet — play one to set a win rate." };
  }
  const pct = Math.round((wins / decided) * 100);
  return { answer: `You win ${pct}% of your matches.`, count: pct };
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
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
