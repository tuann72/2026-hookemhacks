"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { HumanoidBoneName, PlayerId } from "@/types";
import { usePoseStore } from "@/lib/store/poseStore";
import { useGameStore } from "@/lib/store/gameStore";
import { applyRigRotations, type AvatarBones } from "@/lib/rigging";

// Rigged placeholder avatar — structured so Track 1's Kalidokit + VRM swap is
// a drop-in. Every joint is its own <group> positioned at the joint's pivot;
// the visible mesh is a child offset away from the joint. Rotations applied to
// a joint group rotate the whole downstream chain (upper arm → forearm → hand).
//
// Bone names match the VRM Humanoid spec / Kalidokit.Pose.solve() output keys,
// so wiring real pose data is `applyRigRotations(bones, rig)` with zero name
// remapping. See HOOKEMHACKS_CONTEXT.md — "Pose Data Flow".

interface AvatarProps {
  playerId: PlayerId;
  position?: [number, number, number];
  rotationY?: number;
}

// --- Rig proportions (meters) ---------------------------------------------
const HIPS_Y = 1.0;
const SPINE_LEN = 0.2;
const CHEST_LEN = 0.25;
const NECK_LEN = 0.1;
const HEAD_LEN = 0.22;

const SHOULDER_OFFSET_X = 0.36;
const UPPER_ARM_LEN = 0.3;
const LOWER_ARM_LEN = 0.28;
const HAND_LEN = 0.12;

const HIP_OFFSET_X = 0.12;
const UPPER_LEG_LEN = 0.45;
const LOWER_LEG_LEN = 0.42;
const FOOT_D = 0.22;

// --- Limb / part visual widths --------------------------------------------
const LIMB_W = 0.14;
const TORSO_W = 0.5;
const TORSO_D = 0.28;
const HEAD_R = 0.17;

// --- Finger dimensions ---------------------------------------------------
// Each finger is a 3-bone chain: Proximal → Intermediate → Distal. Lengths
// roughly match hand-anatomy proportions at this avatar scale.
const FINGER_W = 0.022;
const THUMB_W = 0.028;
const FINGER_SEGMENTS: [number, number, number] = [0.04, 0.028, 0.022];
const THUMB_SEGMENTS: [number, number, number] = [0.032, 0.024, 0.02];
const LITTLE_SEGMENTS: [number, number, number] = [0.032, 0.022, 0.018];
const INDEX_SEGMENTS: [number, number, number] = [0.038, 0.027, 0.022];
const MIDDLE_SEGMENTS: [number, number, number] = [0.044, 0.032, 0.024];
const RING_SEGMENTS: [number, number, number] = [0.04, 0.028, 0.022];
const SKIN_COLOR = "#fde68a";

export function Avatar({
  playerId,
  position = [0, 0, 0],
  rotationY = 0,
}: AvatarProps) {
  const root = useRef<Group>(null);
  const bones = useRef<AvatarBones>({});

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
  const tint = player?.tint ?? "#f97316";

  const phaseOffset = useRef(hashPlayerIdToPhase(playerId)).current;

  useFrame((state) => {
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
      return;
    }

    // --- Idle fallback ---
    // Drives the same bones so the avatar is never static in dev. When CV
    // takes over, these rotations are simply overwritten by applyRigRotations.
    const b = bones.current;
    const sway = Math.sin(t * 0.8);
    const breath = Math.sin(t * 2.2) * 0.02;

    if (b.Spine) b.Spine.rotation.y = sway * 0.08;
    if (b.Chest) b.Chest.rotation.x = breath;
    if (b.Head) b.Head.rotation.y = Math.sin(t * 0.5) * 0.15;

    // Relaxed arm-down idle with a gentle breathing sway. z-rotation near 0
    // keeps arms hanging; a small positive value tilts them slightly out so
    // they clear the torso visually.
    // Minecraft Steve idle — arms hang straight down by the sides with an
    // opposing forward/back swing so it reads like a gentle march. The two
    // arms mirror (opposite phase) which is the natural human gait.
    // CV will overwrite these via applyRigRotations.
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
  });

  return (
    <group ref={root} position={position} rotation={[0, rotationY, 0]}>
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
                  <group
                    ref={bind("LeftHand")}
                    position={[0, -LOWER_ARM_LEN, 0]}
                  >
                    {/* palm */}
                    <mesh position={[0, -HAND_LEN / 2, 0]} castShadow>
                      <boxGeometry args={[LIMB_W, HAND_LEN, LIMB_W * 0.6]} />
                      <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
                    </mesh>
                    {/* 4 fingers along the bottom edge of the palm */}
                    <Finger
                      bind={bind}
                      names={["LeftIndexProximal", "LeftIndexIntermediate", "LeftIndexDistal"]}
                      position={[-0.048, -HAND_LEN, 0]}
                      segments={INDEX_SEGMENTS}
                    />
                    <Finger
                      bind={bind}
                      names={["LeftMiddleProximal", "LeftMiddleIntermediate", "LeftMiddleDistal"]}
                      position={[-0.016, -HAND_LEN, 0]}
                      segments={MIDDLE_SEGMENTS}
                    />
                    <Finger
                      bind={bind}
                      names={["LeftRingProximal", "LeftRingIntermediate", "LeftRingDistal"]}
                      position={[0.016, -HAND_LEN, 0]}
                      segments={RING_SEGMENTS}
                    />
                    <Finger
                      bind={bind}
                      names={["LeftLittleProximal", "LeftLittleIntermediate", "LeftLittleDistal"]}
                      position={[0.048, -HAND_LEN, 0]}
                      segments={LITTLE_SEGMENTS}
                      thickness={FINGER_W * 0.85}
                    />
                    {/* thumb — inside edge of palm (+X for left hand = toward
                        body center when arm hangs), angled down-and-out so it
                        reads as a thumb from any angle */}
                    <Finger
                      bind={bind}
                      names={["LeftThumbProximal", "LeftThumbIntermediate", "LeftThumbDistal"]}
                      position={[0.06, -HAND_LEN * 0.35, 0.015]}
                      rotation={[0.2, 0, 1.0]}
                      segments={THUMB_SEGMENTS}
                      thickness={THUMB_W}
                    />
                  </group>
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
                  <group
                    ref={bind("RightHand")}
                    position={[0, -LOWER_ARM_LEN, 0]}
                  >
                    <mesh position={[0, -HAND_LEN / 2, 0]} castShadow>
                      <boxGeometry args={[LIMB_W, HAND_LEN, LIMB_W * 0.6]} />
                      <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
                    </mesh>
                    <Finger
                      bind={bind}
                      names={["RightIndexProximal", "RightIndexIntermediate", "RightIndexDistal"]}
                      position={[0.048, -HAND_LEN, 0]}
                      segments={INDEX_SEGMENTS}
                    />
                    <Finger
                      bind={bind}
                      names={["RightMiddleProximal", "RightMiddleIntermediate", "RightMiddleDistal"]}
                      position={[0.016, -HAND_LEN, 0]}
                      segments={MIDDLE_SEGMENTS}
                    />
                    <Finger
                      bind={bind}
                      names={["RightRingProximal", "RightRingIntermediate", "RightRingDistal"]}
                      position={[-0.016, -HAND_LEN, 0]}
                      segments={RING_SEGMENTS}
                    />
                    <Finger
                      bind={bind}
                      names={["RightLittleProximal", "RightLittleIntermediate", "RightLittleDistal"]}
                      position={[-0.048, -HAND_LEN, 0]}
                      segments={LITTLE_SEGMENTS}
                      thickness={FINGER_W * 0.85}
                    />
                    {/* right thumb — mirrored (-X side is inner edge) with
                        opposite z sign so the thumb points toward body */}
                    <Finger
                      bind={bind}
                      names={["RightThumbProximal", "RightThumbIntermediate", "RightThumbDistal"]}
                      position={[-0.06, -HAND_LEN * 0.35, 0.015]}
                      rotation={[0.2, 0, -1.0]}
                      segments={THUMB_SEGMENTS}
                      thickness={THUMB_W}
                    />
                  </group>
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
      <NamePlate playerId={playerId} />
    </group>
  );
}

/**
 * Three-bone finger chain (Proximal → Intermediate → Distal). Each bone's
 * group is registered by its VRM humanoid name so Kalidokit's hand solver
 * can drive it by name with no remapping.
 */
function Finger({
  bind,
  names,
  segments,
  position,
  rotation = [0, 0, 0],
  thickness = FINGER_W,
  color = SKIN_COLOR,
}: {
  bind: (name: HumanoidBoneName) => (el: Group | null) => void;
  names: [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName];
  segments: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  thickness?: number;
  color?: string;
}) {
  const [proxName, intName, distName] = names;
  const [proxLen, intLen, distLen] = segments;

  return (
    <group ref={bind(proxName)} position={position} rotation={rotation}>
      <mesh position={[0, -proxLen / 2, 0]} castShadow>
        <boxGeometry args={[thickness, proxLen, thickness]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <group ref={bind(intName)} position={[0, -proxLen, 0]}>
        <mesh position={[0, -intLen / 2, 0]} castShadow>
          <boxGeometry args={[thickness * 0.92, intLen, thickness * 0.92]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <group ref={bind(distName)} position={[0, -intLen, 0]}>
          <mesh position={[0, -distLen / 2, 0]} castShadow>
            <boxGeometry args={[thickness * 0.85, distLen, thickness * 0.85]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function NamePlate({ playerId }: { playerId: PlayerId }) {
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  if (!player) return null;
  return (
    <mesh position={[0, 2.35, 0]}>
      <planeGeometry args={[0.9, 0.22]} />
      <meshBasicMaterial
        color={player.isConnected ? player.tint : "#334155"}
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
