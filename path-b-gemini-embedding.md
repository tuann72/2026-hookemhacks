# Path B — Direct Multimodal Embedding (Gemini-Only)

**Replaces Phase 4 (Embedder) and Phase 6.3 (Hybrid dispatch) from the main implementation plan.** Everything else in the main plan — schema, ingestion, event tracking, query planner, aggregate/retrieve dispatch — is unchanged.

The core shift: we do **not** caption clips to embed them. We embed the video clip directly with `gemini-embedding-2-preview`, which produces a vector in the same space as text query embeddings. Captions are generated lazily on demand with Flash-Lite when a user actually views a result, purely as a "why this matched" explanation.

## Models used

| Purpose | Model | Where |
|---|---|---|
| Clip embedding | `gemini-embedding-2-preview` | Embedder worker, at clip ingest |
| Query embedding | `gemini-embedding-2-preview` | `/api/query`, at search time |
| Query planning | `gemini-2.5-flash` | `/api/query`, to produce the JSON plan |
| On-demand caption | `gemini-2.5-flash-lite` | `/api/clips/:id/caption`, lazy, one clip at a time |

**Critical invariant:** the clip and the query must be embedded with the same model name AND the same output dimensionality. Mixing either produces garbage ranking silently.

---

## Step 1 — Update schema for the new embedding dimension

Use 1536 dimensions. It's the quality/storage sweet spot for Matryoshka embeddings and keeps the ivfflat index healthy.

```sql
-- Drop the old index first (can't alter a column with an index on it)
drop index if exists clips_embedding_idx;

-- Change the vector dimension
alter table clips alter column embedding type vector(1536);

-- Add a lazy caption column (populated on demand, not at ingest)
alter table clips add column caption_generated_at timestamptz;

-- Recreate the ivfflat index
create index clips_embedding_idx on clips
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

If you already have clips embedded at 768 dimensions, either wipe and re-embed or add a second column and migrate. For a project not yet in production, wipe and re-embed.

## Step 2 — Install the Google GenAI SDK

In the Next.js project root:

```bash
npm install @google/genai
```

The official SDK is `@google/genai` (new unified SDK). Drop `@google/generative-ai` if you installed it from the earlier plan — the new one replaces it.

## Step 3 — Create a shared Gemini client module

Create `lib/gemini.ts`:

```ts
import { GoogleGenAI } from '@google/genai';

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export const MODELS = {
  embed: 'gemini-embedding-2-preview',
  caption: 'gemini-2.5-flash-lite',
  plan: 'gemini-2.5-flash',
} as const;

export const EMBED_DIM = 1536;
```

Centralizing this keeps the invariant (same model, same dimension for ingest and query) enforceable by reading it in one place.

## Step 4 — Replace the embedder worker

Delete or replace the body of `app/api/embedder/tick/route.ts` from the original plan. The new version embeds the video directly — no caption, no second API call.

```ts
// app/api/embedder/tick/route.ts
import { createClient } from '@supabase/supabase-js';
import { gemini, MODELS, EMBED_DIM } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (req.headers.get('x-webhook-secret') !== process.env.EMBEDDER_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const body = await req.json();
  const clipId = body.record?.id;
  if (!clipId) return new Response('no id', { status: 400 });

  const work = processClip(clipId).catch((err) =>
    console.error('embed failed', clipId, err)
  );

  if (typeof (globalThis as any).waitUntil === 'function') {
    (globalThis as any).waitUntil(work);
    return Response.json({ ok: true, queued: true });
  }
  await work;
  return Response.json({ ok: true });
}

async function processClip(clipId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Atomically claim the row
  const { data: claimed } = await supabase
    .from('clips')
    .update({ embedding_status: 'processing' })
    .eq('id', clipId)
    .eq('embedding_status', 'pending')
    .select('id, storage_path, event_counts')
    .single();
  if (!claimed) return;

  // Cost guardrail: skip clips with zero detected events.
  // An empty chunk isn't worth embedding — nobody's going to search for it,
  // and it wastes quota.
  const totalEvents = Object.values(claimed.event_counts ?? {})
    .reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  if (totalEvents === 0) {
    await supabase.from('clips')
      .update({ embedding_status: 'skipped' })
      .eq('id', clipId);
    return;
  }

  try {
    // 1. Download the clip from Supabase Storage
    const { data: blob } = await supabase.storage
      .from('gameplay-clips')
      .download(claimed.storage_path);
    const buffer = Buffer.from(await blob!.arrayBuffer());

    // 2. Embed the video directly with gemini-embedding-2-preview
    const result = await gemini.models.embedContent({
      model: MODELS.embed,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'video/webm',
                data: buffer.toString('base64'),
              },
            },
          ],
        },
      ],
      config: {
        outputDimensionality: EMBED_DIM,
        // taskType RETRIEVAL_DOCUMENT tells the model this vector will be
        // retrieved against queries. Use RETRIEVAL_QUERY on the search side.
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    });

    const embedding = result.embeddings?.[0]?.values;
    if (!embedding || embedding.length !== EMBED_DIM) {
      throw new Error(`unexpected embedding shape: ${embedding?.length}`);
    }

    // 3. Normalize — required for any dimension below 3072 to get correct
    // cosine similarity. pgvector's <=> assumes this.
    const normed = normalize(embedding);

    // 4. Write back
    await supabase.from('clips').update({
      embedding: normed,
      embedding_status: 'ready',
    }).eq('id', clipId);

  } catch (err) {
    await supabase.from('clips')
      .update({ embedding_status: 'failed' })
      .eq('id', clipId);
    throw err;
  }
}

function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}
```

Key points:

- **Normalization is mandatory** for 1536 (and any non-3072) dimension. Matryoshka-truncated vectors aren't unit-length out of the box, and pgvector's cosine distance operator gives wrong rankings if you skip this.
- **Task type matters.** `RETRIEVAL_DOCUMENT` at ingest, `RETRIEVAL_QUERY` at search. These tune the embedding for asymmetric retrieval (corpus vs query) and measurably improve recall.
- **`skipped` is a new status value.** Add a short note to your docs: `pending | processing | ready | failed | skipped`. Empty-event clips never become searchable. That's intentional — zero-action chunks aren't findable anyway.

## Step 5 — Update the hybrid search RPC to use RETRIEVAL_QUERY

The SQL function from the original plan's Phase 6.3 doesn't need to change, but the dispatcher code that calls it does. Open whatever file holds `runHybrid` and swap the embedding call:

```ts
// wherever runHybrid lives (e.g. app/api/query/route.ts or a dispatcher module)
import { gemini, MODELS, EMBED_DIM } from '@/lib/gemini';

async function embedQuery(text: string): Promise<number[]> {
  const result = await gemini.models.embedContent({
    model: MODELS.embed,
    contents: [{ parts: [{ text }] }],
    config: {
      outputDimensionality: EMBED_DIM,
      taskType: 'RETRIEVAL_QUERY',  // NOT RETRIEVAL_DOCUMENT
    },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values) throw new Error('no query embedding returned');
  return normalize(values);
}

async function runHybrid(p: HybridPlan) {
  const embed = await embedQuery(p.semanticQuery);

  const { data } = await supabase.rpc('search_clips_hybrid', {
    p_player_id:  p.filters.playerId,
    p_event_type: p.filters.eventType ?? null,
    p_min_count:  p.filters.minCount ?? null,
    p_query_vec:  embed,
    p_limit:      p.limit ?? 5,
  });

  return { clips: await withSignedUrls(data ?? []) };
}

function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}
```

Also update the RPC signature to expect 1536 dims — open your migrations and replace the function:

```sql
create or replace function search_clips_hybrid(
  p_player_id  uuid,
  p_event_type text,
  p_min_count  int,
  p_query_vec  vector(1536),
  p_limit      int
) returns table (
  id uuid, storage_path text, event_counts jsonb, distance float
) language sql stable as $$
  select id, storage_path, event_counts,
         embedding <=> p_query_vec as distance
  from clips
  where player_id = p_player_id
    and embedding_status = 'ready'
    and (p_event_type is null
         or (event_counts->>p_event_type)::int >= coalesce(p_min_count, 1))
  order by embedding <=> p_query_vec
  limit p_limit;
$$;
```

Note the return table no longer includes `caption` — we're not storing captions at ingest anymore.

## Step 6 — Add the lazy caption endpoint

This is the explanation layer. Only called when a user actually views a matched clip, so it's gated by real usage and rate-limit exposure is tiny.

Create `app/api/clips/[id]/caption/route.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { gemini, MODELS } from '@/lib/gemini';

export const runtime = 'nodejs';
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

  // If we already have a caption, return it — no point regenerating
  const { data: existing } = await supabase
    .from('clips')
    .select('caption, storage_path')
    .eq('id', clipId)
    .single();

  if (existing?.caption) {
    return Response.json({ caption: existing.caption, cached: true });
  }
  if (!existing) {
    return Response.json({ error: 'clip not found' }, { status: 404 });
  }

  // Download and caption with Flash-Lite
  const { data: blob } = await supabase.storage
    .from('gameplay-clips')
    .download(existing.storage_path);
  const buffer = Buffer.from(await blob!.arrayBuffer());

  const result = await gemini.models.generateContent({
    model: MODELS.caption,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'video/webm',
              data: buffer.toString('base64'),
            },
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

  const caption = result.text?.trim() ?? '';

  await supabase.from('clips').update({
    caption,
    caption_generated_at: new Date().toISOString(),
  }).eq('id', clipId);

  return Response.json({ caption, cached: false });
}
```

Client-side, after showing matched clips, call this when the user expands or plays one. The caption gets written back to the row so subsequent views are free.

## Step 7 — Keep the sweep cron, add `skipped` awareness

Your existing stuck-row sweep cron needs one tweak — don't sweep `skipped` rows back to pending:

```sql
update clips
set embedding_status = 'pending'
where embedding_status = 'processing'
  and created_at < now() - interval '10 minutes';
-- (skipped rows are terminal — leave them alone)
```

## Step 8 — Validation checklist before declaring Path B done

Run through these in order. If any fails, fix before moving on.

1. **Schema check.** `\d clips` in psql shows `embedding` as `vector(1536)` and the ivfflat index exists.
2. **Embed a real clip.** Upload one test chunk, watch the webhook fire, confirm the row transitions `pending → processing → ready` and `embedding` is non-null with 1536 values.
3. **Embed a text query.** Call `embedQuery("a fast combo")` from a Node REPL, confirm you get 1536 normalized floats back (norm ≈ 1.0).
4. **Sanity-check similarity.** Embed three text queries: "a fast punch combo", "a slow dodge", and "ordering pizza". Confirm query 1 is much closer to a punch-heavy clip than queries 2 and 3. If the ordering looks random, something is wrong with normalization or task types.
5. **End-to-end hybrid query.** Ask the planner "find a clip where I threw an amazing combo" and confirm you get ranked results with signed URLs. Click one, call the lazy caption endpoint, confirm the caption reads as a plausible description of the clip.
6. **Rate-limit realism.** Upload 20 chunks in quick succession, confirm nothing 429s. If it does, add a small queue delay between embedder invocations — this is only an issue if you're hammering the preview model's RPM.

## Summary of what's different from the original plan

- **One embedding call per clip, not two.** No caption generation at ingest.
- **1536-dim vectors**, normalized in code because the non-3072 output isn't unit-length.
- **`taskType` is set explicitly** on both sides of retrieval (`RETRIEVAL_DOCUMENT` at ingest, `RETRIEVAL_QUERY` at search).
- **Captions are lazy** — generated only when a user views a result, cached after first generation.
- **Empty-event clips are `skipped`** and never take up quota or storage in the searchable set.
- **Preview model caveat:** `gemini-embedding-2-preview` rate limits are stricter than GA. The skip-empty-clips guardrail is the main mitigation. If preview limits bite in practice, the fallback is to revert to Path A (Flash caption + `gemini-embedding-001` at 1536 dims on the caption text) — a one-file change to the embedder.
