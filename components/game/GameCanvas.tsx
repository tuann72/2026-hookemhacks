"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Stats } from "@react-three/drei";
import { Suspense } from "react";
import { AvatarCollisionResolver } from "./avatarCollision";
import { FallingBalls } from "./FallingBalls";
import { World } from "./World";
import { Avatar, type AvatarComponent } from "./Avatar";
import { RedBoxer } from "./RedBoxer";
import { BlueBoxer } from "./BlueBoxer";
import { useGameStore } from "@/lib/store/gameStore";
import { useIdentity } from "@/hooks/useIdentity";
import { PLAYER_SLOTS } from "@/lib/game/sportLayout";

interface GameCanvasProps {
  debug?: boolean;
  /**
   * Swap the avatar implementation for non-boxing sports (e.g. a teammate's
   * GLTF/VRM model). Boxing uses RedBoxer/BlueBoxer assigned by host identity
   * and ignores this prop. Defaults to the built-in blocky humanoid.
   */
  AvatarComponent?: AvatarComponent;
}

// R3F scene root. Owns camera, lighting rig, and mounts the World + Avatars.
// Kept purely presentational — all state lives in Zustand.

export function GameCanvas({ debug = false, AvatarComponent = Avatar }: GameCanvasProps) {
  const sport = useGameStore((s) => s.sport);
  const players = useGameStore((s) => s.players);
  const hostId = useGameStore((s) => s.hostId);
  const { playerId: localId } = useIdentity();
  const slots = PLAYER_SLOTS[sport];

  // Host = red boxer, joiner = blue. Fallback while hostId is still loading:
  // treat the local player as the host so avatars render immediately. Worst
  // case is a one-frame color flip once the room lookup resolves.
  const isLocalHost = !hostId || localId === hostId;

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 3.5, 7.5], fov: 42, near: 0.1, far: 100 }}
      style={{ background: "#FF9764" }}
    >
      {/* Warm peach haze — softens the distant ocean/volcano and matches
          the landing UI's sunset sky */}
      <fog attach="fog" args={["#FFB384", 18, 50]} />

      <Suspense fallback={null}>
        <Lights />
        <World sport={sport} />
        {players.map((p, i) => {
          const slot = slots[i];
          if (!slot) return null;
          let BoxerComponent: AvatarComponent = AvatarComponent;
          if (sport === "boxing") {
            const isRed = p.isLocal ? isLocalHost : !isLocalHost;
            BoxerComponent = isRed ? RedBoxer : BlueBoxer;
          }
          // Opponent head world pos — the other slot's origin plus the
          // approximate head height (matches Avatar.tsx rig proportions:
          // HIPS_Y + SPINE_LEN + CHEST_LEN + NECK_LEN + HEAD_LEN/2 ≈ 1.66).
          const opp = slots[1 - i];
          const opponentHeadPos: [number, number, number] | undefined = opp
            ? [opp.position[0], opp.position[1] + 1.66, opp.position[2]]
            : undefined;
          return (
            <BoxerComponent
              key={p.id}
              playerId={p.id}
              position={slot.position}
              rotationY={slot.rotationY}
              opponentHeadPos={opponentHeadPos}
            />
          );
        })}
        {/* Lightweight XY separation — pushes overlapping avatars apart. */}
        <AvatarCollisionResolver />
        <FallingBalls />
        <Environment preset="sunset" />
      </Suspense>

      <OrbitControls
        enablePan={false}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={3}
        maxDistance={12}
        target={[0, 1.0, -2.5]}
      />
      {debug && <Stats />}
    </Canvas>
  );
}

function Lights() {
  return (
    <>
      {/* Warm tropical ambient — cream, lifts the sand into a sunlit beach */}
      <ambientLight intensity={0.6} color="#FFE5B4" />
      {/* Sun — warm directional from upper-right matching the Sun disc in
          World.tsx at [6, 6, -25]. Casts shadows for anchor ground contact. */}
      <directionalLight
        position={[10, 12, -10]}
        intensity={1.6}
        color="#FFD88A"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* Soft sunset fill from the horizon side — coral bounce off the sand */}
      <directionalLight position={[-8, 3, -12]} intensity={0.5} color="#FF6B4A" />
    </>
  );
}
