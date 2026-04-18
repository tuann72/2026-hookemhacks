"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FigureSilhouette } from "../scenery/Scenery";
import { useBodyDetection } from "@/hooks/useBodyDetection";

const JOINTS = [
  { id: "head",      x: 50, y: 17 },
  { id: "neck",      x: 50, y: 25 },
  { id: "shoulderL", x: 43, y: 28 },
  { id: "shoulderR", x: 57, y: 28 },
  { id: "elbowL",    x: 37, y: 42 },
  { id: "elbowR",    x: 63, y: 42 },
  { id: "wristL",    x: 32, y: 55 },
  { id: "wristR",    x: 68, y: 55 },
  { id: "hip",       x: 50, y: 58 },
  { id: "hipL",      x: 45, y: 60 },
  { id: "hipR",      x: 55, y: 60 },
  { id: "kneeL",     x: 44, y: 75 },
  { id: "kneeR",     x: 56, y: 75 },
  { id: "ankleL",    x: 43, y: 92 },
  { id: "ankleR",    x: 57, y: 92 },
] as const;

const BONES: [string, string][] = [
  ["head", "neck"], ["neck", "shoulderL"], ["neck", "shoulderR"],
  ["shoulderL", "elbowL"], ["elbowL", "wristL"],
  ["shoulderR", "elbowR"], ["elbowR", "wristR"],
  ["neck", "hip"], ["hip", "hipL"], ["hip", "hipR"],
  ["hipL", "kneeL"], ["kneeL", "ankleL"],
  ["hipR", "kneeR"], ["kneeR", "ankleR"],
];

type JointEntry = (typeof JOINTS)[number] & { locked: boolean; active: boolean };

type CalibrationPanelProps = {
  onReady: () => void;
};

export function CalibrationPanel({ onReady }: CalibrationPanelProps) {
  const { overlayCanvasRef, isReady } = useBodyDetection();

  const [pct, setPct] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  // Simulate joint detection filling in over ~8 seconds then holding
  useEffect(() => {
    if (pct >= 100) return;
    const id = setInterval(() => setPct((p) => Math.min(100, p + 1.4)), 110);
    return () => clearInterval(id);
  }, [pct]);

  const totalJoints = JOINTS.length;
  const lockedCount = Math.round((pct / 100) * totalJoints);

  const jointMap = useMemo(() => {
    const m: Record<string, JointEntry> = {};
    JOINTS.forEach((j, i) => {
      m[j.id] = { ...j, locked: i < lockedCount, active: i === lockedCount };
    });
    return m;
  }, [lockedCount]);

  const bonesSvg = BONES.map(([a, b], i) => {
    const ja = jointMap[a];
    const jb = jointMap[b];
    return { a: ja, b: jb, locked: ja?.locked && jb?.locked, key: i };
  });

  const statusLabel =
    confirmed ? "Locked in ✓" :
    pct >= 80  ? "Looking good — give a thumbs up when ready" :
    pct >= 40  ? "Locking onto your joints…" :
                 "Step back so your full body is visible";

  const handleReady = () => {
    setConfirmed(true);
    onReady();
  };

  return (
    <div className="cal-panel">
      <div className="cal-panel-header">
        <div>
          <div className="cal-panel-title">Calibrate while you wait</div>
          <div className="cal-panel-sub mono">{statusLabel}</div>
        </div>
      </div>

      <div className="webcam-frame" style={{ flex: 1 }}>
        {!isReady && (
          <>
            <div className="webcam-fake">
              <div className="fake-sun" />
              <div className="fake-volcano" />
              <div className="fake-sand" />
              <div className="fake-palm" />
            </div>
            <div className="figure">
              <FigureSilhouette />
            </div>
          </>
        )}

        <div className="cal-readout mono">
          <div>CAM 01 · 1280×720 · 30fps</div>
          <div>tracker: <span className="ok">online</span></div>
          <div>joints: <span className="ok">{lockedCount}/{totalJoints}</span></div>
        </div>

        {isReady
          ? (
            <canvas
              ref={overlayCanvasRef}
              width={640}
              height={480}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", objectFit: "cover" }}
            />
          ) : (
            <div className="rig-layer">
              {bonesSvg.map(({ a, b, locked, key }) => {
                if (!a || !b) return null;
                return <Bone key={key} a={a} b={b} locked={locked} />;
              })}
              {JOINTS.map((j, i) => (
                <div
                  key={j.id}
                  className={`rig-joint ${i < lockedCount ? "locked" : ""} ${i === lockedCount ? "active" : ""}`}
                  style={{ left: `${j.x}%`, top: `${j.y}%` }}
                />
              ))}
            </div>
          )}

        <div className="cal-overlay">
          <div className="corner tl" /><div className="corner tr" />
          <div className="corner bl" /><div className="corner br" />
          <div className="scan-line" />
        </div>
      </div>

      <button
        type="button"
        className={`cal-ready-btn ${confirmed ? "confirmed" : ""}`}
        onClick={handleReady}
        disabled={confirmed}
      >
        {confirmed ? "✓ Locked in" : "👍 I'm ready"}
      </button>

      <style>{`
        .cal-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
          height: 100%;
        }
        .cal-panel-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .cal-panel-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--ink);
        }
        .cal-panel-sub {
          font-size: 11px;
          color: var(--ink-soft);
          margin-top: 4px;
          min-height: 1.4em;
          transition: color 0.3s;
        }
        .cal-ready-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: var(--radius);
          font-family: var(--font-outfit), sans-serif;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s, opacity 0.2s;
          background: var(--sun);
          color: white;
          box-shadow: var(--shadow-chunky);
        }
        .cal-ready-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .cal-ready-btn:active:not(:disabled) { transform: translateY(1px); }
        .cal-ready-btn.confirmed {
          background: var(--leaf);
          box-shadow: none;
          cursor: default;
        }
      `}</style>
    </div>
  );
}

type BoneProps = { a: JointEntry; b: JointEntry; locked: boolean };

function Bone({ a, b, locked }: BoneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const W = parent.clientWidth, H = parent.clientHeight;
    const ax = (a.x / 100) * W, ay = (a.y / 100) * H;
    const bx = (b.x / 100) * W, by = (b.y / 100) * H;
    const len = Math.hypot(bx - ax, by - ay);
    const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    setStyle({ left: ax, top: ay, width: len, transform: `rotate(${angle}deg)` });
  }, [a.x, a.y, b.x, b.y]);

  return <div ref={ref} className={`rig-bone ${locked ? "locked" : ""}`} style={style} />;
}
