"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Backdrop } from "@/components/scenery/Scenery";
import { CalibrationPanel } from "@/components/pages/CalibrationPanel";
import { BRAND } from "@/components/shared/constants";
import BodyDetector from "@/components/detection/BodyDetector";
import {
  getRoomByCode,
  joinRoom,
  leaveRoom,
  startGame,
} from "@/lib/multiplayer/roomService";
import { useGameChannel } from "@/hooks/useGameChannel";
import { useIdentity } from "@/hooks/useIdentity";
import { copyToClipboard } from "@/lib/clipboard";
import type { Room } from "@/lib/multiplayer/types";

const AVATAR_COLORS = ["#FF6B4A", "#2BB3C0", "#2E7D5B", "#FF5E7E", "#FFD24A", "#8A5EE0", "#4A90E2", "#E06B4A"];

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const code = (params.roomId as string).toUpperCase();

  const { playerId, playerName } = useIdentity();
  const [room, setRoom] = useState<Room | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch room by code; idempotently ensure membership in room_players.
  useEffect(() => {
    if (!playerId || !code) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getRoomByCode(code);
        if (cancelled) return;
        if (!r) {
          setLoadError("Room not found");
          return;
        }
        if (r.status === "active") {
          router.replace(`/game/${code}`);
          return;
        }
        if (r.status === "finished") {
          setLoadError("This room has ended");
          return;
        }
        setRoom(r);
        if (r.host_id !== playerId) {
          try {
            await joinRoom(code, playerId);
          } catch {
            // already joined or full — presence will reflect reality either way
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, playerId, router]);

  const { players, broadcastGameEvent, setReady } = useGameChannel({
    roomId: room?.id ?? "",
    playerId,
    playerName: playerName || playerId,
    onGameEvent: (e) => {
      if (e.type === "game_start") router.push(`/game/${code}`);
    },
  });

  const isHost = !!room && room.host_id === playerId;
  const maxPlayers = room?.max_players ?? 2;
  const emptySlots = Math.max(0, maxPlayers - players.length);

  const copyCode = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleStart = async () => {
    if (!room || !isHost || starting) return;
    setStarting(true);
    try {
      await startGame(room.id, playerId);
      broadcastGameEvent({ type: "game_start", payload: {} });
      router.push(`/game/${code}`);
    } catch (e) {
      setLoadError((e as Error).message);
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    if (room) {
      try {
        await leaveRoom(room.id, playerId);
      } catch {
        // best-effort
      }
    }
    router.push("/");
  };

  return (
    <div className="app-stage" data-time="day" data-intensity="normal">
      <Backdrop />

      <div className="lobby-layout">
        {/* ── Left: player list ── */}
        <div className="lobby-panel card">
          <div className="hj-eyebrow">{BRAND.event} · {BRAND.gameName} · Lobby</div>
          <h2 className="hj-title" style={{ fontSize: "clamp(24px, 4vw, 36px)", marginBottom: 4 }}>
            Build a cove.
          </h2>

          <div className="room-code-label" style={{ marginTop: 16 }}>Your room word</div>
          <div className="room-code">
            {code.split("").map((c, i) => (
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
            <span className="count">
              {players.filter((p) => p.ready).length}/{players.length} ready
            </span>
          </div>

          {loadError && (
            <p style={{ color: "#c0392b", fontSize: 13, margin: "10px 0 0" }}>
              {loadError}
            </p>
          )}

          <div className="player-list">
            {players.map((p, i) => {
              const isSelf = p.playerId === playerId;
              const isRoomHost = room?.host_id === p.playerId;
              const displayName = isSelf ? "You" : (p.name || p.playerId);
              return (
                <div
                  key={p.playerId}
                  className={`player-row ${isRoomHost ? "host" : ""}`}
                >
                  <div className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {(p.name || p.playerId)[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <div className="player-name">
                      {displayName}
                      {isRoomHost && <span className="host-badge mono">HOST</span>}
                    </div>
                    <div className="player-meta mono">
                      <span className={`ready-dot ${p.ready ? "" : "waiting"}`} />
                      {p.ready ? "Calibrated & ready" : "Calibrating…"}
                    </div>
                  </div>
                  <div className="player-meta mono">P{i + 1}</div>
                </div>
              );
            })}
            {Array.from({ length: emptySlots }).map((_, i) => (
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
            <button
              type="button"
              onClick={handleLeave}
              className="btn ghost"
              style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ← Leave
            </button>
            {isHost ? (() => {
              const allReady = players.length >= 2 && players.every((p) => p.ready);
              const disabled = starting || !allReady;
              const label = starting
                ? "Starting…"
                : players.length < 2
                  ? "Waiting for another player…"
                  : !allReady
                    ? "Waiting for all to lock in…"
                    : "Start match →";
              return (
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}
                  disabled={disabled}
                  onClick={handleStart}
                >
                  {label}
                </button>
              );
            })() : (
              <div
                className="btn ghost"
                style={{ flex: 1, textAlign: "center", opacity: 0.7, cursor: "default" }}
              >
                Waiting for host…
              </div>
            )}
          </div>
        </div>

        {/* ── Right: calibration ── */}
        <div className="lobby-cal card">
          <CalibrationPanel onReady={() => setReady(true)} />
        </div>
      </div>

      <style>{`
        .lobby-layout {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: flex-start;
          gap: 20px;
          padding: 24px;
          min-height: 100dvh;
          max-width: 1100px;
          margin: 0 auto;
        }
        .lobby-panel {
          flex: 0 0 420px;
          overflow-y: auto;
          max-height: calc(100dvh - 48px);
          padding: 28px;
        }
        .lobby-cal {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          height: calc(100dvh - 48px);
          padding: 24px;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .lobby-layout {
            flex-direction: column;
          }
          .lobby-panel { flex: none; width: 100%; max-height: none; }
          .lobby-cal { height: 480px; width: 100%; }
        }
      `}</style>
    </div>
  );
}
