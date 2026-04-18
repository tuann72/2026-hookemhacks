"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { initPose, processFrame, type RawPoseResult } from "@/lib/mediapipe/pose";
import { buildArmState, buildHandState } from "@/lib/mediapipe/gestures";
import type { BodyTrackingState, ArmState } from "@/types";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const POSE = { LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_ELBOW: 13, RIGHT_ELBOW: 14, LEFT_WRIST: 15, RIGHT_WRIST: 16 };

// Skeleton connections to draw: [from, to] pose landmark index pairs
const ARM_CONNECTIONS: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

function drawDebugCanvas(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  raw: RawPoseResult,
) {
  const { width, height } = ctx.canvas;

  // Mirror + draw video frame
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -width, 0, width, height);
  ctx.restore();

  const toX = (x: number) => (1 - x) * width; // mirrored
  const toY = (y: number) => y * height;

  function dot(lm: NormalizedLandmark, color: string, r = 4) {
    ctx.beginPath();
    ctx.arc(toX(lm.x), toY(lm.y), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function line(a: NormalizedLandmark, b: NormalizedLandmark, color: string) {
    ctx.beginPath();
    ctx.moveTo(toX(a.x), toY(a.y));
    ctx.lineTo(toX(b.x), toY(b.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw pose arm skeleton
  if (raw.poseLandmarks.length > 0) {
    const lm = raw.poseLandmarks[0];
    for (const [a, b] of ARM_CONNECTIONS) line(lm[a], lm[b], "#00ff00");
    for (const idx of [11, 12, 13, 14, 15, 16]) dot(lm[idx], "#00ff00");
  }

  // Draw hands
  for (const [landmarks, color] of [
    [raw.leftHandLandmarks, "#ff6600"],
    [raw.rightHandLandmarks, "#00aaff"],
  ] as [NormalizedLandmark[] | null, string][]) {
    if (!landmarks) continue;
    for (const [a, b] of HAND_CONNECTIONS) line(landmarks[a], landmarks[b], color);
    for (const lm of landmarks) dot(lm, color, 3);
  }
}

const defaultState: BodyTrackingState = {
  leftArm: null,
  rightArm: null,
  leftHand: null,
  rightHand: null,
  fps: 0,
  isReady: false,
};

export const BodyTrackingContext = createContext<BodyTrackingState>(defaultState);

export function useBodyDetection(): BodyTrackingState {
  return useContext(BodyTrackingContext);
}

export function useBodyDetectionProvider(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef?: React.RefObject<HTMLCanvasElement | null>,
) {
  const [state, setState] = useState<BodyTrackingState>(defaultState);
  const prevWristsRef = useRef<{ left: NormalizedLandmark | null; right: NormalizedLandmark | null }>({ left: null, right: null });
  const prevTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const fpsRef = useRef<{ count: number; lastTime: number }>({ count: 0, lastTime: 0 });

  const loop = useCallback((timestamp: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const dt = prevTimeRef.current ? (timestamp - prevTimeRef.current) / 1000 : 0;
    prevTimeRef.current = timestamp;

    const raw = processFrame(video, timestamp);

    // Draw debug canvas if provided
    const canvas = canvasRef?.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) drawDebugCanvas(ctx, video, raw);
    }

    let leftArm: ArmState | null = null;
    let rightArm: ArmState | null = null;

    if (raw.poseLandmarks.length > 0) {
      const lm = raw.poseLandmarks[0];
      leftArm = buildArmState(lm[POSE.RIGHT_SHOULDER], lm[POSE.RIGHT_ELBOW], lm[POSE.RIGHT_WRIST], prevWristsRef.current.left, dt);
      rightArm = buildArmState(lm[POSE.LEFT_SHOULDER], lm[POSE.LEFT_ELBOW], lm[POSE.LEFT_WRIST], prevWristsRef.current.right, dt);
      prevWristsRef.current = { left: lm[POSE.RIGHT_WRIST], right: lm[POSE.LEFT_WRIST] };
    }

    fpsRef.current.count++;
    const elapsed = timestamp - fpsRef.current.lastTime;
    const fps = elapsed > 500 ? Math.round((fpsRef.current.count / elapsed) * 1000) : undefined;
    if (fps !== undefined) fpsRef.current = { count: 0, lastTime: timestamp };

    setState((prev) => ({
      leftArm,
      rightArm,
      leftHand: raw.leftHandLandmarks ? buildHandState(raw.leftHandLandmarks) : null,
      rightHand: raw.rightHandLandmarks ? buildHandState(raw.rightHandLandmarks) : null,
      fps: fps ?? prev.fps,
      isReady: true,
    }));

    rafRef.current = requestAnimationFrame(loop);
  }, [videoRef, canvasRef]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        await initPose();
        if (!cancelled) rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        console.error("Body tracking init failed:", e);
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      const video = videoRef.current;
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    };
  }, [loop, videoRef]);

  return state;
}
