"use client";

import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";

// Charge arc + armed flash that replaces the debug-panel charge view during
// live play. Mounts below the GuardVignette shield. Only renders when the
// baseline has been captured (i.e. calibrated) and there's something to show.

const RADIUS = 28;
const STROKE = 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE) * 2 + 4;

export function UppercutChargeIndicator() {
  const baseline = usePunchCalibrationStore((s) => s.baseline);
  const chargeProgress = usePunchCalibrationStore((s) => s.chargeProgress);
  const isUppercutMode = usePunchCalibrationStore((s) => s.isUppercutMode);
  const leftMetrics = usePunchCalibrationStore((s) => s.leftMetrics);
  const rightMetrics = usePunchCalibrationStore((s) => s.rightMetrics);

  const anyCalibrated = !!baseline?.left || !!baseline?.right;
  if (!anyCalibrated) return null;

  const bothFacing = leftMetrics.knucklesFacing && rightMetrics.knucklesFacing;
  const oneFacing = leftMetrics.knucklesFacing || rightMetrics.knucklesFacing;

  if (chargeProgress <= 0 && !isUppercutMode && !bothFacing) return null;

  const dashOffset = CIRCUMFERENCE * (1 - chargeProgress);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-[88px] left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1"
    >
      {/* Arc ring */}
      <svg width={SIZE} height={SIZE} style={{ overflow: "visible" }}>
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(251,191,36,0.15)"
          strokeWidth={STROKE}
        />
        {/* Fill */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={isUppercutMode ? "rgb(251,191,36)" : "rgb(234,179,8)"}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={isUppercutMode ? 0 : dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{
            filter: isUppercutMode
              ? "drop-shadow(0 0 6px rgba(251,191,36,0.9))"
              : undefined,
            transition: "stroke-dashoffset 40ms linear",
          }}
        />
        {/* Bolt icon in the center */}
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 5}
          textAnchor="middle"
          fontSize="14"
          fill={isUppercutMode ? "rgb(251,191,36)" : "rgba(251,191,36,0.7)"}
          style={{
            filter: isUppercutMode
              ? "drop-shadow(0 0 4px rgba(251,191,36,0.9))"
              : undefined,
          }}
        >
          ⚡
        </text>
      </svg>

      {/* Label */}
      <span
        className="font-mono text-[9px] uppercase tracking-[0.25em]"
        style={{
          color: isUppercutMode ? "rgb(253,224,71)" : "rgba(253,224,71,0.6)",
          textShadow: isUppercutMode
            ? "0 0 8px rgba(251,191,36,0.9)"
            : undefined,
        }}
      >
        {isUppercutMode
          ? "uppercut armed"
          : chargeProgress > 0
          ? "charging…"
          : bothFacing
          ? "rotate fists ↺"
          : oneFacing
          ? "both fists →"
          : "rotate fists →"}
      </span>
    </div>
  );
}
