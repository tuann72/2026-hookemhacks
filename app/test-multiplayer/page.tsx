"use client";

import { useState, useEffect, useRef } from "react";
import { useRoom } from "@/hooks/useRoom";
import { useGameChannel } from "@/hooks/useGameChannel";
import type { PlayerState, AttackEvent, HitEvent } from "@/lib/multiplayer/types";

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

function Log({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div
      ref={ref}
      className="bg-black text-green-400 font-mono text-xs p-3 rounded h-48 overflow-y-auto"
    >
      {entries.length === 0 && <span className="text-gray-500">No events yet…</span>}
      {entries.map((e, i) => (
        <div key={i}>{e}</div>
      ))}
    </div>
  );
}

export default function TestMultiplayerPage() {
  const [playerId, setPlayerId] = useState("");
  useEffect(() => { setPlayerId(randomId()); }, []);
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activePlayerName, setActivePlayerName] = useState("");

  const appendLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)].reverse());

  const { room, error, loading, createRoom, joinRoom, leaveRoom, startGame } =
    useRoom(playerId);

  const { connected, players, broadcastPlayerState, broadcastAttack, broadcastHit } =
    useGameChannel({
      roomId: activeRoomId ?? "",
      playerId,
      playerName: activePlayerName,
      onPlayerState: (s) =>
        appendLog(`PLAYER_STATE from ${s.playerId} | x:${s.x.toFixed(1)} y:${s.y.toFixed(1)} action:${s.action}`),
      onAttack: (a) =>
        appendLog(`ATTACK from ${a.playerId} | type:${a.attackType}`),
      onHit: (h) =>
        appendLog(`HIT ${h.targetId} by ${h.attackerId} | dmg:${h.damage}`),
      onGameEvent: (e) =>
        appendLog(`GAME_EVENT type:${e.type} | ${JSON.stringify(e.payload)}`),
    });

  useEffect(() => {
    if (room) {
      setActiveRoomId(room.id);
      setActivePlayerName(playerName || playerId);
      appendLog(`Joined room ${room.id} | code: ${room.code} | status: ${room.status}`);
    }
  }, [room]);

  useEffect(() => {
    if (connected) appendLog("Realtime channel connected");
  }, [connected]);

  async function handleCreate() {
    const r = await createRoom();
    if (r) appendLog(`Created room — share code: ${r.code}`);
  }

  async function handleJoin() {
    const r = await joinRoom(joinCode);
    if (r) appendLog(`Joined room via code ${joinCode}`);
  }

  async function handleLeave() {
    await leaveRoom();
    setActiveRoomId(null);
    appendLog("Left room");
  }

  function handleBroadcastState() {
    broadcastPlayerState({
      x: Math.random() * 800,
      y: Math.random() * 400,
      velocityX: (Math.random() - 0.5) * 10,
      velocityY: 0,
      facing: Math.random() > 0.5 ? "left" : "right",
      action: "idle",
      health: 100,
    });
    appendLog("Sent player_state broadcast");
  }

  function handleBroadcastAttack() {
    broadcastAttack({
      attackType: "slash",
      hitbox: { x: 100, y: 200, w: 50, h: 30 },
    });
    appendLog("Sent attack broadcast");
  }

  function handleBroadcastHit() {
    const target = players.find((p) => p.playerId !== playerId);
    if (!target) {
      appendLog("No other player to hit");
      return;
    }
    broadcastHit({ attackerId: playerId, targetId: target.playerId, damage: 10 });
    appendLog(`Sent hit broadcast → ${target.playerId}`);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8 font-mono">
      <h1 className="text-2xl font-bold mb-1">Multiplayer Test</h1>
      <p className="text-gray-400 text-sm mb-6">
        Open this page in two tabs to test realtime sync.
      </p>

      {/* Identity */}
      <section className="mb-6">
        <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Identity</h2>
        <div className="flex gap-3 items-center">
          <span className="text-yellow-400 text-sm">ID: {playerId}</span>
          <input
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm w-48"
            placeholder="Display name (optional)"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
        </div>
      </section>

      {/* Room controls */}
      <section className="mb-6">
        <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Room</h2>
        {!room ? (
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handleCreate}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm"
            >
              Create Room
            </button>
            <div className="flex gap-2">
              <input
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm w-32 uppercase"
                placeholder="Join code"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button
                onClick={handleJoin}
                disabled={loading || joinCode.length < 6}
                suppressHydrationWarning
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 px-4 py-2 rounded text-sm"
              >
                Join
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-center">
            <span className="bg-gray-800 px-3 py-1 rounded text-sm">
              Room: <span className="text-white font-bold">{room.id.slice(0, 8)}…</span>
            </span>
            <span className="bg-yellow-900 text-yellow-300 px-3 py-1 rounded text-sm font-bold tracking-widest">
              Code: {room.code}
            </span>
            <span
              className={`px-3 py-1 rounded text-xs ${
                room.status === "active"
                  ? "bg-green-900 text-green-300"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              {room.status}
            </span>
            {room.status === "waiting" && room.host_id === playerId && (
              <button
                onClick={() => startGame()}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 rounded text-sm"
              >
                Start Game
              </button>
            )}
            <button
              onClick={handleLeave}
              disabled={loading}
              className="bg-red-800 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded text-sm"
            >
              Leave
            </button>
          </div>
        )}
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </section>

      {/* Channel status + presence */}
      <section className="mb-6">
        <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Channel</h2>
        <div className="flex gap-3 items-center mb-2">
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-gray-600"}`}
          />
          <span className="text-sm">{connected ? "Connected" : "Disconnected"}</span>
        </div>
        {players.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {players.map((p) => (
              <span
                key={p.playerId}
                className={`text-xs px-2 py-1 rounded ${
                  p.playerId === playerId
                    ? "bg-blue-900 text-blue-300"
                    : "bg-gray-800 text-gray-300"
                }`}
              >
                {p.name || p.playerId}
                {p.playerId === playerId && " (you)"}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Broadcast controls */}
      {connected && (
        <section className="mb-6">
          <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">
            Broadcast (visible to other tabs)
          </h2>
          <div className="flex gap-3">
            <button
              onClick={handleBroadcastState}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm"
            >
              Send Position
            </button>
            <button
              onClick={handleBroadcastAttack}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm"
            >
              Send Attack
            </button>
            <button
              onClick={handleBroadcastHit}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm"
            >
              Send Hit
            </button>
          </div>
        </section>
      )}

      {/* Event log */}
      <section>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xs text-gray-500 uppercase tracking-widest">Event Log</h2>
          <button
            onClick={() => setLog([])}
            className="text-xs text-gray-600 hover:text-gray-400"
          >
            clear
          </button>
        </div>
        <Log entries={log} />
      </section>
    </main>
  );
}
