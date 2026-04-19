"use client";

import { useGameStore } from "@/lib/store/gameStore";
import { REMOTE_PLAYER_ID, SELF_PLAYER_ID } from "@/types";

// Two corner-mounted HP bars: local in bottom-left (fills L→R), remote in
// top-right (fills R→L so the two bars visually face each other across the
// screen, fighting-game style). Reads the game store — no props needed.

type Side = "left" | "right";

function fillColor(ratio: number): string {
  // green → amber → red as HP drops
  if (ratio > 0.5) return "#22c55e";
  if (ratio > 0.25) return "#f59e0b";
  return "#ef4444";
}

function HPBar({
  name,
  hp,
  maxHp,
  tint,
  side,
}: {
  name: string;
  hp: number;
  maxHp: number;
  tint: string;
  side: Side;
}) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const pct = ratio * 100;
  const rightAligned = side === "right";
  return (
    <div
      style={{
        width: 320,
        fontFamily: "monospace",
        color: "#f5f5f5",
        textAlign: rightAligned ? "right" : "left",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          marginBottom: 6,
          flexDirection: rightAligned ? "row-reverse" : "row",
        }}
      >
        <span style={{ color: tint }}>{name}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "#a1a1aa" }}>
          {Math.round(hp)} / {maxHp}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 18,
          width: "100%",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 3,
          overflow: "hidden",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            // right-side bar drains from the left, so we anchor the fill to
            // the right edge and let its width shrink toward the left.
            [rightAligned ? "right" : "left"]: 0,
            width: `${pct}%`,
            background: fillColor(ratio),
            transition: "width 180ms ease-out, background 180ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

export function HPBars() {
  const players = useGameStore((s) => s.players);
  const self = players.find((p) => p.id === SELF_PLAYER_ID);
  const remote = players.find((p) => p.id === REMOTE_PLAYER_ID);

  return (
    <>
      {self && (
        <div
          style={{
            position: "absolute",
            left: 24,
            bottom: 24,
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          <HPBar
            name={self.displayName}
            hp={self.hp}
            maxHp={self.maxHp}
            tint={self.tint}
            side="left"
          />
        </div>
      )}
      {remote && (
        <div
          style={{
            position: "absolute",
            right: 24,
            top: 24,
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          <HPBar
            name={remote.displayName}
            hp={remote.hp}
            maxHp={remote.maxHp}
            tint={remote.tint}
            side="right"
          />
        </div>
      )}
    </>
  );
}
