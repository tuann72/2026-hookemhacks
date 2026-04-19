"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import BodyDetector from "@/components/detection/BodyDetector";
import { CalibrateGuardPanel } from "@/components/detection/CalibrateGuardPanel";
import { useBodyDetection } from "@/hooks/useBodyDetection";
import { usePunchDetector } from "@/hooks/usePunchDetector";
import type { PoseLandmark } from "@/types";

// Standard MediaPipe hand skeleton — 21 landmarks, five fingers + palm bridges.
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

function ArmsSkeletonCanvas() {
  const { videoRef, poseLandmarks, leftHandLandmarks, rightHandLandmarks } =
    useBodyDetection();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const video = videoRef?.current;

    ctx.clearRect(0, 0, width, height);
    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -width, 0, width, height);
      ctx.restore();
    }

    const toX = (x: number) => (1 - x) * width;
    const toY = (y: number) => y * height;

    if (poseLandmarks) {
      const bones: [number, number, string][] = [
        [11, 12, "#ffcc00"],
        [11, 13, "#00ff88"],
        [13, 15, "#00ff88"],
        [12, 14, "#00ccff"],
        [14, 16, "#00ccff"],
      ];
      ctx.lineWidth = 3;
      for (const [a, b, color] of bones) {
        const pa = poseLandmarks[a];
        const pb = poseLandmarks[b];
        if (!pa || !pb) continue;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX(pa.x), toY(pa.y));
        ctx.lineTo(toX(pb.x), toY(pb.y));
        ctx.stroke();
      }
      for (const i of [11, 12, 13, 14, 15, 16]) {
        const p = poseLandmarks[i];
        if (!p) continue;
        ctx.fillStyle =
          i === 11 || i === 12 ? "#ffcc00" : i <= 14 ? "#33ff99" : "#66ddff";
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.y), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const [hand, color] of [
      [leftHandLandmarks, "#ff6ad5"],
      [rightHandLandmarks, "#ffd36a"],
    ] as [PoseLandmark[] | null, string][]) {
      if (!hand || hand.length < 21) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = hand[a];
        const pb = hand[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(toX(pa.x), toY(pa.y));
        ctx.lineTo(toX(pb.x), toY(pb.y));
        ctx.stroke();
      }
      ctx.fillStyle = color;
      for (const p of hand) {
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [poseLandmarks, leftHandLandmarks, rightHandLandmarks, videoRef]);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 overflow-hidden rounded-lg border border-zinc-700 bg-black shadow-2xl">
      <canvas ref={canvasRef} width={320} height={240} />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
        rig · arms
      </div>
    </div>
  );
}

function PunchTest() {
  const body = useBodyDetection();
  const onPunch = useCallback(() => {}, []);
  const { onCalibrate, onResetCounts } = usePunchDetector({ onPunch });

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-cyan-400">
            Punch Detection · Test Bench
          </div>
          <h1 className="text-lg font-semibold">Jab / cross / guard tuning</h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
          <span className={`h-2 w-2 rounded-full ${body.isReady ? "bg-emerald-400" : "bg-amber-400"}`} />
          <span>{body.isReady ? "READY" : "waiting for webcam…"}</span>
          <span className="text-zinc-600">·</span>
          <span>{body.fps} fps</span>
          <Link
            href="/"
            className="ml-3 text-[11px] uppercase tracking-widest text-zinc-400 hover:text-white"
          >
            ← Home
          </Link>
        </div>
      </div>

      <CalibrateGuardPanel
        variant="full"
        onCalibrate={onCalibrate}
        onResetCounts={onResetCounts}
      />

      <ArmsSkeletonCanvas />
    </div>
  );
}

export default function PunchTestPage() {
  return (
    <BodyDetector>
      <PunchTest />
    </BodyDetector>
  );
}
