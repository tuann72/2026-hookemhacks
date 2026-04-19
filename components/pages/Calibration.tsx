"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FigureSilhouette } from "../scenery/Scenery";

const JOINTS = [
  { id: "head", label: "Head", x: 50, y: 17, order: 0 },
  { id: "neck", label: "Neck", x: 50, y: 25, order: 1 },
  { id: "shoulderL", label: "Left shoulder", x: 43, y: 28, order: 2 },
  { id: "shoulderR", label: "Right shoulder", x: 57, y: 28, order: 3 },
  { id: "elbowL", label: "Left elbow", x: 37, y: 42, order: 4 },
  { id: "elbowR", label: "Right elbow", x: 63, y: 42, order: 5 },
  { id: "wristL", label: "Left wrist", x: 32, y: 55, order: 6 },
  { id: "wristR", label: "Right wrist", x: 68, y: 55, order: 7 },
  { id: "hip", label: "Hip center", x: 50, y: 58, order: 8 },
  { id: "hipL", label: "Left hip", x: 45, y: 60, order: 9 },
  { id: "hipR", label: "Right hip", x: 55, y: 60, order: 10 },
  { id: "kneeL", label: "Left knee", x: 44, y: 75, order: 11 },
  { id: "kneeR", label: "Right knee", x: 56, y: 75, order: 12 },
  { id: "ankleL", label: "Left ankle", x: 43, y: 92, order: 13 },
  { id: "ankleR", label: "Right ankle", x: 57, y: 92, order: 14 },
] as const;

const BONES: [string, string][] = [
  ["head", "neck"],
  ["neck", "shoulderL"],
  ["neck", "shoulderR"],
  ["shoulderL", "elbowL"],
  ["elbowL", "wristL"],
  ["shoulderR", "elbowR"],
  ["elbowR", "wristR"],
  ["neck", "hip"],
  ["hip", "hipL"],
  ["hip", "hipR"],
  ["hipL", "kneeL"],
  ["kneeL", "ankleL"],
  ["hipR", "kneeR"],
  ["kneeR", "ankleR"],
];

type JointEntry = (typeof JOINTS)[number] & { locked: boolean; active: boolean };

type CalibrationProps = {
  onNext: () => void;
  matchPct: number;
  setMatchPct: (v: number) => void;
};

export function Calibration({ onNext, matchPct, setMatchPct }: CalibrationProps) {
  const totalJoints = JOINTS.length;
  const lockedCount = Math.round((matchPct / 100) * totalJoints);

  const jointMap = useMemo(() => {
    const m: Record<string, JointEntry> = {};
    JOINTS.forEach((j, i) => {
      m[j.id] = { ...j, locked: i < lockedCount, active: i === lockedCount };
    });
    return m;
  }, [lockedCount]);

  const status =
    matchPct < 40
      ? "Tracking…"
      : matchPct < 75
        ? "Locking on"
        : matchPct < 95
          ? "Almost there"
          : "Calibrated ✓";
  const statusColor =
    matchPct >= 95 ? "var(--leaf)" : matchPct >= 75 ? "var(--sun)" : "var(--ink-soft)";

  const bonesSvg = BONES.map(([a, b], i) => {
    const ja = jointMap[a];
    const jb = jointMap[b];
    const locked = ja?.locked && jb?.locked;
    return { a: ja, b: jb, locked, key: i };
  });

  return (
    <div className="cal-wrap">
      <div className="cal-header">
        <div className="cal-titleblock">
          <div className="cal-step">Step 02 · Calibration</div>
          <h1 className="cal-h1">Stand in the frame.</h1>
          <p className="cal-sub">
            Back up until you can see your whole body. We&apos;ll lock onto your joints one by one — it
            takes about ten seconds.
          </p>
        </div>
        <div className="cal-match-badge">
          <div className="cal-match-ring">
            <svg width="56" height="56">
              <circle cx="28" cy="28" r="22" stroke="rgba(58,46,76,0.15)" strokeWidth="5" fill="none" />
              <circle
                cx="28"
                cy="28"
                r="22"
                stroke={matchPct >= 95 ? "var(--leaf)" : "var(--sun)"}
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - matchPct / 100)}
                style={{ transition: "stroke-dashoffset 0.4s ease" }}
              />
            </svg>
            <div className="pct">{matchPct}</div>
          </div>
          <div>
            <div className="cal-match-label">Match confidence</div>
            <div className="cal-match-status" style={{ color: statusColor }}>
              {status}
            </div>
          </div>
        </div>
      </div>

      <div className="cal-body">
        <div className="webcam-frame">
          <div className="webcam-fake">
            <div className="fake-sun" />
            <div className="fake-volcano" />
            <div className="fake-sand" />
            <div className="fake-palm" />
          </div>
          <div className="figure">
            <FigureSilhouette />
          </div>

          <div className="cal-readout mono">
            <div>CAM 01 · 1280×720 · 30fps</div>
            <div>
              tracker: <span className="ok">online</span>
            </div>
            <div>
              light:{" "}
              <span className={matchPct > 60 ? "ok" : "warn"}>{matchPct > 60 ? "good" : "low"}</span>
            </div>
            <div>
              joints:{" "}
              <span className="ok">
                {lockedCount}/{totalJoints}
              </span>
            </div>
          </div>

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

          <div className="cal-overlay">
            <div className="corner tl" />
            <div className="corner tr" />
            <div className="corner bl" />
            <div className="corner br" />
            <div className="scan-line" />
          </div>
        </div>

        <div className="cal-side">
          <div className="card">
            <div className="tag">Joint lock</div>
            <h3>Rig calibration</h3>
            <div className="joint-list">
              {JOINTS.map((j, i) => {
                const locked = i < lockedCount;
                const pct = locked
                  ? 100
                  : i === lockedCount
                    ? Math.round(((matchPct / 100) * totalJoints - lockedCount) * 100)
                    : 0;
                return (
                  <div key={j.id} className={`joint-item ${locked ? "locked" : ""}`}>
                    <div className="check">{locked ? "✓" : ""}</div>
                    <div>{j.label}</div>
                    <div className="pct">{locked ? "100%" : `${Math.max(0, pct)}%`}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="tag">Tips from the pros</div>
            <ul className="tips-list">
              <li>Step 6–8 feet back so your feet and head are both visible.</li>
              <li>Find even lighting — no strong backlight.</li>
              <li>Clear the floor; raise your arms to a T when prompted.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="cal-footer">
        <div className="hint">
          <span className="kbd">SPACE</span> to skip calibration
          <span style={{ marginLeft: 10 }}>
            <span className="kbd">R</span> to re-scan
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={() => setMatchPct(Math.max(5, matchPct - 15))}>
            Re-scan
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onNext}
            disabled={matchPct < 80}
            style={{ opacity: matchPct < 80 ? 0.5 : 1 }}
          >
            Drop into the cove →
          </button>
        </div>
      </div>
    </div>
  );
}

type BoneProps = {
  a: JointEntry;
  b: JointEntry;
  locked: boolean;
};

function Bone({ a, b, locked }: BoneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    const ax = (a.x / 100) * W;
    const ay = (a.y / 100) * H;
    const bx = (b.x / 100) * W;
    const by = (b.y / 100) * H;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    setStyle({
      left: ax,
      top: ay,
      width: len,
      transform: `rotate(${angle}deg)`,
    });
  }, [a.x, a.y, b.x, b.y]);

  return <div ref={ref} className={`rig-bone ${locked ? "locked" : ""}`} style={style} />;
}
