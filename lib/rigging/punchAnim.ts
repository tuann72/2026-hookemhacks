import * as THREE from "three";
import type { AvatarBones } from "./index";

// Three-stage jab keyframe, applied to the punching arm's UpperArm + LowerArm
// after the CV rig has already been written. Each frame we overwrite those
// two bones with a fixed keyframe target — no blending from the current
// rotation — so the 0.35 lerp in applyRigRotations can't drag the punch back
// toward the CV guard pose.
//
// Axis convention (matches armStateToRigRotations):
//   UpperArm.x < 0 → arm swings forward (toward camera/opponent)
//   LowerArm.x  ≈ 0 → elbow straight; negative → elbow bent forward
//   UpperArm.z — side raise (signed; flip for left vs right)
//
// When `targetWorld` is provided (opponent head in world coords), the thrust
// phase aims the upper arm along the shoulder→target direction instead of a
// fixed forward angle. Lower arm still straightens at peak thrust.

const SIDES = {
  left: { upper: "LeftUpperArm", lower: "LeftLowerArm" },
  right: { upper: "RightUpperArm", lower: "RightLowerArm" },
} as const;

const WINDUP = { upperX: 0.45, upperZ: 0.15, lowerX: -1.7 };
const THRUST_FALLBACK = { upperX: -1.25, upperZ: 0.05 };
const THRUST_LOWER_X = 0.05;

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Reusable scratch — these functions run every frame during a punch.
const _shoulderWorld = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _aimQuat = new THREE.Quaternion();
const _aimEuler = new THREE.Euler();
const REST_ARM_DIR = new THREE.Vector3(0, -1, 0);

/**
 * Euler (x, z) on the UpperArm needed to point its rest-down axis at
 * `targetWorld` from the shoulder pivot. Accounts for all ancestor
 * rotations (Hips → Spine → Chest → Shoulder) by transforming the world
 * aim direction into the shoulder's parent-local space before deriving
 * the Euler.
 */
function aimUpperArm(
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
 * Write a jab keyframe to the punching arm's bones.
 *
 * @param phase         0..1 normalized elapsed time.
 * @param targetWorld   optional opponent aim point (e.g. their head). When
 *                      present, thrust phase aims at this point; otherwise
 *                      uses a fixed forward-facing thrust.
 *
 * Segments: 0–0.15 windup, 0.15–0.5 thrust, 0.5–1.0 recover. The recover
 * target is the rig's REST pose (zeros) — once phase crosses 1 the caller
 * clears `punchAnim`, applyRigRotations takes over again, and its built-in
 * lerp eases the arm back toward wherever CV has it.
 */
export function applyPunchKeyframe(
  bones: AvatarBones,
  side: "left" | "right",
  phase: number,
  targetWorld?: THREE.Vector3 | null,
): void {
  const { upper: upperName, lower: lowerName } = SIDES[side];
  const upper = bones[upperName];
  const lower = bones[lowerName];
  if (!upper || !lower) return;

  const zSign = side === "left" ? -1 : 1;

  // Thrust targets — dynamic aim when target supplied, fixed forward otherwise.
  let thrustUpperX = THRUST_FALLBACK.upperX;
  let thrustUpperZ = THRUST_FALLBACK.upperZ * zSign;
  if (targetWorld) {
    const aim = aimUpperArm(upper, targetWorld);
    thrustUpperX = aim.x;
    thrustUpperZ = aim.z;
  }

  const windupZ = WINDUP.upperZ * zSign;

  let upperX: number;
  let upperZ: number;
  let lowerX: number;

  if (phase < 0.15) {
    const t = smoothstep(phase / 0.15);
    upperX = lerp(0, WINDUP.upperX, t);
    upperZ = lerp(0, windupZ, t);
    lowerX = lerp(0, WINDUP.lowerX, t);
  } else if (phase < 0.5) {
    const t = smoothstep((phase - 0.15) / 0.35);
    upperX = lerp(WINDUP.upperX, thrustUpperX, t);
    upperZ = lerp(windupZ, thrustUpperZ, t);
    lowerX = lerp(WINDUP.lowerX, THRUST_LOWER_X, t);
  } else {
    const t = smoothstep((phase - 0.5) / 0.5);
    upperX = lerp(thrustUpperX, 0, t);
    upperZ = lerp(thrustUpperZ, 0, t);
    lowerX = lerp(THRUST_LOWER_X, 0, t);
  }

  upper.rotation.x = upperX;
  upper.rotation.z = upperZ;
  upper.rotation.y = 0;
  lower.rotation.x = lowerX;
  lower.rotation.y = 0;
  lower.rotation.z = 0;
}
