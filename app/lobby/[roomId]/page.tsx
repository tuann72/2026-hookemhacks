"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  AVATAR_COLORS,
  DEFAULT_AVATAR_TINT,
  loadStoredTint,
  saveStoredTint,
} from "@/lib/game/avatarColors";

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const code = (params.roomId as string).toUpperCase();

  const { playerId, playerName } = useIdentity();
  const [room, setRoom] = useState<Room | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  // Local tint preference. Seed from localStorage on mount so returning players
  // see their last choice; broadcast via presence once the channel is up.
  const [localTint, setLocalTint] = useState<string>(DEFAULT_AVATAR_TINT);
  useEffect(() => {
    const stored = loadStoredTint();
    if (stored) setLocalTint(stored);
  }, []);

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

  const { players, broadcastGameEvent, setReady, setTint, connected } =
    useGameChannel({
      roomId: room?.id ?? "",
      playerId,
      playerName: playerName || playerId,
      onGameEvent: (e) => {
        if (e.type === "game_start") router.push(`/game/${code}`);
      },
    });

  // Push tint into presence whenever the user picks a new one. Also fires on
  // first (re)connection so the channel always has the right value.
  useEffect(() => {
    if (!connected) return;
    setTint(localTint);
  }, [connected, localTint, setTint]);

  const [tintMenuOpen, setTintMenuOpen] = useState(false);
  const handlePickTint = useCallback((tint: string) => {
    setLocalTint(tint);
    saveStoredTint(tint);
    setTintMenuOpen(false);
  }, []);
  // Close the color dropdown when clicking anywhere else or hitting Escape.
  useEffect(() => {
    if (!tintMenuOpen) return;
    const close = () => setTintMenuOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [tintMenuOpen]);

  const isHost = !!room && room.host_id === playerId;
  const maxPlayers = room?.max_players ?? 2;
  const emptySlots = Math.max(0, maxPlayers - players.length);

  // True once everyone has thumbs-upped. Fall back to localReady for self so
  // we don't wait on the round-trip of our own presence broadcast.
  // TEMP: solo-test mode — `players.length >= 1` lets a single player progress.
  // Restore `players.length >= 2 &&` before shipping.
  const allReady =
    players.length >= 1 &&
    players.every((p) =>
      p.playerId === playerId ? localReady || p.ready : p.ready,
    );

  const copyCode = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleStart = useCallback(async () => {
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
  }, [room, isHost, starting, playerId, broadcastGameEvent, router, code]);

  // Auto-start the match once every player has readied up. Guard calibration
  // happens on the game page's loading screen.
  useEffect(() => {
    if (!isHost || starting) return;
    if (!allReady) return;
    void handleStart();
  }, [isHost, starting, allReady, handleStart]);

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
          <div className="hj-eyebrow">{BRAND.gameName} · Lobby</div>

          <div
            className="room-code-label"
            style={{ marginTop: 16, textAlign: "center" }}
          >
            Room Code
          </div>
          <div className="room-code" style={{ justifyContent: "center" }}>
            {code.split("").map((c, i) => (
              <div key={i} className="code-digit">
                {c}
              </div>
            ))}
          </div>
          <div className="copy-row">
            <span>Share this with friends</span>
            <button
              type="button"
              className={`copy-btn ${copied ? "copied" : ""}`}
              onClick={copyCode}
            >
              {copied ? "✓ COPIED" : "COPY CODE"}
            </button>
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
              const displayName = isSelf ? "You" : p.name || p.playerId;
              const presenceReady = Boolean(p.ready);
              const rowReady = isSelf
                ? localReady || presenceReady
                : presenceReady;
              const rowTint = isSelf
                ? localTint
                : p.tint || AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <div
                  key={p.playerId}
                  className={`player-row ${isRoomHost ? "host" : ""}`}
                >
                  <div className="avatar-cell">
                    {isSelf ? (
                      <button
                        type="button"
                        className="avatar avatar-btn"
                        style={{ background: rowTint }}
                        aria-label="Change avatar color"
                        aria-haspopup="menu"
                        aria-expanded={tintMenuOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTintMenuOpen((v) => !v);
                        }}
                      />
                    ) : (
                      <div
                        className="avatar"
                        style={{ background: rowTint }}
                      />
                    )}
                    {isSelf && tintMenuOpen && (
                      <div
                        className="tint-menu"
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {AVATAR_COLORS.map((c) => {
                          const selected = c === localTint;
                          return (
                            <button
                              key={c}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selected}
                              aria-label={`Pick color ${c}`}
                              onClick={() => handlePickTint(c)}
                              className={`tint-swatch ${selected ? "selected" : ""}`}
                              style={{ background: c }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="player-name">
                      {displayName}
                      {isRoomHost && (
                        <span className="host-badge mono">HOST</span>
                      )}
                    </div>
                  </div>
                  <div className="player-meta mono">
                    <span
                      className={`ready-dot ${rowReady ? "" : "waiting"}`}
                    />
                    {rowReady ? "Ready" : "Calibrating…"}
                  </div>
                </div>
              );
            })}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} className="player-row empty">
                <div
                  className="avatar"
                  style={{ background: "rgba(58,46,76,0.15)" }}
                >
                  ?
                </div>
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
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ← Leave
            </button>
            {(() => {
              // TEMP: solo-test mode — dropped the "< 2 players" branch so the
              // status flow still runs with just one player.
              const label = starting
                ? "Starting…"
                : allReady
                  ? "Locking in…"
                  : "Waiting for everyone to ready up…";
              return (
                <div
                  className="btn ghost"
                  style={{
                    flex: 1,
                    textAlign: "center",
                    opacity: 0.8,
                    cursor: "default",
                  }}
                >
                  {label}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Right: calibration ── */}
        <div className="lobby-cal card">
          <BodyDetector>
            <CalibrationPanel
              onReady={() => {
                setLocalReady(true);
                void setReady(true);
              }}
            />
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
        .avatar-cell {
          position: relative;
          display: flex;
          align-items: center;
        }
        .avatar-btn {
          border: none;
          padding: 0;
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .avatar-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
        }
        .tint-menu {
          position: absolute;
          top: 50%;
          left: calc(100% + 10px);
          transform: translateY(-50%);
          display: flex;
          gap: 8px;
          padding: 8px;
          border-radius: 12px;
          background: white;
          border: 1.5px solid rgba(58, 46, 76, 0.18);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
          z-index: 20;
        }
        .tint-swatch {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 2px solid rgba(58, 46, 76, 0.15);
          cursor: pointer;
          padding: 0;
          transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        }
        .tint-swatch:hover {
          transform: translateY(-1px);
        }
        .tint-swatch.selected {
          border-color: var(--ink, #3a2e4c);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--sun, #ffd24a) 55%, transparent);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
