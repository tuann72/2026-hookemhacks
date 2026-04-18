"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Stats } from "@react-three/drei";
import { Suspense } from "react";
import { World } from "./World";
import { Avatar } from "./Avatar";
import { useGameStore } from "@/lib/store/gameStore";
import { PLAYER_SLOTS } from "@/lib/game/sportLayout";

interface GameCanvasProps {
  debug?: boolean;
}

// R3F scene root. Owns camera, lighting rig, and mounts the World + Avatars.
// Kept purely presentational — all state lives in Zustand.

export function GameCanvas({ debug = false }: GameCanvasProps) {
  const sport = useGameStore((s) => s.sport);
  const players = useGameStore((s) => s.players);
  const slots = PLAYER_SLOTS[sport];

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 3.5, 7.5], fov: 42, near: 0.1, far: 100 }}
      style={{ background: "#050810" }}
    >
      <fog attach="fog" args={["#050810", 12, 32]} />

      <Suspense fallback={null}>
        <Lights />
        <World sport={sport} />
        {players.map((p, i) => {
          const slot = slots[i];
          if (!slot) return null;
          return (
            <Avatar
              key={p.id}
              playerId={p.id}
              position={slot.position}
              rotationY={slot.rotationY}
            />
          );
        })}
        <Environment preset="night" />
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
      <ambientLight intensity={0.25} color="#6366f1" />
      <spotLight
        position={[6, 8, 4]}
        intensity={2.2}
        angle={0.6}
        penumbra={0.4}
        color="#fbbf24"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <spotLight
        position={[-6, 8, 4]}
        intensity={1.2}
        angle={0.6}
        penumbra={0.4}
        color="#38bdf8"
      />
      <directionalLight position={[0, 6, -8]} intensity={0.6} color="#a855f7" />
    </>
  );
}
