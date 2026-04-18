import type { RawPoseResult } from "@/lib/mediapipe/pose";
import type { BodyTrackingState } from "@/types";
import type {
  ArmLandmarks,
  PoseSnapshot,
  WireLandmark,
} from "./types";

// MediaPipe pose landmark indices for the arm skeleton we render.
const POSE = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const;

function trim(l: { x: number; y: number; z: number; visibility?: number }): WireLandmark {
  // Drop whatever extra fields MediaPipe's landmark type might carry.
  return l.visibility !== undefined
    ? { x: l.x, y: l.y, z: l.z, visibility: l.visibility }
    : { x: l.x, y: l.y, z: l.z };
}

function trimAll(ls: readonly { x: number; y: number; z: number; visibility?: number }[] | null) {
  return ls ? ls.map(trim) : null;
}

/**
 * Pack a MediaPipe frame + derived body state into a compact wire snapshot.
 * Does not assign playerId/timestamp — the channel fills those on send.
 */
export function buildPoseSnapshot(
  raw: RawPoseResult,
  body: BodyTrackingState,
): Omit<PoseSnapshot, "playerId" | "timestamp"> {
  let arms: ArmLandmarks | null = null;
  const pose = raw.poseLandmarks[0];
  if (pose) {
    arms = [
      trim(pose[POSE.LEFT_SHOULDER]),
      trim(pose[POSE.RIGHT_SHOULDER]),
      trim(pose[POSE.LEFT_ELBOW]),
      trim(pose[POSE.RIGHT_ELBOW]),
      trim(pose[POSE.LEFT_WRIST]),
      trim(pose[POSE.RIGHT_WRIST]),
    ];
  }

  return {
    arms,
    leftHand: trimAll(raw.leftHandLandmarks),
    rightHand: trimAll(raw.rightHandLandmarks),
    armStates: { left: body.leftArm, right: body.rightArm },
    handStates: { left: body.leftHand, right: body.rightHand },
  };
}
