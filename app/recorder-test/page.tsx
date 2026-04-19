"use client";

// DEV-ONLY — simulates the full in-game ingestion pipeline without needing a
// live multiplayer room. Opens the webcam, detects punches via MediaPipe, and
// auto-uploads each 5-second chunk with real event_counts to /api/clips/upload,
// then immediately embeds it via /api/dev/process-clip.

import { useCallback, useEffect, useRef, useState } from "react";
import BodyDetector from "@/components/detection/BodyDetector";
import { useBodyDetection } from "@/hooks/useBodyDetection";
import { useRecorder } from "@/lib/recorder";
import type { ChunkReady } from "@/lib/recorder";
import { useEventTracker } from "@/lib/ingestion/useEventTracker";
import { useIdentity } from "@/hooks/useIdentity";
import Link from "next/link";

type ChunkStatus = "uploading" | "embedding" | "ready" | "error";

type ChunkEntry = {
  chunk: ChunkReady;
  url: string;
  counts: Record<string, number>;
  clipId?: string;
  caption?: string;
  status: ChunkStatus;
  errorMsg?: string;
};

function RecorderTestPanel() {
  const { overlayCanvasRef, videoRef, isReady, fps, leftHandLandmarks, rightHandLandmarks } = useBodyDetection();
  const tracker = useEventTracker();
  const { playerId } = useIdentity();
  const devPlayerId = playerId || "dev";
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamCaptured = useRef(false);
  if (isReady && !streamCaptured.current && videoRef?.current?.srcObject) {
    streamCaptured.current = true;
    setStream(videoRef.current.srcObject as MediaStream);
  }

  // Per-frame punch detection — only re-renders when a new punch lands
  const [punchTotal, setPunchTotal] = useState(0);
  const prevPunchRef = useRef(0);
  useEffect(() => {
    tracker.detect(leftHandLandmarks, rightHandLandmarks);
    const n = tracker.getTotals().punch ?? 0;
    if (n !== prevPunchRef.current) {
      prevPunchRef.current = n;
      setPunchTotal(n);
    }
  }, [leftHandLandmarks, rightHandLandmarks, tracker]);

  const [entries, setEntries] = useState<ChunkEntry[]>([]);

  const handleChunk = useCallback(
    async (chunk: ChunkReady) => {
      const counts = tracker.rollChunk();
      const url = URL.createObjectURL(chunk.blob);
      const idx = chunk.chunkIndex;

      const patch = (update: Partial<ChunkEntry>) =>
        setEntries((prev) =>
          prev.map((e) => (e.chunk.chunkIndex === idx ? { ...e, ...update } : e))
        );

      setEntries((prev) => [...prev, { chunk, url, counts, status: "uploading" }]);

      try {
        const form = new FormData();
        form.append("chunk", chunk.blob, `${idx}.webm`);
        form.append(
          "meta",
          JSON.stringify({
            matchId: null,
            playerId: devPlayerId,
            chunkIndex: idx,
            startedAt: chunk.startedAt,
            durationMs: chunk.durationMs,
            rollup: { counts },
          })
        );

        const upRes = await fetch("/api/clips/upload", { method: "POST", body: form });
        const upJson = await upRes.json();
        if (!upRes.ok) throw new Error(upJson.error ?? "upload failed");

        patch({ status: "embedding", clipId: upJson.clipId });

        const embRes = await fetch("/api/dev/process-clip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clipId: upJson.clipId }),
        });
        const embJson = await embRes.json();
        if (!embRes.ok) throw new Error(embJson.error ?? "embedding failed");

        patch({ status: "ready", caption: embJson.caption });
      } catch (err) {
        patch({ status: "error", errorMsg: err instanceof Error ? err.message : String(err) });
      }
    },
    [tracker]
  );

  const { state, error, start, stop } = useRecorder(
    stream,
    { chunkDurationMs: 5_000 },
    handleChunk
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        gap: 24,
        height: "100vh",
        padding: 24,
        background: "#0f0c18",
        color: "#f5eeff",
        fontFamily: "monospace",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.25em", color: "#9c82c0", textTransform: "uppercase" }}>
              Dev · Ingestion test
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: "sans-serif", fontWeight: 700 }}>
              Game pipeline sim
            </h1>
          </div>
          <Link href="/" style={{ fontSize: 11, color: "#9c82c0", textDecoration: "none" }}>
            ← Home
          </Link>
        </div>

        {/* Camera feed */}
        <div
          style={{
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            border: "1.5px solid rgba(255,255,255,0.08)",
            aspectRatio: "4/3",
            background: "#000",
            flexShrink: 0,
          }}
        >
          <canvas
            ref={overlayCanvasRef}
            width={640}
            height={480}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                background: "rgba(0,0,0,0.6)",
                borderRadius: 6,
                padding: "3px 8px",
                color: isReady ? "#2e7d5b" : "#f5c978",
              }}
            >
              {isReady ? `LIVE · ${fps} fps` : "WAITING"}
            </span>
            {state === "recording" && (
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  background: "rgba(0,0,0,0.6)",
                  borderRadius: 6,
                  padding: "3px 8px",
                  color: "#ff3d1f",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#ff3d1f",
                    display: "inline-block",
                    animation: "pulse 1s ease-in-out infinite",
                  }}
                />
                REC
              </span>
            )}
          </div>
        </div>

        {/* Punch counter + calibrate */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.07)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "#9c82c0", textTransform: "uppercase" }}>
              Punches detected
            </span>
            <span style={{ fontSize: 10, color: tracker.isCalibrated ? "#2e7d5b" : "#f5c978" }}>
              {tracker.isCalibrated ? "Guard calibrated" : "Not calibrated"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: punchTotal > 0 ? "#ff6b4a" : "rgba(255,255,255,0.2)" }}>
              {punchTotal}
            </span>
            <button
              type="button"
              onClick={() => tracker.calibrate(leftHandLandmarks, rightHandLandmarks)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(100,180,255,0.4)",
                background: "rgba(100,180,255,0.1)",
                color: "#7cc5ff",
                fontSize: 11,
                fontFamily: "monospace",
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              Calibrate guard
            </button>
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.07)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#9c82c0", textTransform: "uppercase" }}>
            Controls
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => start("dev", devPlayerId)}
              disabled={state !== "idle" || !stream}
              style={btnStyle(state === "idle" && !!stream, "start")}
            >
              Start recording
            </button>
            <button
              type="button"
              onClick={() => stop()}
              disabled={state !== "recording"}
              style={btnStyle(state === "recording", "stop")}
            >
              Stop
            </button>
          </div>
          <div style={{ fontSize: 11, color: stateColor(state) }}>
            state: <strong>{state}</strong>
            {error && <span style={{ color: "#ff3d1f", marginLeft: 8 }}>{error.message}</span>}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
            Chunks auto-upload every 5 s with real punch counts. No room needed.
          </div>
        </div>
      </div>

      {/* Right column: chunk log */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#9c82c0", textTransform: "uppercase", flexShrink: 0 }}>
          Clips — {entries.length}
        </div>

        {entries.length === 0 && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "20px 0" }}>
            No clips yet. Start recording and throw some punches.
          </div>
        )}

        {entries.map((entry) => {
          const { chunk, url, counts, status, caption, errorMsg, clipId } = entry;
          return (
            <div
              key={chunk.chunkIndex}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${status === "ready" ? "rgba(46,125,91,0.4)" : status === "error" ? "rgba(255,61,31,0.3)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 10,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ color: "#2e7d5b", fontWeight: 700, fontSize: 13 }}>#{chunk.chunkIndex}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {(chunk.durationMs / 1000).toFixed(2)} s
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {(chunk.blob.size / 1024).toFixed(0)} KB
                </span>
                <span style={{ fontSize: 11, color: counts.punch ? "#ff6b4a" : "rgba(255,255,255,0.25)" }}>
                  {counts.punch ?? 0} punch{(counts.punch ?? 0) !== 1 ? "es" : ""}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: statusBg(status),
                    color: statusColor(status),
                    textTransform: "uppercase",
                  }}
                >
                  {status}
                </span>
              </div>

              <video
                src={url}
                controls
                style={{ width: "100%", borderRadius: 6, background: "#000", maxHeight: 180 }}
              />

              {clipId && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                  clip id: {clipId}
                </div>
              )}

              {status === "error" && (
                <div style={{ fontSize: 11, color: "#ff3d1f" }}>{errorMsg}</div>
              )}

              {caption && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.6)",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: "#9c82c0", marginRight: 6 }}>caption:</span>
                  {caption}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function btnStyle(active: boolean, variant: "start" | "stop"): React.CSSProperties {
  return {
    flex: 1,
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    cursor: active ? "pointer" : "not-allowed",
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: 700,
    letterSpacing: "0.05em",
    opacity: active ? 1 : 0.35,
    background: variant === "start" ? "#2e7d5b" : "rgba(255,61,31,0.25)",
    color: variant === "start" ? "#fff" : "#ff3d1f",
    outline: variant === "stop" ? "1px solid rgba(255,61,31,0.4)" : "none",
  } as React.CSSProperties;
}

function stateColor(state: string): string {
  if (state === "recording") return "#ff3d1f";
  if (state === "error") return "#ff5e7e";
  if (state === "stopping") return "#f5c978";
  return "rgba(255,255,255,0.4)";
}

function statusBg(status: ChunkStatus): string {
  if (status === "ready") return "rgba(46,125,91,0.25)";
  if (status === "error") return "rgba(255,61,31,0.2)";
  return "rgba(255,255,255,0.06)";
}

function statusColor(status: ChunkStatus): string {
  if (status === "ready") return "#2e7d5b";
  if (status === "error") return "#ff3d1f";
  if (status === "embedding") return "#f5c978";
  return "rgba(255,255,255,0.5)";
}

export default function RecorderTestPage() {
  return (
    <BodyDetector>
      <RecorderTestPanel />
    </BodyDetector>
  );
}
