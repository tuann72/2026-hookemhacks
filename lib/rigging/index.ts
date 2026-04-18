import * as THREE from "three";
import type { Group, Object3D } from "three";
import type {
  ArmState,
  BoneRotation,
  HumanoidBoneName,
  PoseLandmark,
  RigRotations,
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

  if (left) {
    pose.LeftUpperArm = { x: 0, y: 0, z: -(left.raisedHeight * (Math.PI / 2)) };
    pose.LeftLowerArm = { x: -toRad(180 - left.elbowAngle), y: 0, z: 0 };
  }
  if (right) {
    pose.RightUpperArm = { x: 0, y: 0, z: right.raisedHeight * (Math.PI / 2) };
    pose.RightLowerArm = { x: -toRad(180 - right.elbowAngle), y: 0, z: 0 };
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
