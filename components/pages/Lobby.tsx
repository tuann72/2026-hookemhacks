"use client";

import { useRef, useState } from "react";
import { BRAND } from "../shared/constants";

const AVATAR_COLORS = [
  "#FF6B4A",
  "#2BB3C0",
  "#2E7D5B",
  "#FF5E7E",
  "#FFD24A",
  "#8A5EE0",
  "#4A90E2",
  "#E06B4A",
];

const MOCK_PLAYERS = [
  { name: "You", tag: "HOST", ready: true, host: true },
  { name: "Mango Molly", tag: "P2", ready: true, host: false },
  { name: "Coral Kai", tag: "P3", ready: true, host: false },
  { name: "Lavafoot", tag: "P4", ready: false, host: false },
  { name: "Reef Rae", tag: "P5", ready: true, host: false },
  { name: "Sunny Steve", tag: "P6", ready: false, host: false },
  { name: "Palm Pete", tag: "P7", ready: true, host: false },
  { name: "Tiki Tomi", tag: "P8", ready: true, host: false },
] as const;

type LobbyProps = {
  onStart: () => void;
  playerCount?: number;
};

export function Lobby({ onStart, playerCount = 4 }: LobbyProps) {
  const [mode, setMode] = useState<"host" | "join">("host");
  const [code] = useState<string[]>(["M", "A", "N", "A"]);
  const [inputCode, setInputCode] = useState<string[]>(["", "", "", ""]);
  const [playerName, setPlayerName] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const onCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleInputChange = (idx: number, val: string) => {
    const v = val.toUpperCase().slice(-1);
    const next = [...inputCode];
    next[idx] = v;
    setInputCode(next);
    if (v && idx < 3) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !inputCode[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const joinCodeFilled = inputCode.every((c) => c);
  const players = MOCK_PLAYERS.slice(0, playerCount);

  return (
    <div className="hj-wrap">
      <div className="hj-card card">
        <div className="hj-eyebrow">
          {BRAND.gameName} · Lobby
        </div>
        <h1 className="hj-title">{mode === "host" ? "Build a cove." : "Drop into a cove."}</h1>
        <p className="hj-sub">
          {mode === "host"
            ? "Open a room, share the word, and your crew joins with a webcam and a wiggle."
            : "Punch in the four-letter word the host sent you. No keyboard required after that."}
        </p>

        <div className="hj-toggle">
          <div className={`indicator ${mode === "join" ? "right" : ""}`} />
          <button type="button" className={mode === "host" ? "on" : ""} onClick={() => setMode("host")}>
            <span>◉</span> Host a room
          </button>
          <button type="button" className={mode === "join" ? "on" : ""} onClick={() => setMode("join")}>
            <span>→</span> Join a room
          </button>
        </div>

        {mode === "host" ? (
          <div className="host-panel">
            <div className="room-code-label">Your room word</div>
            <div className="room-code">
              {code.map((c, i) => (
                <div key={i} className="code-digit">
                  {c}
                </div>
              ))}
            </div>
            <div className="copy-row">
              <span>Share this with friends</span>
              <button type="button" className={`copy-btn ${copied ? "copied" : ""}`} onClick={onCopy}>
                {copied ? "✓ COPIED" : "COPY LINK"}
              </button>
            </div>

            <div className="players-label">
              <span>Crew in the cove</span>
              <span className="count">
                {players.filter((p) => p.ready).length}/{playerCount}
              </span>
            </div>
            <div className="player-list">
              {players.map((p, i) => (
                <div key={p.tag} className={`player-row ${p.host ? "host" : ""}`}>
                  <div className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {p.name[0]}
                  </div>
                  <div>
                    <div className="player-name">
                      {p.name}{" "}
                      {p.host && (
                        <span className="host-badge mono">HOST</span>
                      )}
                    </div>
                    <div className="player-meta mono">
                      <span className={`ready-dot ${p.ready ? "" : "waiting"}`} />
                      {p.ready ? "Calibrated & ready" : "Calibrating…"}
                    </div>
                  </div>
                  <div className="player-meta mono">{p.tag}</div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 6 - players.length) })
                .slice(0, 2)
                .map((_, i) => (
                  <div key={`e${i}`} className="player-row empty">
                    <div className="avatar" style={{ background: "rgba(58,46,76,0.15)" }}>?</div>
                    <div>
                      <div className="player-name">Waiting for a buddy…</div>
                      <div className="player-meta mono">slot open</div>
                    </div>
                    <div className="player-meta mono">—</div>
                  </div>
                ))}
            </div>

            <div className="action-row">
              <button type="button" className="btn ghost" style={{ flex: "0 0 auto" }}>
                Settings
              </button>
              <button type="button" className="btn primary" style={{ flex: 1 }} onClick={onStart}>
                Start match →
              </button>
            </div>
          </div>
        ) : (
          <div className="join-panel">
            <div className="room-code-label">Enter the room word</div>
            <div className="code-input-row">
              {inputCode.map((c, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  className={`code-input ${c ? "filled" : ""}`}
                  maxLength={1}
                  value={c}
                  onChange={(e) => handleInputChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                />
              ))}
            </div>

            <div className="name-row">
              <label htmlFor="player-name">Your player name</label>
              <input
                id="player-name"
                className="name-input"
                placeholder="e.g. Mango Molly"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn primary full"
              disabled={!joinCodeFilled}
              onClick={onStart}
              style={{ opacity: joinCodeFilled ? 1 : 0.55 }}
            >
              Join the cove →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
