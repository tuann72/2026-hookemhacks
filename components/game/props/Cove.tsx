"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

// Rocky cove with two cliff formations, a small sand crescent, a shallow water
// pool, and a cluster of mountain silhouettes behind — one of which is an
// active volcano with a pulsing lava crater (same pattern as the world's main
// volcano). Positioned via the `position` prop; inlet opens toward +Z in the
// cove's local frame, so callers can drop it anywhere and it'll face the
// viewer if +Z world is the camera direction.

const COLOR_ROCK = "#3A2E4C";
const COLOR_ROCK_DARK = "#261E35";
const COLOR_SAND = "#FFE5B4";
const COLOR_WATER = "#3A7C9C";
const COLOR_MOUNTAIN_NEAR = "#3A2E4C";
const COLOR_MOUNTAIN_FAR = "#2A2138";
const COLOR_LAVA = "#FF3D1F";

interface CoveProps {
  position?: [number, number, number];
}

export function Cove({ position = [0, 0, 0] }: CoveProps) {
  return (
    <group position={position}>
      <Cliffs />
      <BeachCrescent />
      <CovePool />
      <BackMountains />
    </group>
  );
}

type RockSpec = {
  x: number;
  y: number;
  z: number;
  size: number;
  rot: number;
  variant: "cone" | "icos";
};

function Cliffs() {
  const rocks = useMemo<RockSpec[]>(
    () => [
      // Left cliff cluster
      { x: -3.5, y: 0.6, z: 0.5, size: 1.3, rot: 0.2, variant: "cone" },
      { x: -4.2, y: 1.0, z: -0.4, size: 1.8, rot: -0.3, variant: "icos" },
      { x: -2.8, y: 0.4, z: 1.2, size: 0.9, rot: 0.5, variant: "icos" },
      { x: -3.8, y: 0.3, z: -1.4, size: 1.1, rot: 0.1, variant: "cone" },
      { x: -5.0, y: 0.5, z: 0.1, size: 1.4, rot: -0.1, variant: "icos" },
      // Right cliff cluster
      { x: 3.5, y: 0.6, z: 0.5, size: 1.2, rot: -0.15, variant: "cone" },
      { x: 4.2, y: 0.9, z: -0.3, size: 1.6, rot: 0.25, variant: "icos" },
      { x: 2.8, y: 0.45, z: 1.4, size: 1.0, rot: -0.4, variant: "icos" },
      { x: 3.8, y: 0.3, z: -1.6, size: 1.0, rot: 0.2, variant: "cone" },
      { x: 5.0, y: 0.5, z: 0.2, size: 1.3, rot: 0.3, variant: "icos" },
    ],
    [],
  );
  return (
    <group>
      {rocks.map((r, i) => (
        <Rock key={i} {...r} />
      ))}
    </group>
  );
}

function Rock({ x, y, z, size, rot, variant }: RockSpec) {
  const color = variant === "cone" ? COLOR_ROCK : COLOR_ROCK_DARK;
  return (
    <group
      position={[x, y, z]}
      rotation={[rot * 0.5, rot, rot * 0.3]}
    >
      {variant === "cone" ? (
        <mesh castShadow>
          <coneGeometry args={[size, size * 1.8, 6]} />
          <meshStandardMaterial color={color} roughness={0.95} flatShading />
        </mesh>
      ) : (
        <mesh castShadow>
          <icosahedronGeometry args={[size, 0]} />
          <meshStandardMaterial color={color} roughness={0.95} flatShading />
        </mesh>
      )}
    </group>
  );
}

function BeachCrescent() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.02, 0.8]}
      scale={[2.6, 1.4, 1]}
    >
      <circleGeometry args={[1, 32]} />
      <meshStandardMaterial color={COLOR_SAND} roughness={1.0} />
    </mesh>
  );
}

function CovePool() {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const m = ref.current.material as { opacity?: number };
    if (m.opacity !== undefined) {
      m.opacity = 0.72 + Math.sin(state.clock.elapsedTime * 0.8) * 0.06;
    }
  });
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.04, 1.8]}
    >
      <planeGeometry args={[5.5, 2.8]} />
      <meshStandardMaterial
        color={COLOR_WATER}
        transparent
        opacity={0.75}
        roughness={0.4}
        metalness={0.3}
      />
    </mesh>
  );
}

function BackMountains() {
  return (
    <group>
      {/* Near-left mountain */}
      <Mountain
        position={[-4.5, 0, -4]}
        height={5.5}
        baseRadius={3.5}
        color={COLOR_MOUNTAIN_NEAR}
      />
      {/* Center volcano — the star of the cove's skyline */}
      <VolcanoMountain position={[0, 0, -5.5]} height={7.5} baseRadius={4.5} />
      {/* Near-right mountain */}
      <Mountain
        position={[4.5, 0, -4]}
        height={4.8}
        baseRadius={3.0}
        color={COLOR_MOUNTAIN_FAR}
      />
      {/* Deep background mountain for horizon depth */}
      <Mountain
        position={[-7, 0, -7]}
        height={5.0}
        baseRadius={3.2}
        color={COLOR_MOUNTAIN_FAR}
      />
    </group>
  );
}

function Mountain({
  position,
  height,
  baseRadius,
  color,
}: {
  position: [number, number, number];
  height: number;
  baseRadius: number;
  color: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <coneGeometry args={[baseRadius, height, 12, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.95} flatShading />
      </mesh>
    </group>
  );
}

function VolcanoMountain({
  position,
  height,
  baseRadius,
}: {
  position: [number, number, number];
  height: number;
  baseRadius: number;
}) {
  const lavaRef = useRef<Mesh>(null);
  useFrame((state) => {
    if (!lavaRef.current) return;
    const t = state.clock.elapsedTime;
    const m = lavaRef.current.material as { emissiveIntensity?: number };
    if (m.emissiveIntensity !== undefined) {
      m.emissiveIntensity = 1.4 + Math.sin(t * 2.0) * 0.3;
    }
  });
  const topRadius = baseRadius * 0.28;
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <coneGeometry args={[baseRadius, height, 16, 1, true]} />
        <meshStandardMaterial
          color={COLOR_MOUNTAIN_NEAR}
          roughness={0.95}
          flatShading
        />
      </mesh>
      <mesh
        ref={lavaRef}
        position={[0, height + 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[topRadius, 18]} />
        <meshStandardMaterial
          color={COLOR_LAVA}
          emissive={COLOR_LAVA}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
