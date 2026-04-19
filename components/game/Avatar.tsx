"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Group } from "three";
import type { HumanoidBoneName, PlayerId } from "@/types";
import { usePoseStore } from "@/lib/store/poseStore";
import { useGameStore } from "@/lib/store/gameStore";
import { applyRigRotations, type AvatarBones } from "@/lib/rigging";
import { registerAvatarBody, registerAvatarBones } from "./avatarCollision";
import { applyPunchKeyframe } from "@/lib/rigging/punchAnim";
import { EXTEND_MS, RECOVER_MS } from "@/lib/combat/damage";
import { useArmSimStore } from "@/lib/store/armSimStore";

// Rigged placeholder avatar — structured so Track 1's Kalidokit + VRM swap is
// a drop-in. Every joint is its own <group> positioned at the joint's pivot;
// the visible mesh is a child offset away from the joint. Rotations applied to
// a joint group rotate the whole downstream chain (upper arm → forearm → hand).
//
// Bone names match the VRM Humanoid spec / Kalidokit.Pose.solve() output keys,
// so wiring real pose data is `applyRigRotations(bones, rig)` with zero name
// remapping. See HOOKEMHACKS_CONTEXT.md — "Pose Data Flow".

/**
 * Shared avatar component contract. Any drop-in avatar (GLTF model, VRM,
 * custom mesh) should implement `AvatarComponent` so `GameCanvas` can swap
 * it without further changes. See components/game/CustomAvatar.tsx for a
 * GLTF skeleton-mapping example.
 */
export interface AvatarProps {
  playerId: PlayerId;
  position?: [number, number, number];
  rotationY?: number;
  /**
   * Force the body tint, bypassing the store's `player.tint`. Used by
   * character-variant wrappers (e.g. RedBoxer, BlueBoxer) so the same rig
   * renders with a committed color regardless of which slot the player
   * occupies.
   */
  tintOverride?: string;
  /**
   * World-space point the punching arm should aim at during the thrust
   * phase — typically the opponent's head position. Omitted → punch thrusts
   * straight forward in avatar-local space.
   */
  opponentHeadPos?: [number, number, number];
}

export type AvatarComponent = (props: AvatarProps) => React.ReactElement | null;

// --- Rig proportions (meters) ---------------------------------------------
const HIPS_Y = 1.0;
const SPINE_LEN = 0.2;
const CHEST_LEN = 0.25;
const NECK_LEN = 0.1;
const HEAD_LEN = 0.22;

const SHOULDER_OFFSET_X = 0.36;
// Compromise length: long enough to cross the ~2.2 m slot gap (both fighters
// positioned outside the red center circle), still reads as a boxer-like
// arm once the whole avatar is AVATAR_SCALE'd up. Ratio ≈ 0.68 of body.
const UPPER_ARM_LEN = 0.51;
const LOWER_ARM_LEN = 0.51;
const HAND_LEN = 0.12;

// Uniform root scale applied to the whole avatar. Keeps arm/torso/head
// proportions locked so the longer arms don't look cartoonishly skinny — the
// body grows with them. Slot spacing in sportLayout.ts + opponent-head
// height in GameCanvas.tsx are updated in tandem.
export const AVATAR_SCALE = 1.6;

const HIP_OFFSET_X = 0.12;
const UPPER_LEG_LEN = 0.45;
const LOWER_LEG_LEN = 0.42;
const FOOT_D = 0.22;

// --- Limb / part visual widths --------------------------------------------
const LIMB_W = 0.14;
const TORSO_W = 0.5;
const TORSO_D = 0.28;
const HEAD_R = 0.17;

const SKIN_COLOR = "#fde68a";

const GLOVE_COLOR = "#dc2626";
const GLOVE_R = 0.12;

export function Avatar({
  playerId,
  position = [0, 0, 0],
  rotationY = 0,
  tintOverride,
  opponentHeadPos,
}: AvatarProps) {
  const root = useRef<Group>(null);
  const bones = useRef<AvatarBones>({});
  const opponentHeadVec = useRef(new THREE.Vector3());

  // Ref callback factory: each bone group registers itself under its humanoid
  // bone name so applyRigRotations can look it up O(1). Cached per-name so
  // React doesn't recreate refs every render.
  const bind = useMemo(() => {
    const cache: Partial<Record<HumanoidBoneName, (el: Group | null) => void>> =
      {};
    return (name: HumanoidBoneName) => {
      let cb = cache[name];
      if (!cb) {
        cb = (el: Group | null) => {
          if (el) bones.current[name] = el;
          else delete bones.current[name];
        };
        cache[name] = cb;
      }
      return cb;
    };
  }, []);

  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  const tint = tintOverride ?? player?.tint ?? "#f97316";

  // Register root in the collision resolver. The separator in
  // AvatarCollisionResolver reads these groups each frame and nudges their
  // positions apart when two avatars overlap horizontally.
  const rootRefCb = useCallback(
    (el: Group | null) => {
      root.current = el;
      registerAvatarBody(playerId, el);
    },
    [playerId],
  );

  // Expose this avatar's bone-refs map so cross-avatar systems (e.g. the
  // punch collision detector) can read world positions without prop-drilling.
  useEffect(() => {
    registerAvatarBones(playerId, bones.current);
    return () => registerAvatarBones(playerId, null);
  }, [playerId]);

  const phaseOffset = useRef(hashPlayerIdToPhase(playerId)).current;

  // Smoothed phase for the guard/punch arm-sim override. 0 = guard, 1 =
  // punch. Tweens each frame toward the store's current target so the
  // transition matches the 2D SVG preview in ArmRigSim.
  const armSimPhase = useRef(0);

  useFrame((state, delta) => {
    if (!root.current) return;
    const t = state.clock.elapsedTime + phaseOffset;
    const pose = usePoseStore.getState().players[playerId];

    // --- Live CV path ---
    // When Track 1's pipeline sets a rig on this player's pose slot,
    // apply it directly. Empty pose object → treat as no detection and
    // fall through to idle (keeps avatar alive when the user steps away
    // from the webcam).
    const rigPose = pose?.rig?.pose;
    if (rigPose && Object.keys(rigPose).length > 0) {
      applyRigRotations(bones.current, pose!.rig!);
    } else {
      // --- Idle fallback ---
      // Drives the same bones so the avatar is never static in dev. When CV
      // takes over, these rotations are simply overwritten by applyRigRotations.
      const b = bones.current;
      const sway = Math.sin(t * 0.8);
      const breath = Math.sin(t * 2.2) * 0.02;

      if (b.Spine) b.Spine.rotation.y = sway * 0.08;
      if (b.Chest) b.Chest.rotation.x = breath;
      if (b.Head) b.Head.rotation.y = Math.sin(t * 0.5) * 0.15;

      // Minecraft Steve idle — arms hang straight down with an opposing
      // forward/back swing so it reads like a gentle march. CV will
      // overwrite these via applyRigRotations.
      const armSwing = Math.sin(t * 1.6) * 0.35;
      if (b.LeftUpperArm) {
        b.LeftUpperArm.rotation.z = 0;
        b.LeftUpperArm.rotation.x = armSwing;
      }
      if (b.RightUpperArm) {
        b.RightUpperArm.rotation.z = 0;
        b.RightUpperArm.rotation.x = -armSwing;
      }
      if (b.LeftLowerArm) b.LeftLowerArm.rotation.x = 0;
      if (b.RightLowerArm) b.RightLowerArm.rotation.x = 0;
    }

    // Right-arm guard/punch sim — drives RightUpperArm + RightLowerArm from
    // the shared armSimStore. Runs AFTER CV/idle so the override wins on
    // the right arm, BEFORE the punch keyframe so real CV-driven punches
    // can still momentarily take over.
    //
    // Chosen so:
    //   punch  → arm fully parallel to the xz plane: shoulder, elbow, and
    //            fist all at the same y. Pure forward extension in −z.
    //   guard  → θ_interior = 60°, fist at the SAME y as in punch, with
    //            the elbow dropped below shoulder height. Swinging to punch
    //            therefore lifts the elbow up into line with the shoulder
    //            while the fist just slides forward in −z.
    //
    // Solving U·sin(α_u) + F·sin(α_u + 120°) = 0 for U ≈ F gives α_u = −60°
    // for guard (upper arm 60° below horizontal) with the forearm folded
    // +120° back up to +60° above horizontal — fist lands at shoulder y.
    // Punch is α_u = 0 (upper arm horizontal), forearm aligned.
    //
    // Rotation convention: bone rest pose hangs along −y, so upper-arm
    // rotation.x = −π/2 − α_u, forearm rotation.x = θ_interior − π.
    const armSim = useArmSimStore.getState().rightArm[playerId];
    if (armSim) {
      const target = armSim === "punch" ? 1 : 0;
      // Framerate-independent exp smoothing, rate=10/s — ~63% of the gap
      // closed each 100ms. Matches the SVG preview's feel.
      armSimPhase.current +=
        (target - armSimPhase.current) * (1 - Math.exp(-10 * delta));
      const phase = armSimPhase.current;

      // Guard: α_u = −60°, forearm folded 120°
      const UPPER_GUARD = -Math.PI / 6;        // −30° rotation.x  (α_u = −60°)
      const LOWER_GUARD = -(2 * Math.PI) / 3;  // −120° — forearm folded back up
      // Punch: α_u = 0 (horizontal), forearm aligned (straight arm)
      const UPPER_PUNCH = -Math.PI / 2;        // −90° rotation.x (α_u = 0)
      const LOWER_PUNCH = 0;

      const b = bones.current;
      if (b.RightUpperArm) {
        b.RightUpperArm.rotation.x =
          UPPER_GUARD + (UPPER_PUNCH - UPPER_GUARD) * phase;
        b.RightUpperArm.rotation.y = 0;
        b.RightUpperArm.rotation.z = 0;
      }
      if (b.RightLowerArm) {
        b.RightLowerArm.rotation.x =
          LOWER_GUARD + (LOWER_PUNCH - LOWER_GUARD) * phase;
        b.RightLowerArm.rotation.y = 0;
        b.RightLowerArm.rotation.z = 0;
      }
    }

    // Punch animation override — runs AFTER the CV rig (or idle fallback) so
    // the keyframe wins on the two punching-arm bones. Direct assignment
    // inside applyPunchKeyframe bypasses applyRigRotations' 0.35 lerp, so the
    // extension pose doesn't get dragged back toward the CV guard each frame.
    //
    // State machine:
    //   releasedAt === null → extend from bent to fully straight over
    //   EXTEND_MS, then HOLD at extension=1.
    //   releasedAt !== null → recover from current extension back to 0 over
    //   RECOVER_MS, then clear so CV resumes cleanly.
    const punch = pose?.punchAnim;
    if (punch) {
      const now = performance.now();
      let extension: number;
      let clearAfter = false;
      if (punch.releasedAt === null) {
        extension = Math.min(1, (now - punch.startedAt) / EXTEND_MS);
      } else {
        const t = (now - punch.releasedAt) / RECOVER_MS;
        if (t >= 1) {
          // Final frame — apply extension=0 so the stretch scale snaps back
          // to 1 cleanly before we drop control, then clear.
          extension = 0;
          clearAfter = true;
        } else {
          extension = Math.max(0, 1 - t);
        }
      }

      let target: THREE.Vector3 | null = null;
      if (opponentHeadPos) {
        opponentHeadVec.current.set(
          opponentHeadPos[0],
          opponentHeadPos[1],
          opponentHeadPos[2],
        );
        target = opponentHeadVec.current;
      }
      applyPunchKeyframe(bones.current, punch.side, extension, target);
      if (clearAfter) usePoseStore.getState().clearPunchAnim(playerId);
    }
  });

  return (
    <group
      ref={rootRefCb}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={AVATAR_SCALE}
    >
      {/* Root transform → Hips pivot */}
      <group ref={bind("Hips")} position={[0, HIPS_Y, 0]}>
        {/* Pelvis visual (centered on hips) */}
        <mesh castShadow>
          <boxGeometry args={[TORSO_W * 0.9, 0.2, TORSO_D]} />
          <meshStandardMaterial color={tint} roughness={0.55} />
        </mesh>

        {/* Spine chain: Hips → Spine → Chest → Neck → Head */}
        <group ref={bind("Spine")} position={[0, 0.1, 0]}>
          <mesh position={[0, SPINE_LEN / 2, 0]} castShadow>
            <boxGeometry args={[TORSO_W * 0.82, SPINE_LEN, TORSO_D * 0.9]} />
            <meshStandardMaterial color={tint} roughness={0.55} />
          </mesh>

          <group ref={bind("Chest")} position={[0, SPINE_LEN, 0]}>
            <mesh position={[0, CHEST_LEN / 2, 0]} castShadow>
              <boxGeometry args={[TORSO_W, CHEST_LEN, TORSO_D]} />
              <meshStandardMaterial color={tint} roughness={0.5} />
            </mesh>

            {/* Neck + head */}
            <group ref={bind("Neck")} position={[0, CHEST_LEN, 0]}>
              <mesh position={[0, NECK_LEN / 2, 0]} castShadow>
                <cylinderGeometry args={[0.07, 0.08, NECK_LEN, 12]} />
                <meshStandardMaterial color={tint} roughness={0.5} />
              </mesh>

              <group ref={bind("Head")} position={[0, NECK_LEN, 0]}>
                <mesh position={[0, HEAD_LEN / 2 - 0.02, 0]} castShadow>
                  <sphereGeometry args={[HEAD_R, 20, 20]} />
                  <meshStandardMaterial
                    color={tint}
                    roughness={0.4}
                    metalness={0.1}
                  />
                </mesh>
                {/* small forward nub so head yaw is visible during rigging debug */}
                <mesh position={[0, HEAD_R * 0.5, HEAD_R * 0.85]}>
                  <boxGeometry args={[0.05, 0.04, 0.04]} />
                  <meshStandardMaterial color="#0f172a" />
                </mesh>
              </group>
            </group>

            {/* --- Arms ------------------------------------------------- */}
            {/* LEFT arm chain. Shoulder is separate from UpperArm so
                clavicle motion can be driven if the solver provides it. */}
            <group
              ref={bind("LeftShoulder")}
              position={[-SHOULDER_OFFSET_X, CHEST_LEN * 0.85, 0]}
            >
              <group ref={bind("LeftUpperArm")}>
                <mesh position={[0, -UPPER_ARM_LEN / 2, 0]} castShadow>
                  <boxGeometry args={[LIMB_W, UPPER_ARM_LEN, LIMB_W]} />
                  <meshStandardMaterial color={tint} roughness={0.5} />
                </mesh>
                <group
                  ref={bind("LeftLowerArm")}
                  position={[0, -UPPER_ARM_LEN, 0]}
                >
                  <mesh position={[0, -LOWER_ARM_LEN / 2, 0]} castShadow>
                    <boxGeometry
                      args={[LIMB_W * 0.85, LOWER_ARM_LEN, LIMB_W * 0.85]}
                    />
                    <meshStandardMaterial color={tint} roughness={0.5} />
                  </mesh>
                  <mesh position={[0, -LOWER_ARM_LEN, 0]} castShadow>
                    <sphereGeometry args={[GLOVE_R, 20, 20]} />
                    <meshStandardMaterial color={GLOVE_COLOR} roughness={0.45} />
                  </mesh>
                </group>
              </group>
            </group>

            {/* RIGHT arm — mirrored */}
            <group
              ref={bind("RightShoulder")}
              position={[SHOULDER_OFFSET_X, CHEST_LEN * 0.85, 0]}
            >
              <group ref={bind("RightUpperArm")}>
                <mesh position={[0, -UPPER_ARM_LEN / 2, 0]} castShadow>
                  <boxGeometry args={[LIMB_W, UPPER_ARM_LEN, LIMB_W]} />
                  <meshStandardMaterial color={tint} roughness={0.5} />
                </mesh>
                <group
                  ref={bind("RightLowerArm")}
                  position={[0, -UPPER_ARM_LEN, 0]}
                >
                  <mesh position={[0, -LOWER_ARM_LEN / 2, 0]} castShadow>
                    <boxGeometry
                      args={[LIMB_W * 0.85, LOWER_ARM_LEN, LIMB_W * 0.85]}
                    />
                    <meshStandardMaterial color={tint} roughness={0.5} />
                  </mesh>
                  <mesh position={[0, -LOWER_ARM_LEN, 0]} castShadow>
                    <sphereGeometry args={[GLOVE_R, 20, 20]} />
                    <meshStandardMaterial color={GLOVE_COLOR} roughness={0.45} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* --- Legs (siblings of Spine, children of Hips) -------------- */}
        <group ref={bind("LeftUpperLeg")} position={[-HIP_OFFSET_X, 0, 0]}>
          <mesh position={[0, -UPPER_LEG_LEN / 2, 0]} castShadow>
            <boxGeometry args={[LIMB_W * 1.2, UPPER_LEG_LEN, LIMB_W * 1.2]} />
            <meshStandardMaterial color="#1f2937" roughness={0.6} />
          </mesh>
          <group ref={bind("LeftLowerLeg")} position={[0, -UPPER_LEG_LEN, 0]}>
            <mesh position={[0, -LOWER_LEG_LEN / 2, 0]} castShadow>
              <boxGeometry args={[LIMB_W * 1.0, LOWER_LEG_LEN, LIMB_W * 1.0]} />
              <meshStandardMaterial color="#1f2937" roughness={0.6} />
            </mesh>
            <group ref={bind("LeftFoot")} position={[0, -LOWER_LEG_LEN, 0]}>
              <mesh position={[0, -0.03, FOOT_D * 0.25]} castShadow>
                <boxGeometry args={[LIMB_W * 1.05, 0.06, FOOT_D]} />
                <meshStandardMaterial color="#0f172a" roughness={0.7} />
              </mesh>
            </group>
          </group>
        </group>

        <group ref={bind("RightUpperLeg")} position={[HIP_OFFSET_X, 0, 0]}>
          <mesh position={[0, -UPPER_LEG_LEN / 2, 0]} castShadow>
            <boxGeometry args={[LIMB_W * 1.2, UPPER_LEG_LEN, LIMB_W * 1.2]} />
            <meshStandardMaterial color="#1f2937" roughness={0.6} />
          </mesh>
          <group ref={bind("RightLowerLeg")} position={[0, -UPPER_LEG_LEN, 0]}>
            <mesh position={[0, -LOWER_LEG_LEN / 2, 0]} castShadow>
              <boxGeometry args={[LIMB_W * 1.0, LOWER_LEG_LEN, LIMB_W * 1.0]} />
              <meshStandardMaterial color="#1f2937" roughness={0.6} />
            </mesh>
            <group ref={bind("RightFoot")} position={[0, -LOWER_LEG_LEN, 0]}>
              <mesh position={[0, -0.03, FOOT_D * 0.25]} castShadow>
                <boxGeometry args={[LIMB_W * 1.05, 0.06, FOOT_D]} />
                <meshStandardMaterial color="#0f172a" roughness={0.7} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* nameplate — stays at a fixed world-space height regardless of rig */}
      <NamePlate playerId={playerId} tint={tint} />
    </group>
  );
}

function NamePlate({ playerId, tint }: { playerId: PlayerId; tint: string }) {
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  if (!player) return null;
  return (
    <mesh position={[0, 2.35, 0]}>
      <planeGeometry args={[0.9, 0.22]} />
      <meshBasicMaterial
        color={player.isConnected ? tint : "#334155"}
        transparent
        opacity={player.isConnected ? 0.85 : 0.4}
        toneMapped={false}
      />
    </mesh>
  );
}

function hashPlayerIdToPhase(id: PlayerId): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000) * Math.PI * 2;
}
