"use client";

import { useBodyDetection } from "@/hooks/useBodyDetection";
import { useIngestion } from "@/lib/ingestion/useIngestion";

interface Props {
  roomId: string;
  playerId: string;
}

// Sits inside the BodyDetector tree so it can reach the webcam stream via
// context. Starts a match row and recording when both roomId/playerId are
// known and the stream is live; cleans up on unmount.
export function IngestionBridge({ roomId, playerId }: Props) {
  const { videoRef, isReady } = useBodyDetection();

  // Only extract the stream once the first pose frame has processed — by then
  // the webcam stream is guaranteed to be attached to the video element.
  const stream = isReady
    ? ((videoRef?.current?.srcObject as MediaStream | null) ?? null)
    : null;

  useIngestion({ roomId, playerId, stream });

  return null;
}
