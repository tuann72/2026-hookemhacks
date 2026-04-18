import type { GestureLabel, ArmState, HandState } from "@/types";

type NormalizedLandmark = { x: number; y: number; z: number; visibility?: number };

type Vec3 = { x: number; y: number; z: number };

export function calcAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2 + ab.z ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2 + cb.z ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * 180) / Math.PI;
}

export function calcSwingSpeed(prev: Vec3, curr: Vec3, dt: number): number {
  if (dt === 0) return 0;
  const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2 + (curr.z - prev.z) ** 2);
  return Math.min(1, dist / dt / 2);
}

// MediaPipe y=0 is top of frame, y=1 is bottom — so lower wrist.y = higher physical position
export function calcRaisedHeight(wrist: Vec3, shoulder: Vec3): number {
  return Math.max(0, Math.min(1, (shoulder.y - wrist.y) + 0.5));
}

function fingerCurl(tip: NormalizedLandmark, pip: NormalizedLandmark, mcp: NormalizedLandmark): number {
  return calcAngle(tip, pip, mcp);
}

export function detectGesture(landmarks: NormalizedLandmark[]): GestureLabel {
  if (landmarks.length < 21) return "unknown";

  const indexCurl = fingerCurl(landmarks[8], landmarks[6], landmarks[5]);
  const middleCurl = fingerCurl(landmarks[12], landmarks[10], landmarks[9]);
  const ringCurl = fingerCurl(landmarks[16], landmarks[14], landmarks[13]);
  const pinkyCurl = fingerCurl(landmarks[20], landmarks[18], landmarks[17]);
  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[2];
  const thumbUp = thumbTip.y < thumbMcp.y;

  const allCurled = indexCurl < 90 && middleCurl < 90 && ringCurl < 90 && pinkyCurl < 90;
  const allOpen = indexCurl > 150 && middleCurl > 150 && ringCurl > 150 && pinkyCurl > 150;
  const indexOut = indexCurl > 150 && middleCurl < 90 && ringCurl < 90 && pinkyCurl < 90;
  const indexMiddleOut = indexCurl > 150 && middleCurl > 150 && ringCurl < 90 && pinkyCurl < 90;

  if (allCurled && thumbUp) return "thumbsUp";
  if (allCurled) return "fist";
  if (allOpen) return "open";
  if (indexMiddleOut) return "peace";
  if (indexOut) return "point";
  return "unknown";
}

export function calcPinchDistance(landmarks: NormalizedLandmark[]): number {
  if (landmarks.length < 9) return 1;
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dist = Math.sqrt((thumb.x - index.x) ** 2 + (thumb.y - index.y) ** 2);
  return Math.min(1, dist / 0.3);
}

export function buildArmState(
  shoulder: NormalizedLandmark,
  elbow: NormalizedLandmark,
  wrist: NormalizedLandmark,
  prevWrist: Vec3 | null,
  dt: number
): ArmState {
  const elbowAngle = calcAngle(shoulder, elbow, wrist);
  const swingSpeed = prevWrist ? calcSwingSpeed(prevWrist, wrist, dt) : 0;
  const raisedHeight = calcRaisedHeight(wrist, shoulder);
  return {
    elbowAngle,
    swingSpeed,
    raisedHeight,
    isExtended: elbowAngle > 150,
  };
}

export function buildHandState(landmarks: NormalizedLandmark[]): HandState {
  return {
    gesture: detectGesture(landmarks),
    pinchDistance: calcPinchDistance(landmarks),
  };
}
