"use client";

import { useEffect, useState } from "react";
import { useArmSimStore, type ArmSimState } from "@/lib/store/armSimStore";
import { SELF_PLAYER_ID } from "@/types";

// Two-segment right-arm rig with guard/punch tween. The 2D SVG preview and
// the 3D avatar's right arm in Avatar.tsx both read from the shared
// armSimStore — clicking a button here pushes the target state in; Avatar's
// useFrame tweens the RightUpperArm + RightLowerArm bones toward it.

// Geometry — all in SVG viewBox units.
const SHOULDER = { x: 110, y: 125 };
const UPPER_ARM_LEN = 80; // shoulder → elbow, fixed
const FOREARM_LEN = 70;   // elbow → hand, fixed

const GUARD_ANGLE = 60;   // interior elbow angle — tight fold, fist near face
const PUNCH_ANGLE = 180;  // straight line

// Framerate-independent exponential smoothing toward the target angle. A
// rate of 10/s settles the remaining gap ~63% per 100ms, which reads as a
// fast-but-not-instant tween.
const SMOOTH_RATE = 10;

export function ArmRigSim() {
  // Source of truth lives in armSimStore so the 3D avatar sees the same
  // target. Local SVG only tracks the tweened angle for the preview.
  const storeState = useArmSimStore((s) => s.rightArm[SELF_PLAYER_ID]);
  const setRightArm = useArmSimStore((s) => s.setRightArm);
  const target: ArmSimState = storeState ?? "guard";
  const [angle, setAngle] = useState<number>(GUARD_ANGLE);

  const setTarget = (next: ArmSimState) => setRightArm(SELF_PLAYER_ID, next);

  const targetAngle = target === "guard" ? GUARD_ANGLE : PUNCH_ANGLE;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setAngle((a) => {
        const delta = targetAngle - a;
        if (Math.abs(delta) < 0.05) return targetAngle;
        return a + delta * (1 - Math.exp(-SMOOTH_RATE * dt));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetAngle]);

  // Upper arm is locked horizontal going right — elbow sits at (shoulder.x +
  // UPPER_ARM_LEN, shoulder.y).
  const elbow = { x: SHOULDER.x + UPPER_ARM_LEN, y: SHOULDER.y };

  // Forearm direction from +x axis (screen coords, y-down). The interior
  // elbow angle θ maps to forearm angle α via α = θ − 180°:
  //   θ = 180° (punch) → α =   0° → forearm along +x, straight extension
  //   θ =  90° (guard) → α = −90° → forearm points up (screen), L-shape
  const alpha = ((angle - 180) * Math.PI) / 180;
  const hand = {
    x: elbow.x + FOREARM_LEN * Math.cos(alpha),
    y: elbow.y + FOREARM_LEN * Math.sin(alpha),
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 12,
        borderRadius: 8,
        background: "rgba(0, 0, 0, 0.55)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        fontFamily: "monospace",
        color: "#e5e5e5",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          fontSize: 9,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "#a1a1aa",
        }}
      >
        <span>right arm · rig sim</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "#22d3ee" }}>
          {angle.toFixed(0)}°
        </span>
      </div>

      <svg
        viewBox="0 0 320 220"
        width={320}
        height={220}
        style={{ display: "block" }}
      >
        {/* Character body on the left — head + torso silhouette so the
            rig reads as "player character's right arm". */}
        <circle cx={60} cy={80} r={22} fill="#1f2937" stroke="#374151" strokeWidth={1.5} />
        <rect x={36} y={102} width={48} height={72} rx={6} fill="#1f2937" stroke="#374151" strokeWidth={1.5} />
        <rect x={54} y={98} width={12} height={8} fill="#1f2937" />

        {/* Upper arm — horizontal from shoulder to elbow (fixed length) */}
        <line
          x1={SHOULDER.x}
          y1={SHOULDER.y}
          x2={elbow.x}
          y2={elbow.y}
          stroke="#f97316"
          strokeWidth={12}
          strokeLinecap="round"
        />

        {/* Forearm — rotates around the elbow */}
        <line
          x1={elbow.x}
          y1={elbow.y}
          x2={hand.x}
          y2={hand.y}
          stroke="#f97316"
          strokeWidth={12}
          strokeLinecap="round"
        />

        {/* Joint markers */}
        <circle cx={SHOULDER.x} cy={SHOULDER.y} r={5} fill="#fbbf24" />
        <circle cx={elbow.x} cy={elbow.y} r={5} fill="#fbbf24" />
        {/* Hand / glove */}
        <circle
          cx={hand.x}
          cy={hand.y}
          r={11}
          fill="#dc2626"
          stroke="#7f1d1d"
          strokeWidth={2}
        />
      </svg>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => setTarget("guard")} style={btnStyle(target === "guard", "#22d3ee")}>
          Guard
        </button>
        <button type="button" onClick={() => setTarget("punch")} style={btnStyle(target === "punch", "#f97316")}>
          Punch
        </button>
      </div>
    </div>
  );
}

function btnStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    padding: "7px 18px",
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: active ? "#0a0a0a" : "#e5e5e5",
    background: active ? accent : "transparent",
    border: `1px solid ${accent}`,
    borderRadius: 3,
    cursor: "pointer",
    transition: "background 150ms, color 150ms",
  };
}
