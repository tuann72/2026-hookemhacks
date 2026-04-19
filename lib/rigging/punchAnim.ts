import * as THREE from "three";
import type { AvatarBones } from "./index";

// Triangle-IK punch extension. The shoulder, elbow and hand form a 2-link
// chain:
//   A = UPPER_ARM_LEN (shoulder→elbow)
//   B = LOWER_ARM_LEN (elbow→hand)
// A single `extension ∈ [0, 1]` parameter drives the arm from bent-triangle
// (elbow interior ≈ 90°, fist tucked) to fully-extended line (elbow = 180°,
// fist at max reach). LowerArm.x falls straight out of that:
//     elbowInterior = lerp(π/2, π, extension)
//     LowerArm.x    = -(π - elbowInterior)     // 0 when straight
// UpperArm aims along the shoulder→target direction (handled by the existing
// aim helper), so at extension=1 the whole chain lies on the aim line.

const SIDES = {
  left: { upper: "LeftUpperArm", lower: "LeftLowerArm" },
  right: { upper: "RightUpperArm", lower: "RightLowerArm" },
} as const;

// Fallback aim when no target is provided — point forward in avatar-local
// (+Z before the rotationY flip) at peak extension.
const THRUST_FALLBACK = { upperX: -Math.PI / 2, upperZ: 0 };
const ELBOW_MIN = Math.PI / 2; // extension=0 → 90° bend
const ELBOW_MAX = Math.PI; // extension=1 → straight line

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Reusable scratch — these run every frame during a punch.
const _shoulderWorld = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _aimQuat = new THREE.Quaternion();
const _aimEuler = new THREE.Euler();
const REST_ARM_DIR = new THREE.Vector3(0, -1, 0);

/**
 * Euler (x, z) on the UpperArm needed to point its rest-down axis at
 * `targetWorld` from the shoulder pivot. Accounts for all ancestor
 * rotations by transforming the world aim into the shoulder's
 * parent-local space first.
 */
export function aimUpperArm(
  upperArm: THREE.Object3D,
  targetWorld: THREE.Vector3,
): { x: number; z: number } {
  const parent = upperArm.parent;
  if (!parent) return { x: THRUST_FALLBACK.upperX, z: THRUST_FALLBACK.upperZ };

  upperArm.getWorldPosition(_shoulderWorld);
  _aimDir.subVectors(targetWorld, _shoulderWorld);
  if (_aimDir.lengthSq() < 1e-6) {
    return { x: THRUST_FALLBACK.upperX, z: THRUST_FALLBACK.upperZ };
  }
  _aimDir.normalize();

  parent.getWorldQuaternion(_parentQuat).invert();
  _aimDir.applyQuaternion(_parentQuat);

  _aimQuat.setFromUnitVectors(REST_ARM_DIR, _aimDir);
  _aimEuler.setFromQuaternion(_aimQuat, "XYZ");
  return { x: _aimEuler.x, z: _aimEuler.z };
}

/**
 * Write the triangle-IK punch pose to the punching arm's bones.
 *
 * @param extension  0..1. 0 = bent elbow (fist tucked); 1 = straight arm.
 * @param targetWorld  optional aim point — if present, UpperArm aims at it
 *                     regardless of `extension` (so the punch tracks a
 *                     moving head during hold). Omitted → fixed forward.
 */
export function applyPunchKeyframe(
  bones: AvatarBones,
  side: "left" | "right",
  extension: number,
  targetWorld?: THREE.Vector3 | null,
): void {
  const { upper: upperName, lower: lowerName } = SIDES[side];
  const upper = bones[upperName];
  const lower = bones[lowerName];
  if (!upper || !lower) return;

  const e = Math.max(0, Math.min(1, extension));

  // UpperArm: aim at target (or fixed forward fallback).
  let upperX: number;
  let upperZ: number;
  if (targetWorld) {
    const aim = aimUpperArm(upper, targetWorld);
    upperX = aim.x;
    upperZ = aim.z;
  } else {
    const zSign = side === "left" ? -1 : 1;
    upperX = THRUST_FALLBACK.upperX;
    upperZ = THRUST_FALLBACK.upperZ * zSign;
  }

  // LowerArm: elbow opens from 90° → 180° as extension goes 0 → 1.
  const elbowInterior = lerp(ELBOW_MIN, ELBOW_MAX, e);
  const lowerX = -(Math.PI - elbowInterior);

  upper.rotation.x = upperX;
  upper.rotation.z = upperZ;
  upper.rotation.y = 0;
  lower.rotation.x = lowerX;
  lower.rotation.y = 0;
  lower.rotation.z = 0;
}
