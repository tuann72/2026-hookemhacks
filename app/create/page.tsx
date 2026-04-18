"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Backdrop } from "@/components/scenery/Scenery";
import { BRAND } from "@/components/shared/constants";
import { createRoom } from "@/lib/multiplayer/roomService";
import { useIdentity } from "@/hooks/useIdentity";
import { copyToClipboard } from "@/lib/clipboard";

export default function CreatePage() {
  const router = useRouter();
  const { playerId, playerName, setPlayerName } = useIdentity();
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!playerId || code || creatingRef.current) return;
    creatingRef.current = true;
    createRoom(playerId)
      .then((room) => setCode(room.code))
      .catch((e) => {
        setError((e as Error).message);
        creatingRef.current = false;
      });
  }, [playerId, code]);

  const copyCode = async () => {
    if (!code) return;
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const openLobby = () => {
    if (!playerName.trim() || !code) return;
    router.push(`/lobby/${code}`);
  };

  const slots = [0, 1, 2, 3].map((i) => code[i] ?? "");

  return (
    <div className="app-stage" data-time="day" data-intensity="normal">
      <Backdrop />

      <div className="hj-wrap">
        <div className="hj-card card">
          <div className="hj-eyebrow">{BRAND.event} · Create a room</div>
          <h1 className="hj-title">Build a cove.</h1>
          <p className="hj-sub">
            Share this four-letter word with your crew. They&apos;ll use it to join.
          </p>

          <div className="room-code-label">Your room word</div>
          <div className="room-code">
            {slots.map((c, i) => (
              <div key={i} className="code-digit" style={!c ? { opacity: 0.35 } : undefined}>
                {c || "·"}
              </div>
            ))}
          </div>
          <div className="copy-row">
            <span>{code ? "Share this with friends" : "Reserving a word…"}</span>
            <button
              type="button"
              className={`copy-btn ${copied ? "copied" : ""}`}
              onClick={copyCode}
              disabled={!code}
            >
              {copied ? "✓ COPIED" : "COPY CODE"}
            </button>
          </div>

          <div className="name-row" style={{ marginTop: 24 }}>
            <label htmlFor="host-name">Your player name</label>
            <input
              id="host-name"
              className="name-input"
              placeholder="e.g. Lava Larry"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && openLobby()}
              autoFocus
            />
          </div>

          {error && (
            <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12 }}>
              Couldn&apos;t create room: {error}
            </p>
          )}

          <div className="action-row" style={{ marginTop: 24 }}>
            <Link href="/" className="btn ghost" style={{ flex: "0 0 auto", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ← Back
            </Link>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1, opacity: playerName.trim() && code ? 1 : 0.5 }}
              disabled={!playerName.trim() || !code}
              onClick={openLobby}
            >
              Open lobby →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
