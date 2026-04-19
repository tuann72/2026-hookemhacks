"use client";

import { useEffect, useRef } from "react";
import { useBodyDetection } from "@/hooks/useBodyDetection";
import { useIngestion } from "@/lib/ingestion/useIngestion";
import { useEventTracker } from "@/lib/ingestion/useEventTracker";

interface Props {
  roomId: string;
  playerId: string;
}

export function IngestionBridge({ roomId, playerId }: Props) {
  const { videoRef, isReady, leftHandLandmarks, rightHandLandmarks } = useBodyDetection();
  const tracker = useEventTracker();
  const calibratedRef = useRef(false);

  const stream = isReady
    ? ((videoRef?.current?.srcObject as MediaStream | null) ?? null)
    : null;

  // Auto-calibrate once on the first frame both hands are visible.
  // Assumes the player starts with their guard up (natural boxing stance).
  useEffect(() => {
    if (calibratedRef.current) return;
    if (!leftHandLandmarks && !rightHandLandmarks) return;
    tracker.calibrate(leftHandLandmarks, rightHandLandmarks);
    calibratedRef.current = true;
  }, [leftHandLandmarks, rightHandLandmarks, tracker]);

  // Per-frame punch detection.
  useEffect(() => {
    tracker.detect(leftHandLandmarks, rightHandLandmarks);
  }, [leftHandLandmarks, rightHandLandmarks, tracker]);

  useIngestion({
    roomId,
    playerId,
    stream,
    drainEvents: tracker.drainEvents,
    getChunkRollup: tracker.rollChunk,
  });

  return null;
}
