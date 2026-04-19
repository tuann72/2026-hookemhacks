"use client";

import { BRAND } from "../shared/constants";
import type { ScoreLevel } from "../shared/types";

const RESULT_PLAYERS = [
  { name: "You",         tag: "P1", you: true  as const, delta: "+2", deltaUp: true  as const },
  { name: "Mango Molly", tag: "P2", you: false as const, delta: "-1", deltaUp: false as const },
  { name: "Coral Kai",   tag: "P3", you: false as const, delta: "+0", deltaUp: true  as const },
  { name: "Lavafoot",    tag: "P4", you: false as const, delta: "-1", deltaUp: false as const },
  { name: "Reef Rae",    tag: "P5", you: false as const, delta: "+1", deltaUp: true  as const },
  { name: "Sunny Steve", tag: "P6", you: false as const, delta: "-1", deltaUp: false as const },
  { name: "Palm Pete",   tag: "P7", you: false as const, delta: "+0", deltaUp: true  as const },
  { name: "Tiki Tomi",   tag: "P8", you: false as const, delta: "+0", deltaUp: true  as const },
] as const;

const RESULT_COLORS = [
  "#FF6B4A",
  "#2BB3C0",
  "#2E7D5B",
  "#FF5E7E",
  "#FFD24A",
  "#8A5EE0",
  "#4A90E2",
  "#E06B4A",
];

type ResultsProps = {
  onPlayAgain: () => void;
  onBackToLobby: () => void;
  playerCount?: number;
  scoreLevel?: ScoreLevel;
};

export function Results({ onPlayAgain, onBackToLobby, playerCount = 4, scoreLevel = "mid" }: ResultsProps) {
  const scoreMult = scoreLevel === "blowout" ? 1.8 : scoreLevel === "low" ? 0.35 : 1;
  const baseScores = [3240, 2980, 2740, 2380, 2010, 1690, 1420, 1080];
  const players = RESULT_PLAYERS.slice(0, playerCount).map((p, i) => ({
    ...p,
    color: RESULT_COLORS[i % RESULT_COLORS.length],
    score: Math.round(baseScores[i] * scoreMult),
  }));

  const top3 = players.slice(0, 3);
  const winner = top3[0];

  return (
    <div className="results-wrap">
      <div className="results-card card">
        <div className="results-hero">
          <div className="results-eyebrow">
            Match complete · {BRAND.gameName}
          </div>
          <h1 className="results-title">SUNSET.</h1>
          <div className="results-winner">
            🏆 {winner.name} took the cove with {winner.score.toLocaleString()} pts
          </div>
        </div>

        <div className="results-body">
          <div className="podium">
            {top3[1] && (
              <div className="podium-slot p2">
                <div className="avatar" style={{ background: top3[1].color }}>
                  {top3[1].name[0]}
                </div>
                <div className="name">{top3[1].name}</div>
                <div className="score">{top3[1].score.toLocaleString()}</div>
                <div className="bar">2</div>
              </div>
            )}
            {top3[0] && (
              <div className="podium-slot p1">
                <div
                  className="avatar"
                  style={{ background: top3[0].color, width: 72, height: 72, fontSize: 28 }}
                >
                  {top3[0].name[0]}
                </div>
                <div className="name" style={{ fontSize: 16 }}>
                  {top3[0].name}
                </div>
                <div className="score" style={{ fontSize: 24 }}>
                  {top3[0].score.toLocaleString()}
                </div>
                <div className="bar">1</div>
              </div>
            )}
            {top3[2] && (
              <div className="podium-slot p3">
                <div className="avatar" style={{ background: top3[2].color }}>
                  {top3[2].name[0]}
                </div>
                <div className="name">{top3[2].name}</div>
                <div className="score">{top3[2].score.toLocaleString()}</div>
                <div className="bar">3</div>
              </div>
            )}
          </div>

          <div className="results-stats">
            <div className="rs-tile">
              <div className="lbl">Your rank</div>
              <div className="val">#{players.findIndex((p) => p.you) + 1}</div>
              <div className="sub">of {playerCount} players</div>
            </div>
            <div className="rs-tile">
              <div className="lbl">Best combo</div>
              <div className="val">×18</div>
              <div className="sub">+540 bonus</div>
            </div>
            <div className="rs-tile">
              <div className="lbl">Calories</div>
              <div className="val">142</div>
              <div className="sub">well-earned smoothie</div>
            </div>
            <div className="rs-tile">
              <div className="lbl">Accuracy</div>
              <div className="val">87%</div>
              <div className="sub">joints tracked</div>
            </div>
          </div>

          <div className="full-rank">
            {players.map((p, i) => (
              <div key={p.tag} className={`rank-row ${p.you ? "you" : ""}`}>
                <div className="rank">#{i + 1}</div>
                <div className="avatar" style={{ background: p.color, width: 36, height: 36, fontSize: 15 }}>
                  {p.name[0]}
                </div>
                <div className="nm">
                  {p.name}
                  {p.you && (
                    <span className="mono you-tag">YOU</span>
                  )}
                </div>
                <div className={`delta ${p.deltaUp ? "" : "down"}`}>
                  {p.deltaUp ? "▲" : "▼"} {p.delta}
                </div>
                <div className="pts">{p.score.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="results-actions">
            <button type="button" className="btn ghost" style={{ flex: "0 0 auto" }} onClick={onBackToLobby}>
              ← Back to lobby
            </button>
            <button type="button" className="btn primary" style={{ flex: 1 }} onClick={onPlayAgain}>
              🌋 Rematch
            </button>
            <button type="button" className="btn dark" style={{ flex: "0 0 auto" }}>
              Share clip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
