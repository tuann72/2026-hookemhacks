"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Backdrop } from "@/components/scenery/Scenery";
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
  | { kind: "clips"; clips: ClipResult[]; question: string }
  | { kind: "aggregate"; data: AggregateResult; question: string }
  | { kind: "error"; message: string };

type CareerRecord = {
  playerId: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number | null;
  lastPlayedAt: string | null;
};

const EXAMPLE_QUERIES = [
  "How many punches have I thrown?",
  "Show me a clip with 5+ punches",
  "Find a clip where I threw an amazing combo",
];

export default function CareerPage() {
  const { playerId, playerName } = useIdentity();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [record, setRecord] = useState<CareerRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    setRecordLoading(true);
    fetch(`/api/career/${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json && !json.error) setRecord(json as CareerRecord);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecordLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

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
          sessionStart: new Date(
            Date.now() - 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setResult({ kind: "error", message: json.error ?? "Unknown error" });
        return;
      }

      if ("clips" in json) {
        setResult({ kind: "clips", clips: json.clips, question: q });
      } else {
        setResult({ kind: "aggregate", data: json, question: q });
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

  const identityLabel = playerName?.trim() || "Traveler";
  const identityTag = playerId
    ? `#${playerId.slice(0, 6).toUpperCase()}`
    : null;

  return (
    <div className="app-stage" data-time="day" data-intensity="normal">
      <Backdrop />

      <Link href="/" className="career-back" aria-label="Back to home">
        <span aria-hidden="true">←</span>
        <span>Home</span>
      </Link>

      <main className="career-wrap">
        <aside className="career-col-left">
          <header className="career-head">
            <h1 className="career-title">Career</h1>
            {(playerName || playerId) && (
              <div className="career-identity mono">
                <span className="identity-avatar">
                  {identityLabel[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="identity-name">{identityLabel}</span>
                {identityTag && (
                  <span className="identity-tag">{identityTag}</span>
                )}
              </div>
            )}
          </header>

          <CareerScoreboard
            record={record}
            loading={recordLoading}
            hasPlayer={Boolean(playerId)}
          />
        </aside>

        <section className="career-col-right">
          <header className="archive-head">
            <span className="archive-eyebrow mono">
              <span aria-hidden="true">◎</span> Archive · ask the cove
            </span>
            <form onSubmit={handleSubmit} className="search-form">
              <div className="search-input-row">
                <input
                  className="search-input"
                  type="text"
                  placeholder={
                    '"How many punches today?"  ·  "Show me my best clip"'
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  suppressHydrationWarning
                />
                <button
                  type="submit"
                  className="search-btn"
                  disabled={loading || !query.trim()}
                  aria-label="Search"
                >
                  {loading ? (
                    <span className="spinner small" />
                  ) : (
                    <span aria-hidden="true">→</span>
                  )}
                </button>
              </div>

              <div className="example-chips">
                {EXAMPLE_QUERIES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setQuery(ex);
                      submit(ex);
                    }}
                    disabled={loading}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </form>
          </header>

          <div className="archive-results">
            {loading && (
              <div className="result-loading">
                <span className="spinner" />
                Diving through the footage…
              </div>
            )}

            {!loading && !result && (
              <div className="archive-placeholder">
                <span aria-hidden="true" className="placeholder-mark">
                  ◎
                </span>
                <p>
                  Ask a question to surface stats and clips from your history.
                </p>
              </div>
            )}

            {result?.kind === "error" && (
              <div className="result-card result-error">
                <strong>Couldn&apos;t answer that.</strong> {result.message}
              </div>
            )}

            {result?.kind === "aggregate" && (
              <AggregateView data={result.data} question={result.question} />
            )}
            {result?.kind === "clips" && (
              <ClipsView clips={result.clips} question={result.question} />
            )}
          </div>
        </section>
      </main>

      <style>{`
        .career-wrap {
          position: relative;
          z-index: 10;
          max-width: 1240px;
          margin: 0 auto;
          padding: 88px 40px 72px;
          display: grid;
          grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
          gap: 40px;
          align-items: start;
        }
        @media (max-width: 960px) {
          .career-wrap {
            grid-template-columns: 1fr;
            padding: 80px 24px 64px;
            gap: 32px;
          }
        }

        .career-col-left,
        .career-col-right {
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }
        .career-col-right { gap: 24px; }

        /* ==== Back button ==== */
        .career-back {
          position: fixed;
          top: 24px;
          left: 24px;
          z-index: 20;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px 10px 14px;
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          border-radius: 999px;
          box-shadow: var(--shadow-chunky);
          color: var(--ink);
          font-family: var(--font-outfit), system-ui, sans-serif;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          backdrop-filter: blur(6px);
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .career-back:hover {
          transform: translateY(-2px);
          border-color: var(--sun);
        }
        @media (max-width: 520px) {
          .career-back { top: 16px; left: 16px; padding: 8px 14px 8px 12px; font-size: 13px; }
        }

        /* ==== Header ==== */
        .career-head {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
        .career-title {
          font-family: var(--font-shrikhand), serif;
          font-size: clamp(48px, 6vw, 64px);
          line-height: 0.95;
          margin: 0;
          color: var(--volcano);
          text-shadow: 0 5px 0 rgba(58, 46, 76, 0.12);
          letter-spacing: -0.02em;
        }
        [data-time="night"] .career-title { color: var(--foam); }
        .career-identity {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 14px 6px 6px;
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          border-radius: 999px;
          backdrop-filter: blur(6px);
          box-shadow: var(--shadow-soft);
          margin-top: 6px;
          font-size: 12px;
          letter-spacing: 0.06em;
        }
        .identity-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--sun), var(--coral));
          color: white;
          display: grid;
          place-items: center;
          font-family: var(--font-shrikhand), serif;
          font-size: 14px;
          box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.12);
        }
        .identity-name {
          color: var(--ink);
          text-transform: uppercase;
          font-weight: 600;
        }
        .identity-tag {
          color: var(--ink-soft);
          padding-left: 10px;
          border-left: 1px solid var(--card-border);
        }

        /* ==== Scoreboard ==== */
        .scoreboard {
          position: relative;
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-chunky);
          backdrop-filter: blur(12px);
          padding: 22px 24px 26px;
          overflow: hidden;
          max-width: 320px;
          width: 100%;
          margin: 0;
        }
        .scoreboard::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: linear-gradient(90deg, var(--leaf) 0%, var(--sun) 50%, var(--coral) 100%);
          opacity: 0.9;
        }
        .scoreboard-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          text-align: center;
        }

        .score-split {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          padding: 8px 0 4px;
        }
        .score-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 80px;
        }
        .score-number {
          font-family: var(--font-shrikhand), serif;
          font-size: 72px;
          line-height: 0.9;
          letter-spacing: -0.02em;
          text-shadow: 0 4px 0 rgba(58, 46, 76, 0.12);
        }
        .score-cell.wins .score-number { color: var(--leaf); }
        .score-cell.losses .score-number { color: var(--coral); }
        .score-label {
          margin-top: 6px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .score-dash {
          font-family: var(--font-shrikhand), serif;
          font-size: 52px;
          line-height: 1;
          color: var(--ink-soft);
          opacity: 0.45;
          padding-bottom: 12px;
        }

        .score-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding-top: 18px;
          border-top: 1.5px dashed var(--card-border);
          width: 100%;
        }
        .meta-row {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 12px;
        }
        .meta-label {
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .meta-value {
          font-family: var(--font-shrikhand), serif;
          font-size: 28px;
          color: var(--ink);
          line-height: 1;
        }
        .meta-value.rate { color: var(--sun); }

        .winrate-track {
          position: relative;
          height: 10px;
          border-radius: 999px;
          background: rgba(58, 46, 76, 0.08);
          overflow: hidden;
          margin-top: 4px;
        }
        .winrate-fill {
          position: absolute;
          inset: 0 auto 0 0;
          background: linear-gradient(90deg, var(--leaf), var(--sun));
          border-radius: 999px;
          transition: width 0.8s cubic-bezier(.3,.9,.3,1);
        }
        .winrate-empty {
          font-size: 12px;
          color: var(--ink-soft);
          font-family: var(--font-jetbrains-mono), monospace;
          margin-top: 4px;
        }

        .scoreboard-empty {
          text-align: center;
          padding: 36px 8px;
          color: var(--ink-soft);
          font-size: 15px;
        }
        .scoreboard-empty strong {
          display: block;
          font-family: var(--font-shrikhand), serif;
          font-size: 28px;
          color: var(--volcano);
          margin-bottom: 6px;
        }
        .scoreboard-empty .spinner { margin-right: 10px; }

        @media (max-width: 420px) {
          .scoreboard { padding: 20px 18px 22px; }
          .score-number { font-size: 60px; }
          .score-dash { font-size: 44px; }
          .score-cell { min-width: 64px; }
        }

        /* ==== Archive (search) ==== */
        .archive-head {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .archive-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--sun);
        }
        .archive-eyebrow > span[aria-hidden] {
          font-size: 14px;
          letter-spacing: 0;
        }
        .archive-results {
          display: flex;
          flex-direction: column;
          gap: 18px;
          min-height: 0;
        }
        .archive-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 10px;
          padding: 48px 24px;
          border-radius: var(--radius-lg);
          border: 1.5px dashed var(--card-border);
          background: color-mix(in srgb, var(--card-bg) 60%, transparent);
          color: var(--ink-soft);
          font-size: 14px;
        }
        .archive-placeholder p { margin: 0; max-width: 360px; line-height: 1.5; }
        .placeholder-mark {
          font-size: 28px;
          color: var(--sun);
          opacity: 0.55;
        }

        .search-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .search-input-row {
          display: flex;
          gap: 10px;
          padding: 6px;
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          border-radius: 999px;
          backdrop-filter: blur(8px);
          box-shadow: var(--shadow-soft);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .search-input-row:focus-within {
          border-color: var(--sun);
          box-shadow: 0 10px 24px rgba(255, 107, 74, 0.14);
        }
        .search-input {
          flex: 1;
          padding: 12px 18px;
          border-radius: 999px;
          border: none;
          background: transparent;
          font-size: 15px;
          font-family: inherit;
          color: var(--ink);
          outline: none;
        }
        .search-input::placeholder {
          color: var(--ink-soft);
          opacity: 0.65;
        }
        .search-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: none;
          border-radius: 50%;
          background: var(--sun);
          color: white;
          font-family: inherit;
          font-weight: 700;
          font-size: 18px;
          cursor: pointer;
          box-shadow: 0 4px 0 rgba(58, 46, 76, 0.18);
          transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s;
          flex-shrink: 0;
        }
        .search-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 0 rgba(58, 46, 76, 0.2);
        }
        .search-btn:active:not(:disabled) {
          transform: translateY(1px);
          box-shadow: 0 2px 0 rgba(58, 46, 76, 0.2);
        }
        .search-btn:disabled { opacity: 0.55; cursor: default; }

        .example-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          padding: 7px 14px;
          border-radius: 999px;
          border: 1px solid var(--card-border);
          background: var(--card-bg);
          backdrop-filter: blur(6px);
          font-family: inherit;
          font-size: 12px;
          color: var(--ink-soft);
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, transform 0.15s;
        }
        .chip:hover:not(:disabled) {
          border-color: var(--sun);
          color: var(--ink);
          transform: translateY(-1px);
        }
        .chip:disabled { opacity: 0.5; cursor: default; }

        .result-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 18px 22px;
          border-radius: var(--radius-lg);
          background: var(--card-bg);
          border: 1px dashed var(--card-border);
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
        .spinner.small { width: 14px; height: 14px; border-width: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .result-card {
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-soft);
          backdrop-filter: blur(8px);
        }
        .result-error {
          border-color: var(--coral);
          color: var(--coral);
        }

        /* Aggregate */
        .agg-card {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding: 22px 24px 24px;
        }
        .agg-question {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .agg-eyebrow {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--sun);
        }
        .agg-question-text {
          margin: 0;
          font-family: var(--font-shrikhand), serif;
          font-size: 22px;
          line-height: 1.25;
          color: var(--volcano);
          letter-spacing: -0.01em;
        }
        [data-time="night"] .agg-question-text { color: var(--foam); }

        .agg-answer-row {
          display: flex;
          align-items: baseline;
          gap: 16px;
          padding-top: 10px;
          border-top: 1.5px dashed var(--card-border);
        }
        .agg-number {
          font-family: var(--font-shrikhand), serif;
          font-size: 72px;
          color: var(--sun);
          line-height: 0.9;
          letter-spacing: -0.02em;
          text-shadow: 0 4px 0 rgba(58, 46, 76, 0.12);
          flex-shrink: 0;
        }
        .agg-answer-copy {
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink-soft);
        }
        .agg-prose {
          margin: 0;
          font-size: 15px;
          line-height: 1.5;
          color: var(--ink);
        }

        .match-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 14px;
          border-top: 1.5px dashed var(--card-border);
        }
        .match-list-head {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-bottom: 2px;
        }
        .match-row {
          padding: 12px 14px;
          border-radius: var(--radius);
          background: rgba(58, 46, 76, 0.05);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .match-row-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 10px;
        }
        .match-row-date {
          font-size: 13px;
          color: var(--ink);
          font-weight: 600;
        }
        .match-row-duration {
          font-size: 11px;
          color: var(--ink-soft);
          letter-spacing: 0.08em;
        }

        .clips-wrap { display: flex; flex-direction: column; gap: 14px; }
        .clips-recap {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 14px 18px;
          border-radius: var(--radius-lg);
          border: 1.5px dashed var(--card-border);
          background: color-mix(in srgb, var(--card-bg) 70%, transparent);
        }

        /* Clips grid */
        .clips-heading {
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          margin: 0 0 14px;
        }
        .clips-empty {
          color: var(--ink-soft);
          font-size: 15px;
          text-align: center;
          padding: 48px 0;
          margin: 0;
        }
        .clips-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 18px;
        }
        .clip-card {
          position: relative;
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-chunky);
          backdrop-filter: blur(8px);
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .clip-card:hover {
          transform: translateY(-3px);
          border-color: var(--sun);
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
          color: rgba(255,255,255,0.35);
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .clip-distance {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.6);
          color: var(--glow);
          font-size: 11px;
          font-family: var(--font-jetbrains-mono), monospace;
          letter-spacing: 0.08em;
          padding: 4px 10px;
          border-radius: 999px;
        }
        .clip-body {
          padding: 16px 18px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .clip-caption {
          font-size: 13px;
          line-height: 1.55;
          color: var(--ink);
          margin: 0;
        }
        .clip-counts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .count-badge {
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255, 107, 74, 0.1);
          border: 1px solid rgba(255, 107, 74, 0.2);
          font-size: 11px;
          font-family: var(--font-jetbrains-mono), monospace;
          color: var(--sun);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .clip-time {
          font-size: 11px;
          color: var(--ink-soft);
          font-family: var(--font-jetbrains-mono), monospace;
          letter-spacing: 0.04em;
        }
        .caption-btn {
          align-self: flex-start;
          padding: 7px 14px;
          border-radius: 999px;
          border: 1.5px solid var(--card-border);
          background: transparent;
          color: var(--ink);
          font-family: inherit;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .caption-btn:hover:not(:disabled) {
          border-color: var(--sun);
          color: var(--sun);
        }
        .caption-btn:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </div>
  );
}

function CareerScoreboard({
  record,
  loading,
  hasPlayer,
}: {
  record: CareerRecord | null;
  loading: boolean;
  hasPlayer: boolean;
}) {
  if (!hasPlayer) {
    return (
      <section className="scoreboard">
        <div className="scoreboard-empty">
          <strong>No record yet.</strong>
          Play a match to start tracking your career.
        </div>
      </section>
    );
  }

  if (loading && !record) {
    return (
      <section className="scoreboard">
        <div className="scoreboard-empty">
          <span className="spinner" />
          Loading your record…
        </div>
      </section>
    );
  }

  if (!record) {
    return (
      <section className="scoreboard">
        <div className="scoreboard-empty">
          <strong>Fresh slate.</strong>
          Your first match will show up here.
        </div>
      </section>
    );
  }

  const winRatePct =
    record.winRate === null ? 0 : Math.round(record.winRate * 100);
  const winRateLabel = record.winRate === null ? "—" : `${winRatePct}%`;

  return (
    <section className="scoreboard">
      <div className="scoreboard-main">
        <div className="score-split">
          <div className="score-cell wins">
            <span className="score-number">{record.wins}</span>
            <span className="score-label">Wins</span>
          </div>
          <div className="score-dash" aria-hidden="true">
            –
          </div>
          <div className="score-cell losses">
            <span className="score-number">{record.losses}</span>
            <span className="score-label">Losses</span>
          </div>
        </div>

        <div className="score-meta">
          <div className="meta-row">
            <span className="meta-label">Matches played</span>
            <span className="meta-value">{record.matchesPlayed}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Win rate</span>
            <span className="meta-value rate">{winRateLabel}</span>
          </div>
          {record.winRate !== null ? (
            <div className="winrate-track" aria-hidden="true">
              <div
                className="winrate-fill"
                style={{ width: `${winRatePct}%` }}
              />
            </div>
          ) : (
            <p className="winrate-empty">No finished matches yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function AggregateView({
  data,
  question,
}: {
  data: AggregateResult;
  question: string;
}) {
  const hasCount = data.count !== undefined;
  const answerIsJustCount =
    hasCount && data.answer?.trim() === String(data.count);
  const prose = !answerIsJustCount ? data.answer?.trim() : null;

  return (
    <div className="result-card agg-card">
      <div className="agg-question">
        <span className="agg-eyebrow mono">You asked</span>
        <p className="agg-question-text">“{question}”</p>
      </div>

      {hasCount && (
        <div className="agg-answer-row">
          <span className="agg-number">{data.count}</span>
          <span className="agg-answer-copy">
            {data.count === 0
              ? "Nothing on record yet — play a match and this fills in."
              : (prose ?? "on the books.")}
          </span>
        </div>
      )}

      {!hasCount && prose && <p className="agg-prose">{prose}</p>}

      {data.matches && data.matches.length > 0 && (
        <div className="match-list">
          <div className="match-list-head mono">Matches</div>
          {data.matches.map((m, i) => (
            <MatchRow key={i} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: Record<string, unknown> }) {
  const startedAt =
    typeof match.started_at === "string" ? new Date(match.started_at) : null;
  const durationMs =
    typeof match.duration_ms === "number" ? match.duration_ms : null;
  const totals =
    match.event_totals && typeof match.event_totals === "object"
      ? (match.event_totals as Record<string, number>)
      : {};
  const totalEntries = Object.entries(totals).filter(([, v]) => v > 0);

  return (
    <div className="match-row">
      <div className="match-row-head">
        <span className="match-row-date">
          {startedAt ? startedAt.toLocaleString() : "Match"}
        </span>
        {durationMs !== null && (
          <span className="match-row-duration mono">
            {Math.round(durationMs / 1000)}s
          </span>
        )}
      </div>
      {totalEntries.length > 0 && (
        <div className="clip-counts">
          {totalEntries.map(([k, v]) => (
            <span key={k} className="count-badge">
              {k} ×{v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ClipsView({
  clips,
  question,
}: {
  clips: ClipResult[];
  question: string;
}) {
  return (
    <div className="clips-wrap">
      <div className="clips-recap">
        <span className="agg-eyebrow mono">You asked</span>
        <p className="agg-question-text">“{question}”</p>
      </div>
      {clips.length === 0 ? (
        <div className="result-card">
          <p className="clips-empty">
            No clips match that yet. Try something looser.
          </p>
        </div>
      ) : (
        <>
          <p className="clips-heading">
            {clips.length} clip{clips.length !== 1 ? "s" : ""} from your history
          </p>
          <div className="clips-grid">
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClipCard({ clip }: { clip: ClipResult }) {
  const counts = Object.entries(clip.event_counts ?? {}).filter(
    ([, v]) => v > 0,
  );
  const time = clip.started_at
    ? new Date(clip.started_at).toLocaleString()
    : null;
  const [caption, setCaption] = useState<string | null>(clip.caption ?? null);
  const [captionLoading, setCaptionLoading] = useState(false);

  const fetchCaption = async () => {
    setCaptionLoading(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}/caption`, {
        method: "POST",
      });
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
            className="caption-btn"
            onClick={fetchCaption}
            disabled={captionLoading}
          >
            {captionLoading ? "Generating…" : "Explain this clip"}
          </button>
        )}
        {counts.length > 0 && (
          <div className="clip-counts">
            {counts.map(([k, v]) => (
              <span key={k} className="count-badge">
                {k} ×{v}
              </span>
            ))}
          </div>
        )}
        {time && <span className="clip-time">{time}</span>}
      </div>
    </div>
  );
}
