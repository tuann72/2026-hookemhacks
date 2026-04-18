export interface RawPoseResult {
  poseLandmarks: unknown[][];
  leftHandLandmarks: unknown[] | null;
  rightHandLandmarks: unknown[] | null;
}

export async function initPose(): Promise<void> {
  // TODO: MediaPipe initialization
}

export function processFrame(video: HTMLVideoElement, timestamp: number): RawPoseResult {
  // TODO: MediaPipe frame processing
  return { poseLandmarks: [], leftHandLandmarks: null, rightHandLandmarks: null };
}
