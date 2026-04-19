import type { GestureLabel, ArmState, HandState, TorsoState } from "@/types";

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

/**
 * 2D variant — ignores the z coordinate. MediaPipe Pose's z on body landmarks
 * is pseudo-3D (regressed, not true depth) and noisy, so including it in
 * elbow-angle math produces wobble. XY-only matches what you'd eyeball from
 * the video frame and is far more stable. Use this for elbow/angle-of-limb
 * calculations; keep the full 3D calcAngle for things that genuinely need it.
 */
export function calcAngle2D(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (magAB === 0 || magCB === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * 180) / Math.PI;
}

const JITTER_THRESHOLD = 0.032; // ignore sub-pixel MediaPipe noise

export function calcSwingSpeed(prev: Vec3, curr: Vec3, dt: number): number {
  if (dt === 0) return 0;
  const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2 + (curr.z - prev.z) ** 2);
  if (dist < JITTER_THRESHOLD) return 0;
  return dist / dt / 6;
}

// MediaPipe y=0 is top of frame, y=1 is bottom — so lower wrist.y = higher physical position
export function calcRaisedHeight(wrist: Vec3, shoulder: Vec3): number {
  return Math.max(0, Math.min(1, (shoulder.y - wrist.y) + 0.5));
}

/**
 * Forward/back swing angle in the sagittal plane. MediaPipe Pose's z is
 * relative to the hip — negative z = closer to camera. So wrist.z < shoulder.z
 * means the wrist is in front of the shoulder (arm swung forward).
 *
 * Returns radians: 0 at rest (arm hangs straight), +π/2 fully forward,
 * -π/2 fully backward.
 */
export function calcForwardAngle(wrist: Vec3, shoulder: Vec3): number {
  const dy = wrist.y - shoulder.y; // positive when wrist below shoulder
  const dz = wrist.z - shoulder.z; // negative when wrist forward of shoulder
  // Linear fade once the wrist rises past the shoulder. A hard cutoff
  // caused a glitch where a forward-extended arm lifted past shoulder
  // level snapped from ≈π/2 to 0 in one frame. The fade keeps motion
  // smooth and still suppresses the ±π/2 noise that fires when dy goes
  // well negative (tiny-dy denominator amplifies z noise).
  const fade = dy >= 0 ? 1 : Math.max(0, 1 + dy / 0.08);
  if (fade <= 0) return 0;
  return fade * Math.atan2(-dz, Math.max(Math.abs(dy), 1e-4));
}

/**
 * Signed image-plane angle from straight-down to arm direction, in radians.
 * Uses only X/Y so it's robust: an arm pointed at the camera has small dx
 * AND small dy in 2D → near-zero side raise (vs teammate's calcRaisedHeight
 * which fires at 0.5 in that case, falsely signalling a half-raised arm).
 *
 * Sign preserved so crossing over the body reads as the opposite rotation
 * from outward raise:
 *   positive = arm moves in the +x image direction from the shoulder
 *   negative = arm moves in the -x image direction
 *
 * Magnitude:
 *   0       = arm hanging straight down
 *   ±π/2    = arm horizontal (outward or crossed, depending on sign)
 *   π       = arm raised straight up
 *   ≈ 0     = arm pointed forward (toward camera)
 */
export function calcSideRaiseAngle(wrist: Vec3, shoulder: Vec3): number {
  const dx = wrist.x - shoulder.x; // signed
  const dy = wrist.y - shoulder.y; // positive below, negative above
  // When the arm is pointed at the camera, dx/dy both collapse and this
  // angle becomes noisy garbage. Short-circuit to 0 so the forward-reach
  // rotation isn't compounded with phantom sideways tilt.
  const span2D = Math.hypot(dx, dy);
  if (span2D < 0.06) return 0;
  return Math.atan2(dx, dy);
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
  worldShoulder: NormalizedLandmark | undefined,
  worldElbow: NormalizedLandmark | undefined,
  worldWrist: NormalizedLandmark | undefined,
  prevWrist: Vec3 | null,
  dt: number
): ArmState {
  const span2D = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y);
  // Prefer MediaPipe's real-world 3D landmarks (meters, hip-centered) for
  // the elbow angle — true 3D means the bend is captured correctly in any
  // arm orientation, including arm-near-vertical poses where 2D collapses.
  // Fall back to image landmarks (and the head-on short-circuit) if world
  // data is missing on a frame.
  const elbowAngle =
    worldShoulder && worldElbow && worldWrist
      ? calcAngle(worldShoulder, worldElbow, worldWrist)
      : span2D < 0.06
        ? 180
        : calcAngle(shoulder, elbow, wrist);
  const swingSpeed = prevWrist ? calcSwingSpeed(prevWrist, wrist, dt) : 0;
  const raisedHeight = calcRaisedHeight(wrist, shoulder);
  // Drive upper-arm orientation from the shoulder→ELBOW segment, not
  // shoulder→wrist. For a straight arm they're identical, but for a bent
  // arm (e.g. boxing guard: elbow out to side, wrist in front of face)
  // wrist-based angles short-circuit and the upper arm stays hanging.
  // Elbow is what actually defines the upper-arm direction.
  const forwardAngle = calcForwardAngle(elbow, shoulder);
  const sideRaiseAngle = calcSideRaiseAngle(elbow, shoulder);
  // World-space z offset (meters) is a much cleaner signal than the image-
  // landmark pseudo-z for disambiguating forearm-forward vs -backward.
  const wristZOffset =
    worldWrist && worldShoulder
      ? worldWrist.z - worldShoulder.z
      : wrist.z - shoulder.z;
  return {
    elbowAngle,
    swingSpeed,
    raisedHeight,
    forwardAngle,
    sideRaiseAngle,
    wristZOffset,
    isExtended: elbowAngle > 150,
  };
}

export function buildHandState(landmarks: NormalizedLandmark[]): HandState {
  return {
    gesture: detectGesture(landmarks),
    pinchDistance: calcPinchDistance(landmarks),
  };
}

/**
 * Compute torso lean + twist from the four shoulder/hip landmarks. Pass
 * MediaPipe pose world landmarks (meters, origin at hip center) — the
 * world-coordinate math is robust to camera perspective. MediaPipe's world
 * frame: +x = subject's right, +y = down, +z = behind the subject.
 */
export function buildTorsoState(
  leftShoulder: Vec3,
  rightShoulder: Vec3,
  leftHip: Vec3,
  rightHip: Vec3,
): TorsoState {
  const midShoulder = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2,
  };
  const midHip = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };
  const torsoVec = {
    x: midShoulder.x - midHip.x,
    y: midShoulder.y - midHip.y,
    z: midShoulder.z - midHip.z,
  };
  // Upright torso points "up" in the subject's frame, which is -y in MP
  // world coords. leanForward: tilt toward camera (shoulders shift into
  // -z) gives a positive angle. leanSide: shoulders shift in +x (subject's
  // right) gives positive.
  const upMag = Math.max(Math.abs(torsoVec.y), 0.05); // avoid div-by-near-zero
  const leanForward = Math.atan2(-torsoVec.z, upMag);
  const leanSide = Math.atan2(torsoVec.x, upMag);

  // Twist: angle of the shoulder line in the horizontal (X-Z) plane minus
  // the angle of the hip line. Unwound subject has both lines pointing in
  // +x; twisting to the right sends the right shoulder back (+z) and
  // rotates the shoulder-line angle while the hip line stays put.
  const shoulderAngle = Math.atan2(
    rightShoulder.z - leftShoulder.z,
    rightShoulder.x - leftShoulder.x,
  );
  const hipAngle = Math.atan2(
    rightHip.z - leftHip.z,
    rightHip.x - leftHip.x,
  );
  let twist = shoulderAngle - hipAngle;
  while (twist > Math.PI) twist -= 2 * Math.PI;
  while (twist < -Math.PI) twist += 2 * Math.PI;

  return { leanForward, leanSide, twist };
}
