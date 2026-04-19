"use client";

import { BRAND } from "../shared/constants";
import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import { CALORIES_PER_PUNCH } from "@/lib/combat/damage";

type ResultsProps = {
  winnerName: string;
  loserName: string;
  selfWon: boolean;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
};

const WINNER_COLOR = "#FFD24A";
const LOSER_COLOR = "#2BB3C0";

export function Results({
  winnerName,
  loserName,
  selfWon,
  onPlayAgain,
  onBackToLobby,
}: ResultsProps) {
  const heroWord = selfWon ? "VICTORY." : "SUNSET.";

  // Source of truth for per-match counts: the local PunchDetector's store,
  // which the calibrate panel also reads. More forgiving than useEventTracker
  // (DB path), so the Results numbers match what the player sees in-match.
  // Counts reset on each calibration (see GameLoadingOverlay baseline capture).
  const leftCount = usePunchCalibrationStore((s) => s.leftCount);
  const rightCount = usePunchCalibrationStore((s) => s.rightCount);
  const uppercutCount = usePunchCalibrationStore((s) => s.uppercutCount);
  const punches = leftCount + rightCount + uppercutCount;
  const calories = punches * CALORIES_PER_PUNCH;

  return (
    <div className="results-wrap" role="status" aria-live="polite">
      <div className="results-bg" />
      <div className="results-card card">
        <div className="results-hero">
          <div className="results-eyebrow">
            Match complete · {BRAND.gameName}
          </div>
          <h1 className="results-title">{heroWord}</h1>
          <div className="results-winner">
            🏆 {winnerName} took the cove
          </div>
        </div>

        <div className="results-body">
          <div className="duo">
            <div className="duo-slot winner">
              <div className="tag">WINNER</div>
              <div
                className="avatar"
                style={{ background: WINNER_COLOR }}
                aria-hidden
              >
                {winnerName[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="name">{winnerName}</div>
              <div className="sub mono">wins the round</div>
            </div>
            <div className="vs mono">VS</div>
            <div className="duo-slot loser">
              <div className="tag">KO</div>
              <div
                className="avatar"
                style={{ background: LOSER_COLOR }}
                aria-hidden
              >
                {loserName[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="name">{loserName}</div>
              <div className="sub mono">next time</div>
            </div>
          </div>

          <div className="results-stats">
            <div className="stat-cell">
              <span className="stat-number">{punches}</span>
              <span className="stat-label">Punches</span>
            </div>
            <div className="stat-cell calories">
              <span className="stat-number">{calories}</span>
              <span className="stat-label">Calories burned</span>
            </div>
          </div>

          <div className="results-actions">
            <button
              type="button"
              className="btn ghost"
              style={{ flex: "0 0 auto" }}
              onClick={onBackToLobby}
            >
              ← Back to lobby
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1 }}
              onClick={onPlayAgain}
            >
              🌋 Rematch
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .results-wrap {
          position: fixed;
          inset: 0;
          z-index: 10002;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px 24px;
          pointer-events: none;
          animation: results-fade 240ms ease-out both;
        }
        .results-bg {
          position: fixed;
          inset: 0;
          z-index: -1;
          background: color-mix(in srgb, black 55%, transparent);
        }
        .results-card {
          pointer-events: auto;
          background: white;
          border: 3px solid var(--sun);
          border-radius: var(--radius-lg);
          box-shadow:
            0 0 0 6px color-mix(in srgb, var(--sun) 22%, transparent),
            var(--shadow-chunky);
          padding: 28px 32px 24px;
          width: min(520px, 92vw);
          max-height: calc(100dvh - 56px);
          overflow-y: auto;
          color: var(--ink);
          animation: results-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .results-hero {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .results-eyebrow {
          font-family: var(--font-outfit), sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink);
        }
        .results-title {
          font-family: var(--font-outfit), sans-serif;
          font-size: clamp(36px, 7vw, 56px);
          font-weight: 800;
          line-height: 1;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--sun);
          margin: 6px 0 8px;
          text-shadow:
            0 3px 0 rgba(58, 46, 76, 0.18),
            0 8px 22px color-mix(in srgb, var(--sun) 30%, transparent);
        }
        .results-winner {
          font-family: var(--font-outfit), sans-serif;
          font-size: clamp(14px, 2.2vw, 16px);
          font-weight: 600;
          color: var(--ink);
          word-break: break-word;
          margin-bottom: 8px;
        }
        .results-body {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-top: 12px;
        }
        .duo {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 16px;
        }
        .duo-slot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 12px;
          border-radius: var(--radius);
          background: color-mix(in srgb, var(--sun) 6%, white);
          border: 2px solid color-mix(in srgb, var(--sun) 24%, transparent);
        }
        .duo-slot.loser {
          background: color-mix(in srgb, var(--ink) 4%, white);
          border-color: color-mix(in srgb, var(--ink) 12%, transparent);
          opacity: 0.92;
        }
        .duo-slot .tag {
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .duo-slot.winner .tag { color: var(--sun); }
        .duo-slot .avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-outfit), sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: white;
          box-shadow: var(--shadow-chunky);
        }
        .duo-slot .name {
          font-family: var(--font-outfit), sans-serif;
          font-size: 16px;
          font-weight: 700;
          color: var(--ink);
          text-align: center;
          word-break: break-word;
        }
        .duo-slot .sub {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .vs {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: var(--ink-soft);
        }
        .results-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .stat-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 12px 8px;
          border-radius: var(--radius);
          background: color-mix(in srgb, var(--ink) 4%, white);
          border: 2px solid color-mix(in srgb, var(--ink) 12%, transparent);
        }
        .stat-cell.calories {
          background: color-mix(in srgb, var(--sun) 10%, white);
          border-color: color-mix(in srgb, var(--sun) 32%, transparent);
        }
        .stat-cell .stat-number {
          font-family: var(--font-outfit), sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: var(--ink);
          line-height: 1.1;
        }
        .stat-cell.calories .stat-number { color: var(--sun); }
        .stat-cell .stat-label {
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .results-actions {
          display: flex;
          gap: 10px;
          align-items: stretch;
        }
        @keyframes results-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes results-pop {
          0%   { transform: scale(0.4) rotate(-4deg); opacity: 0; }
          60%  { transform: scale(1.04) rotate(1.5deg); opacity: 1; }
          100% { transform: scale(1)    rotate(0);     opacity: 1; }
        }
      `}</style>
    </div>
  );
}
