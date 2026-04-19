"use client";

import { useRef } from "react";
import { BodyTrackingContext, useBodyDetectionProvider } from "@/hooks/useBodyDetection";

interface Props {
  children: React.ReactNode;
  debug?: boolean;
}

export default function BodyDetector({ children, debug = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const state = useBodyDetectionProvider(videoRef, debug ? canvasRef : undefined, overlayCanvasRef);

  return (
    <BodyTrackingContext.Provider value={{ ...state, videoRef, overlayCanvasRef }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      {debug && (
        <canvas
          ref={canvasRef}
          className="body-debug-canvas"
          width={640}
          height={480}
          style={{ position: "fixed", bottom: 16, right: 16, width: 240, height: 180, border: "1px solid #0f0", zIndex: 9999, background: "#000" }}
        />
      )}
      {children}
    </BodyTrackingContext.Provider>
  );
}
