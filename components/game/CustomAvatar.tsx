"use client";

/**
 * Scaffolding for dropping a teammate-supplied model (GLB/GLTF/VRM) into the
 * same CV-rig pipeline the built-in Avatar uses. Delete/replace this file
 * with their actual model wrapper when it's ready — the contract is:
 *
 *   1. Export a component matching `AvatarComponent` (see Avatar.tsx).
 *   2. Register each humanoid-bone `Group/Object3D` into a `bones.current`
 *      dict keyed by `HumanoidBoneName`.
 *   3. Call `applyRigRotations(bones.current, rig)` inside `useFrame` with
 *      the fresh pose-store rig for this playerId.
 *
 * Then swap the avatar component in GameCanvas:
 *   <GameCanvas AvatarComponent={CustomAvatar} />
 *
 * Punch / block detection runs off the same CV stream. The teammate's logic
 * can subscribe to `useBodyDetection()` (for raw per-frame ArmState:
 * swingSpeed, elbowAngle, forwardAngle, wristZOffset) or `usePoseStore` (for
 * the already-solved bone rotations). Punch = high swingSpeed + extended
 * elbow; block = both arms raised with bent elbows and wrists in front of
 * face — exact thresholds up to the gameplay code.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Object3D } from "three";
import { useGLTF } from "@react-three/drei";
import type { HumanoidBoneName } from "@/types";
import type { AvatarProps } from "./Avatar";
import { usePoseStore } from "@/lib/store/poseStore";
import { applyRigRotations, type AvatarBones } from "@/lib/rigging";

/**
 * Map from MediaPipe/VRM-style humanoid bone names to the names used in the
 * teammate's model. Edit these to match their rig once the file is in.
 * Common exporters use names like `mixamorig:LeftArm`, `J_Bip_L_UpperArm`,
 * etc. — look at the GLTF in a viewer or `console.log(scene)` to see actual
 * bone names.
 */
const BONE_NAME_MAP: Partial<Record<HumanoidBoneName, string>> = {
  // Core
  Hips: "Hips",
  Spine: "Spine",
  Chest: "Chest",
  Neck: "Neck",
  Head: "Head",
  // Arms — these are the minimum the current rig drives (plus Hand for wrist)
  LeftShoulder: "LeftShoulder",
  LeftUpperArm: "LeftUpperArm",
  LeftLowerArm: "LeftLowerArm",
  LeftHand: "LeftHand",
  RightShoulder: "RightShoulder",
  RightUpperArm: "RightUpperArm",
  RightLowerArm: "RightLowerArm",
  RightHand: "RightHand",
};

/**
 * Drop the teammate's model here once they share the file. Place it in
 * `/public/models/` and update the path (Next serves `/public` at `/`).
 */
const MODEL_PATH = "/models/boxer.glb";

export function CustomAvatar({
  playerId,
  position = [0, 0, 0],
  rotationY = 0,
}: AvatarProps) {
  const bones = useRef<AvatarBones>({});

  // useGLTF lazy-loads and caches the model. The first render suspends until
  // the file is fetched; wrap the Canvas tree in <Suspense> (GameCanvas
  // already does this) so we don't crash when the file is missing.
  const { scene } = useGLTF(MODEL_PATH);

  // Clone the scene per-player so two players don't share the same bones
  // (cloning is cheap; drei's SkeletonUtils.clone is the proper way if the
  // model has skinned meshes — import it if you see shared-skeleton bugs).
  const cloned = useMemo(() => scene.clone(true), [scene]);

  // Walk the cloned scene once on mount, pull out the bones we care about,
  // and register them into bones.current under the canonical humanoid names.
  useEffect(() => {
    const dict: AvatarBones = {};
    cloned.traverse((obj: Object3D) => {
      for (const [canonical, modelName] of Object.entries(BONE_NAME_MAP) as Array<
        [HumanoidBoneName, string]
      >) {
        if (obj.name === modelName) dict[canonical] = obj as Group;
      }
    });
    bones.current = dict;
    // Debug: `console.log("custom avatar bones:", Object.keys(dict));`
  }, [cloned]);

  useFrame(() => {
    const rig = usePoseStore.getState().players[playerId]?.rig;
    if (rig?.pose && Object.keys(rig.pose).length > 0) {
      applyRigRotations(bones.current, rig);
    }
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

// Preload so the model fetch starts as early as possible — only meaningful
// once the file actually exists; silent no-op otherwise.
// useGLTF.preload(MODEL_PATH);
