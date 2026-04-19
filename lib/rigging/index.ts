import * as THREE from "three";
import type { Group, Object3D } from "three";
import type {
  ArmState,
  BoneRotation,
  HumanoidBoneName,
  PoseLandmark,
  RigRotations,
  TorsoState,
} from "@/types";

const toRad = (deg: number) => (deg * Math.PI) / 180;

export interface BoneRotations {
  leftUpperArm: THREE.Euler;
  leftForearm: THREE.Euler;
  rightUpperArm: THREE.Euler;
  rightForearm: THREE.Euler;
}

export function armStateToBoneRotations(left: ArmState | null, right: ArmState | null): BoneRotations {
  const leftUpperArm = left
    ? new THREE.Euler(0, 0, -toRad(left.raisedHeight * 90))
    : new THREE.Euler();
  const leftForearm = left
    ? new THREE.Euler(0, 0, -toRad(180 - left.elbowAngle))
    : new THREE.Euler();

  const rightUpperArm = right
    ? new THREE.Euler(0, 0, toRad(right.raisedHeight * 90))
    : new THREE.Euler();
  const rightForearm = right
    ? new THREE.Euler(0, 0, toRad(180 - right.elbowAngle))
    : new THREE.Euler();

  return { leftUpperArm, leftForearm, rightUpperArm, rightForearm };
}

/**
 * Convert teammate's `ArmState` (CV-derived arm geometry) into the
 * `RigRotations` shape my Avatar consumes via applyRigRotations.
 *
 * Axis convention for my rig (differs from VRM conventions some solvers use):
 *   - UpperArm.z: raise/lower. Left arm uses negative z to tilt outward;
 *     right arm uses positive z. raisedHeight ∈ [0,1] maps to 0..90°.
 *   - LowerArm.x: elbow bend toward body. Straight elbow (180°) = 0 rad,
 *     fully bent (≈0°) = -π rad. Negative x rotates the forearm forward.
 */
export function armStateToRigRotations(
  left: ArmState | null,
  right: ArmState | null
): RigRotations {
  const pose: Partial<Record<HumanoidBoneName, BoneRotation>> = {};

  // UpperArm.z: signed sideRaiseAngle lets the arm cross the body — negative
  // side raises outward, positive crosses inward. Replaces the old unsigned
  // raisedHeight (which also misfired for forward-pointing arms).
  //
  // UpperArm.x: forward/back swing in the sagittal plane.
  //
  // LowerArm.x: elbow bend; -(180° − elbowAngle) in radians so a straight
  // arm is 0 and fully bent is -π.
  // Elbow bend direction: the magnitude of the bend from the 3D angle
  // doesn't say whether the forearm is in front of or behind the body.
  // Default (-1) sends the forearm toward avatar-forward (into scene) —
  // correct for bicep curls, forward reaches, and hands-to-face poses.
  // When the wrist is clearly behind the shoulder in world-space z, flip
  // to +1 so the forearm bends behind the head instead.
  const BACKWARD_BEND_Z = 0.08; // meters
  if (left) {
    pose.LeftUpperArm = {
      x: -left.forwardAngle,
      y: 0,
      z: left.sideRaiseAngle,
    };
    const leftSign = left.wristZOffset > BACKWARD_BEND_Z ? 1 : -1;
    pose.LeftLowerArm = { x: leftSign * toRad(180 - left.elbowAngle), y: 0, z: 0 };
  }
  if (right) {
    pose.RightUpperArm = {
      x: -right.forwardAngle,
      y: 0,
      z: right.sideRaiseAngle,
    };
    const rightSign = right.wristZOffset > BACKWARD_BEND_Z ? 1 : -1;
    pose.RightLowerArm = { x: rightSign * toRad(180 - right.elbowAngle), y: 0, z: 0 };
  }

  return { pose };
}

/**
 * Convert CV-derived torso lean + twist into Spine/Chest rotations. With the
 * slot's rotationY=π flip, same sign convention as the arm rig: negative x
 * on Spine pitches the chest into the scene (forward lean). Side lean and
 * twist are dampened a bit because MediaPipe pose is noisy at the small
 * differences between shoulder/hip landmarks.
 */
const TORSO_LEAN_FORWARD_GAIN = 0.9;
const TORSO_LEAN_SIDE_GAIN = 0.7;
const TORSO_TWIST_GAIN = 0.8;

export function torsoStateToRigRotations(torso: TorsoState | null): RigRotations {
  const pose: Partial<Record<HumanoidBoneName, BoneRotation>> = {};
  if (torso) {
    // Spine carries the full-body lean. Chest carries the shoulder-vs-hip
    // twist so the hips stay planted with the scene-space slot orientation.
    // Sign note: Spine points +Y (up from Hips), so `rotation.x` flips the
    // world-space forward direction vs the arm chain which hangs in −Y.
    pose.Spine = {
      x: torso.leanForward * TORSO_LEAN_FORWARD_GAIN,
      y: 0,
      z: -torso.leanSide * TORSO_LEAN_SIDE_GAIN,
    };
    pose.Chest = {
      x: 0,
      y: -torso.twist * TORSO_TWIST_GAIN,
      z: 0,
    };
  }
  return { pose };
}

/**
 * Map of humanoid bone name → the Three.js group representing that bone.
 * Populated by the Avatar component via ref callbacks. Passed to
 * applyRigRotations so Kalidokit output lands on the right joints.
 */
export type AvatarBones = Partial<Record<HumanoidBoneName, Group | Object3D>>;

const TAU = Math.PI * 2;

/** Shortest-arc lerp between two angles in radians, preserving wrap. */
function lerpAngle(from: number, to: number, alpha: number): number {
  let diff = (to - from) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return from + diff * alpha;
}

/**
 * Apply Kalidokit rig rotations to the avatar's humanoid bones with a simple
 * lerp for smoothing. Call this from useFrame when a fresh rig is available.
 *
 * @param bones   — ref registry collected by the Avatar
 * @param rig     — Kalidokit.Pose.solve() output (pose + optional face/hands)
 * @param lerp    — 0..1 smoothing factor per frame (0 = freeze, 1 = snap)
 *
 * TODO(track1): replace the plain lerp with a one-euro filter for variable
 * framerates — the jitter at low FPS is visibly worse with straight lerp.
 */
export function applyRigRotations(
  bones: AvatarBones,
  rig: RigRotations,
  lerp = 0.35
): void {
  const pose = rig.pose;
  if (!pose) return;

  for (const [name, rot] of Object.entries(pose) as Array<
    [HumanoidBoneName, BoneRotation]
  >) {
    const bone = bones[name];
    if (!bone) continue;
    bone.rotation.x = lerpAngle(bone.rotation.x, rot.x, lerp);
    bone.rotation.y = lerpAngle(bone.rotation.y, rot.y, lerp);
    bone.rotation.z = lerpAngle(bone.rotation.z, rot.z, lerp);
  }
}

/**
 * Reset every registered bone to its rest (T-pose) rotation. Useful between
 * pose "sessions" so the avatar returns to neutral rather than frozen on the
 * last captured frame.
 */
export function resetRigRotations(bones: AvatarBones): void {
  for (const bone of Object.values(bones)) {
    if (!bone) continue;
    bone.rotation.set(0, 0, 0);
  }
}

// -------------------------------------------------------------------------
// TRACK 1 — CV landing pad.
// Stub kept from the teammate scaffold. Kalidokit will take the raw 33-keypoint
// MediaPipe output and return a RigRotations shape. Track 1 fills this in.
// -------------------------------------------------------------------------
export function landmarksToBoneRotations(_landmarks: PoseLandmark[]): RigRotations {
  return { pose: {} };
}

// -------------------------------------------------------------------------
// Finger rigging — maps MediaPipe's 21-landmark hand output to per-finger
// joint rotations on the avatar. Each finger has 3 bones (Proximal,
// Intermediate, Distal) and MediaPipe gives us 4 landmarks down the chain
// (base → MCP → PIP → DIP → TIP), letting us derive a bend angle at each
// joint via sliding 3-tuples.
// -------------------------------------------------------------------------

// MediaPipe Hand landmark indices, one entry per finger. Each chain is
// [base, MCP, PIP, DIP, TIP]. For the thumb the names differ (CMC, MCP, IP)
// but the same sliding-window geometry applies.
const HAND_FINGER_CHAINS: Array<{
  name: "Thumb" | "Index" | "Middle" | "Ring" | "Little";
  chain: [number, number, number, number, number];
}> = [
  { name: "Thumb", chain: [0, 1, 2, 3, 4] },
  { name: "Index", chain: [0, 5, 6, 7, 8] },
  { name: "Middle", chain: [0, 9, 10, 11, 12] },
  { name: "Ring", chain: [0, 13, 14, 15, 16] },
  { name: "Little", chain: [0, 17, 18, 19, 20] },
];

/**
 * Convert a single hand's 21 MediaPipe landmarks into per-finger joint
 * rotations for my avatar's rig.
 *
 * For each finger we compute three bend angles from sliding 3-point windows:
 *   Proximal bend  = 180° − ∠(base, MCP, PIP)
 *   Intermediate   = 180° − ∠(MCP, PIP, DIP)
 *   Distal         = 180° − ∠(PIP, DIP, TIP)
 *
 * Each bend drives the corresponding bone's local X rotation (same sign
 * convention as the elbow — negative x = curl forward, toward the palm).
 */
export function handLandmarksToFingerRig(
  side: "Left" | "Right",
  landmarks: PoseLandmark[] | null
): Partial<Record<HumanoidBoneName, BoneRotation>> {
  const out: Partial<Record<HumanoidBoneName, BoneRotation>> = {};
  if (!landmarks || landmarks.length < 21) return out;

  // Hand bone rotation — approximate wrist pitch + yaw from the wrist-to-
  // middle-MCP vector (the hand's "forward" axis). When fingers hang down
  // (default rest pose) this vector points in +y image direction; rotating
  // the wrist to point fingers forward/sideways rotates this vector, which
  // we translate into Hand bone rotations.
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  if (wrist && middleMcp) {
    const dx = middleMcp.x - wrist.x;
    const dy = middleMcp.y - wrist.y;
    const dz = middleMcp.z - wrist.z;
    const safeDy = Math.max(dy, 0.01);
    // pitch: fingers forward (dz < 0) → negative x rotation (hand tips forward)
    const pitch = Math.atan2(-dz, safeDy);
    // yaw: fingers to the side → z rotation (hand rolls)
    const yaw = Math.atan2(dx, safeDy);
    const handName = `${side}Hand` as HumanoidBoneName;
    out[handName] = { x: -pitch, y: 0, z: yaw };
  }

  for (const { name, chain } of HAND_FINGER_CHAINS) {
    const joints: Array<[
      "Proximal" | "Intermediate" | "Distal",
      number,
      number,
      number
    ]> = [
      ["Proximal", chain[0], chain[1], chain[2]],
      ["Intermediate", chain[1], chain[2], chain[3]],
      ["Distal", chain[2], chain[3], chain[4]],
    ];

    for (const [role, a, b, c] of joints) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      const pc = landmarks[c];
      if (!pa || !pb || !pc) continue;

      // 3D is fine for hand landmarks — MediaPipe Hand's z is wrist-relative
      // and much more reliable than body pseudo-z.
      const ab = { x: pa.x - pb.x, y: pa.y - pb.y, z: pa.z - pb.z };
      const cb = { x: pc.x - pb.x, y: pc.y - pb.y, z: pc.z - pb.z };
      const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
      const magAB = Math.hypot(ab.x, ab.y, ab.z);
      const magCB = Math.hypot(cb.x, cb.y, cb.z);
      if (magAB === 0 || magCB === 0) continue;

      const angleRad = Math.acos(
        Math.max(-1, Math.min(1, dot / (magAB * magCB)))
      );
      // bend: 0 when finger is straight (angle=π), positive as it curls
      const bend = Math.PI - angleRad;
      const boneName = `${side}${name}${role}` as HumanoidBoneName;
      out[boneName] = { x: -bend, y: 0, z: 0 };
    }
  }

  return out;
}
