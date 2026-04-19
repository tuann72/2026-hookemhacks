"use client";

import { useState } from "react";
import { useIdentity } from "@/hooks/useIdentity";

type ClipResult = {
  id: string;
  caption?: string | null;
  event_counts: Record<string, number>;
  started_at?: string | null;
  videoUrl: string | null;
  distance?: number;
};

type AggregateResult = {
  answer: string;
  count?: number;
  matches?: Record<string, unknown>[];
};

type QueryResult =
  | { kind: "clips"; clips: ClipResult[] }
  | { kind: "aggregate"; data: AggregateResult }
  | { kind: "error"; message: string };

const EXAMPLE_QUERIES = [
  "How many punches have I thrown?",
  "Show me a clip with 5+ punches",
  "Find a clip where I threw an amazing combo",
  "What was my best round?",
];

export default function SearchPage() {
  const { playerId, playerName } = useIdentity();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  const submit = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          playerId: playerId || undefined,
          sessionStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setResult({ kind: "error", message: json.error ?? "Unknown error" });
        return;
      }

      if ("clips" in json) {
        setResult({ kind: "clips", clips: json.clips });
      } else {
        setResult({ kind: "aggregate", data: json });
      }
    } catch {
      setResult({ kind: "error", message: "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(query);
  };

  return (
    <div className="search-page">
      <header className="search-header">
        <div className="search-header-inner">
          <div>
            <h1 className="search-title">Career</h1>
            {(playerName || playerId) && (
              <p className="search-subtitle mono">
                {playerName || playerId}
              </p>
            )}
          </div>
          <a href="/" className="btn ghost btn-sm">← Home</a>
        </div>
      </header>

      <main className="search-main">
        <form onSubmit={handleSubmit} className="search-form">
          <div className="search-input-row">
            <input
              className="search-input"
              type="text"
              placeholder={'Ask anything… "How many punches today?" or "Show me my best clip"'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              autoFocus
              suppressHydrationWarning
            />
            <button
              type="submit"
              className="btn primary search-btn"
              disabled={loading || !query.trim()}
            >
              {loading ? "…" : "Search"}
            </button>
          </div>

          <div className="example-chips">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="chip"
                onClick={() => { setQuery(ex); submit(ex); }}
                disabled={loading}
              >
                {ex}
              </button>
            ))}
          </div>
        </form>

        {loading && (
          <div className="result-loading">
            <span className="spinner" />
            Thinking…
          </div>
        )}

        {result?.kind === "error" && (
          <div className="result-card result-error">
            <strong>Error:</strong> {result.message}
          </div>
        )}

        {result?.kind === "aggregate" && (
          <AggregateView data={result.data} />
        )}

        {result?.kind === "clips" && (
          <ClipsView clips={result.clips} />
        )}
      </main>

      <style>{`
        .search-page {
          min-height: 100dvh;
          background: var(--background);
          color: var(--ink);
          font-family: var(--font-outfit), system-ui, sans-serif;
        }

        .search-header {
          border-bottom: 1px solid var(--card-border);
          background: var(--card-bg);
          backdrop-filter: blur(8px);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .search-header-inner {
          max-width: 900px;
          margin: 0 auto;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .search-title {
          font-family: var(--font-shrikhand), serif;
          font-size: 28px;
          margin: 0;
          line-height: 1;
        }
        .search-subtitle {
          font-size: 12px;
          color: var(--ink-soft);
          margin: 4px 0 0;
          letter-spacing: 0.06em;
        }

        .search-main {
          max-width: 900px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .search-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .search-input-row {
          display: flex;
          gap: 10px;
        }
        .search-input {
          flex: 1;
          padding: 14px 18px;
          border-radius: var(--radius);
          border: 1.5px solid var(--card-border);
          background: var(--card-bg);
          font-size: 15px;
          font-family: inherit;
          color: var(--ink);
          outline: none;
          transition: border-color 0.15s;
        }
        .search-input:focus {
          border-color: var(--sun);
        }
        .search-input::placeholder {
          color: var(--ink-soft);
          opacity: 0.6;
        }
        .search-btn {
          padding: 14px 24px;
          font-size: 15px;
          white-space: nowrap;
        }

        .example-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          padding: 6px 14px;
          border-radius: 999px;
          border: 1px solid var(--card-border);
          background: var(--card-bg);
          font-size: 12px;
          font-family: inherit;
          color: var(--ink-soft);
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .chip:hover:not(:disabled) {
          border-color: var(--sun);
          color: var(--ink);
        }
        .chip:disabled { opacity: 0.5; cursor: default; }

        .result-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--ink-soft);
          font-size: 15px;
        }
        .spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid var(--card-border);
          border-top-color: var(--sun);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .result-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-soft);
        }
        .result-error {
          border-color: var(--coral);
          color: var(--coral);
        }

        /* Aggregate */
        .agg-number {
          font-family: var(--font-shrikhand), serif;
          font-size: 72px;
          color: var(--sun);
          line-height: 1;
          margin: 0 0 4px;
        }
        .agg-label {
          font-size: 14px;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .match-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 16px;
        }
        .match-item {
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          background: rgba(58,46,76,0.04);
          font-size: 13px;
          font-family: var(--font-jetbrains-mono), monospace;
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* Clips grid */
        .clips-heading {
          font-size: 13px;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 0 0 16px;
        }
        .clips-empty {
          color: var(--ink-soft);
          font-size: 15px;
          text-align: center;
          padding: 48px 0;
        }
        .clips-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }
        .clip-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-soft);
        }
        .clip-video-wrap {
          aspect-ratio: 4/3;
          background: var(--volcano);
          position: relative;
        }
        .clip-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .clip-no-video {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.3);
          font-size: 12px;
        }
        .clip-distance {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0,0,0,0.55);
          color: var(--glow);
          font-size: 11px;
          font-family: var(--font-jetbrains-mono), monospace;
          padding: 3px 8px;
          border-radius: 999px;
        }
        .clip-body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .clip-caption {
          font-size: 13px;
          line-height: 1.5;
          color: var(--ink);
        }
        .clip-counts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .count-badge {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(58,46,76,0.07);
          font-size: 11px;
          font-family: var(--font-jetbrains-mono), monospace;
          color: var(--ink-soft);
          text-transform: uppercase;
        }
        .clip-time {
          font-size: 11px;
          color: var(--ink-soft);
          font-family: var(--font-jetbrains-mono), monospace;
        }

        /* shared btn styles mirror the app globals */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: var(--radius);
          font-family: inherit;
          font-weight: 600;
          font-size: 14px;
          border: none;
          cursor: pointer;
          text-decoration: none;
          transition: transform 0.12s ease, opacity 0.12s;
        }
        .btn:disabled { opacity: 0.5; cursor: default; }
        .btn:hover:not(:disabled) { transform: translateY(-1px); }
        .btn:active:not(:disabled) { transform: translateY(1px); }
        .btn.primary { background: var(--sun); color: white; box-shadow: var(--shadow-chunky); }
        .btn.ghost { background: var(--card-bg); border: 1.5px solid var(--card-border); color: var(--ink); }
        .btn-sm { padding: 7px 14px; font-size: 13px; }
        .mono { font-family: var(--font-jetbrains-mono), monospace; }
        .caption-btn { font-size: 11px; padding: 5px 12px; align-self: flex-start; }
      `}</style>
    </div>
  );
}

function AggregateView({ data }: { data: AggregateResult }) {
  return (
    <div className="result-card">
      {data.count !== undefined && (
        <>
          <p className="agg-number">{data.count}</p>
          <p className="agg-label">{data.answer}</p>
        </>
      )}
      {data.count === undefined && (
        <p style={{ fontSize: 16, margin: 0 }}>{data.answer}</p>
      )}
      {data.matches && data.matches.length > 0 && (
        <div className="match-list">
          {data.matches.map((m, i) => (
            <div key={i} className="match-item">
              {JSON.stringify(m, null, 2)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClipsView({ clips }: { clips: ClipResult[] }) {
  if (clips.length === 0) {
    return (
      <div className="result-card">
        <p className="clips-empty">No clips found matching that query.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="clips-heading">{clips.length} clip{clips.length !== 1 ? "s" : ""} found</p>
      <div className="clips-grid">
        {clips.map((clip) => (
          <ClipCard key={clip.id} clip={clip} />
        ))}
      </div>
    </div>
  );
}

function ClipCard({ clip }: { clip: ClipResult }) {
  const counts = Object.entries(clip.event_counts ?? {}).filter(([, v]) => v > 0);
  const time = clip.started_at ? new Date(clip.started_at).toLocaleString() : null;
  const [caption, setCaption] = useState<string | null>(clip.caption ?? null);
  const [captionLoading, setCaptionLoading] = useState(false);

  const fetchCaption = async () => {
    setCaptionLoading(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}/caption`, { method: "POST" });
      const json = await res.json();
      if (json.caption) setCaption(json.caption);
    } finally {
      setCaptionLoading(false);
    }
  };

  return (
    <div className="clip-card">
      <div className="clip-video-wrap">
        {clip.videoUrl ? (
          <video
            className="clip-video"
            src={clip.videoUrl}
            controls
            preload="metadata"
            playsInline
          />
        ) : (
          <div className="clip-no-video">no video</div>
        )}
        {clip.distance !== undefined && (
          <span className="clip-distance">
            {(clip.distance * 100).toFixed(0)}% match
          </span>
        )}
      </div>
      <div className="clip-body">
        {caption ? (
          <p className="clip-caption">{caption}</p>
        ) : (
          <button
            type="button"
            className="btn ghost btn-sm caption-btn"
            onClick={fetchCaption}
            disabled={captionLoading}
          >
            {captionLoading ? "Generating…" : "Explain this clip"}
          </button>
        )}
        {counts.length > 0 && (
          <div className="clip-counts">
            {counts.map(([k, v]) => (
              <span key={k} className="count-badge">{k} ×{v}</span>
            ))}
          </div>
        )}
        {time && <span className="clip-time">{time}</span>}
      </div>
    </div>
  );
}
