"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Backdrop } from "@/components/scenery/Scenery";
import { CalibrationPanel } from "@/components/pages/CalibrationPanel";
import { BRAND } from "@/components/shared/constants";
import BodyDetector from "@/components/detection/BodyDetector";

const AVATAR_COLORS = ["#FF6B4A", "#2BB3C0", "#2E7D5B", "#FF5E7E", "#FFD24A", "#8A5EE0", "#4A90E2", "#E06B4A"];

const MOCK_PLAYERS = [
  { name: "You",         tag: "HOST", host: true  },
  { name: "Mango Molly", tag: "P2",   host: false },
  { name: "Coral Kai",   tag: "P3",   host: false },
  { name: "Lavafoot",    tag: "P4",   host: false },
  { name: "Reef Rae",    tag: "P5",   host: false },
];

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = (params.roomId as string).toUpperCase();

  const [copied, setCopied] = useState(false);
  const [localReady, setLocalReady] = useState(false);

  const players = MOCK_PLAYERS.map((p, i) => ({
    ...p,
    ready: p.host ? localReady : i % 2 === 0,
  }));

  const readyCount = players.filter((p) => p.ready).length;

  const copyCode = () => {
    navigator.clipboard.writeText(roomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="app-stage" data-time="day" data-intensity="normal">
      <Backdrop />

      <div className="topbar">
        <Link href="/" className="logo" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
          <div className="logo-mark" />
          <span>{BRAND.gameName}</span>
        </Link>
        <div className="nav-pills">
          <div className="nav-pill" style={{ opacity: 0.45 }}>
            <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>01</span>
            Create
          </div>
          <div className="nav-pill active">
            <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>02</span>
            Lobby
          </div>
          <div className="nav-pill" style={{ opacity: 0.45 }}>
            <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>03</span>
            Play
          </div>
        </div>
      </div>

      <div className="lobby-layout">
        {/* ── Left: player list ── */}
        <div className="lobby-panel card">
          <div className="hj-eyebrow">{BRAND.event} · {BRAND.gameName} · Lobby</div>
          <h2 className="hj-title" style={{ fontSize: "clamp(24px, 4vw, 36px)", marginBottom: 4 }}>
            Build a cove.
          </h2>

          <div className="room-code-label" style={{ marginTop: 16 }}>Your room word</div>
          <div className="room-code">
            {roomId.split("").map((c, i) => (
              <div key={i} className="code-digit">{c}</div>
            ))}
          </div>
          <div className="copy-row">
            <span>Share this with friends</span>
            <button type="button" className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyCode}>
              {copied ? "✓ COPIED" : "COPY CODE"}
            </button>
          </div>

          <div className="players-label" style={{ marginTop: 20 }}>
            <span>Crew in the cove</span>
            <span className="count">{readyCount}/{players.length}</span>
          </div>
          <div className="player-list">
            {players.map((p, i) => (
              <div key={p.tag} className={`player-row ${p.host ? "host" : ""}`}>
                <div className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                  {p.name[0]}
                </div>
                <div>
                  <div className="player-name">
                    {p.name}
                    {p.host && <span className="host-badge mono">HOST</span>}
                  </div>
                  <div className="player-meta mono">
                    <span className={`ready-dot ${p.ready ? "" : "waiting"}`} />
                    {p.ready ? "Calibrated & ready" : "Calibrating…"}
                  </div>
                </div>
                <div className="player-meta mono">{p.tag}</div>
              </div>
            ))}
            {[0, 1].map((i) => (
              <div key={`empty-${i}`} className="player-row empty">
                <div className="avatar" style={{ background: "rgba(58,46,76,0.15)" }}>?</div>
                <div>
                  <div className="player-name">Waiting for a buddy…</div>
                  <div className="player-meta mono">slot open</div>
                </div>
                <div className="player-meta mono">—</div>
              </div>
            ))}
          </div>

          <div className="action-row" style={{ marginTop: 20 }}>
            <Link
              href="/"
              className="btn ghost"
              style={{ flex: "0 0 auto", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ← Leave
            </Link>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1 }}
              onClick={() => router.push(`/game/${roomId}`)}
            >
              Start match →
            </button>
          </div>
        </div>

        {/* ── Right: calibration ── */}
        <div className="lobby-cal card">
          <BodyDetector>
            <CalibrationPanel onReady={() => setLocalReady(true)} />
          </BodyDetector>
        </div>
      </div>

      <style>{`
        .lobby-layout {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: flex-start;
          gap: 20px;
          padding: 90px 24px 24px;
          min-height: 100dvh;
          max-width: 1100px;
          margin: 0 auto;
        }
        .lobby-panel {
          flex: 0 0 420px;
          overflow-y: auto;
          max-height: calc(100dvh - 114px);
          padding: 28px;
        }
        .lobby-cal {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          height: calc(100dvh - 114px);
          padding: 24px;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .lobby-layout {
            flex-direction: column;
            padding-top: 80px;
          }
          .lobby-panel { flex: none; width: 100%; max-height: none; }
          .lobby-cal { height: 480px; width: 100%; }
        }
      `}</style>
    </div>
  );
}
