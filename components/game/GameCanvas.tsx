"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls, Stats } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { AvatarCollisionResolver } from "./avatarCollision";
import { FallingBalls } from "./FallingBalls";
import { World } from "./World";
import { Avatar, AVATAR_SCALE, type AvatarComponent } from "./Avatar";
import { useGameStore } from "@/lib/store/gameStore";
import { useCameraStore } from "@/lib/store/cameraStore";
import { useViewSettingsStore } from "@/lib/store/viewSettingsStore";
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
  const slots = PLAYER_SLOTS[sport];

  // First-person-ish POV: spawn camera just behind P1's head, pulled back
  // along the P2→P1 axis so the local avatar's silhouette reads at the
  // edges of view (not jammed right against the forehead). Target = P2's
  // head. Memoed so CameraController doesn't trigger a reset every render.
  const selfSlot = slots[0];
  const oppSlot = slots[1];
  const CAMERA_PULLBACK = 2.2; // meters behind P1's head along P1↔P2 axis
  const CAMERA_LIFT = 0.35; // meters up from the head center
  const selfHead = useMemo<[number, number, number]>(() => {
    const dx = selfSlot.position[0] - oppSlot.position[0];
    const dz = selfSlot.position[2] - oppSlot.position[2];
    const dist = Math.hypot(dx, dz) || 1;
    return [
      selfSlot.position[0] + (dx / dist) * CAMERA_PULLBACK,
      selfSlot.position[1] + 1.74 * AVATAR_SCALE + CAMERA_LIFT,
      selfSlot.position[2] + (dz / dist) * CAMERA_PULLBACK,
    ];
  }, [selfSlot, oppSlot]);
  const oppHead = useMemo<[number, number, number]>(
    () => [
      oppSlot.position[0],
      oppSlot.position[1] + 1.74 * AVATAR_SCALE,
      oppSlot.position[2],
    ],
    [oppSlot],
  );
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const hideLocalBody = useViewSettingsStore((s) => s.hideLocalBody);

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: selfHead, fov: 42, near: 0.1, far: 100 }}
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
          // Opponent aim point — head sphere center in world space.
          //   HIPS_Y + SPINE_LEN + CHEST_LEN + NECK_LEN + (HEAD_LEN/2 − 0.02)
          //   = 1.0 + 0.2 + 0.25 + 0.1 + 0.09 ≈ 1.74
          // Scaled by AVATAR_SCALE since the whole rig is scaled at the root.
          const opp = slots[1 - i];
          const opponentHeadPos: [number, number, number] | undefined = opp
            ? [opp.position[0], opp.position[1] + 1.74 * AVATAR_SCALE, opp.position[2]]
            : undefined;
          return (
            <AvatarComponent
              key={p.id}
              playerId={p.id}
              position={slot.position}
              rotationY={slot.rotationY}
              opponentHeadPos={opponentHeadPos}
              hideBody={p.isLocal && hideLocalBody}
            />
          );
        })}
        {/* Lightweight XY separation — pushes overlapping avatars apart. */}
        <AvatarCollisionResolver />
        <FallingBalls />
        <Environment preset="sunset" />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={0.5}
        maxDistance={12}
        target={oppHead}
      />
      <CameraController
        selfHead={selfHead}
        oppHead={oppHead}
        controlsRef={controlsRef}
      />
      {debug && (
        <>
          {/* Floor grid (XZ plane) — 20×20 units, 1-unit cells. Center axis
              red for visibility when checking world coords. */}
          <gridHelper args={[20, 20, "#ef4444", "#334155"]} position={[0, 0.001, 0]} />
          {/* Vertical XY grid between the slots — the plane punches cross
              through. Cyan so it reads distinct from the floor grid. */}
          <gridHelper
            args={[10, 10, "#22d3ee", "#334155"]}
            position={[0, 2, -1.6]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          {/* Origin axes: X=red, Y=green, Z=blue, 2 units long. */}
          <axesHelper args={[2]} />
          <AxisLabels />
          <Stats />
        </>
      )}
    </Canvas>
  );
}

const AXIS_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 14,
  fontWeight: 700,
  padding: "2px 6px",
  borderRadius: 3,
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
  transform: "translate(-50%, -50%)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

function AxisLabels() {
  // HTML labels anchored to each axis tip + unit ticks. Colors match
  // axesHelper (X=red, Y=green, Z=blue). Rendered via drei's <Html> so they
  // auto-scale with camera distance and stay legible.
  const tickEls: React.ReactNode[] = [];
  for (let i = 1; i <= 2; i++) {
    tickEls.push(
      <Html key={`x${i}`} position={[i, 0.02, 0]} center>
        <div style={{ ...AXIS_LABEL_STYLE, color: "#fecaca", fontSize: 10 }}>
          {i}
        </div>
      </Html>,
    );
    tickEls.push(
      <Html key={`y${i}`} position={[0, i, 0]} center>
        <div style={{ ...AXIS_LABEL_STYLE, color: "#bbf7d0", fontSize: 10 }}>
          {i}
        </div>
      </Html>,
    );
    tickEls.push(
      <Html key={`z${i}`} position={[0, 0.02, i]} center>
        <div style={{ ...AXIS_LABEL_STYLE, color: "#bae6fd", fontSize: 10 }}>
          {i}
        </div>
      </Html>,
    );
  }
  return (
    <>
      <Html position={[2.3, 0.02, 0]} center>
        <div style={{ ...AXIS_LABEL_STYLE, color: "#ef4444" }}>X</div>
      </Html>
      <Html position={[0, 2.3, 0]} center>
        <div style={{ ...AXIS_LABEL_STYLE, color: "#22c55e" }}>Y</div>
      </Html>
      <Html position={[0, 0.02, 2.3]} center>
        <div style={{ ...AXIS_LABEL_STYLE, color: "#3b82f6" }}>Z</div>
      </Html>
      {tickEls}
    </>
  );
}

function CameraController({
  selfHead,
  oppHead,
  controlsRef,
}: {
  selfHead: [number, number, number];
  oppHead: [number, number, number];
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const resetTick = useCameraStore((s) => s.resetTick);
  useEffect(() => {
    camera.position.set(selfHead[0], selfHead[1], selfHead[2]);
    const ctrl = controlsRef.current;
    if (ctrl) {
      ctrl.target.set(oppHead[0], oppHead[1], oppHead[2]);
      ctrl.update();
    }
  }, [resetTick, camera, selfHead, oppHead, controlsRef]);
  return null;
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
