"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

// Stylized galleon built from primitives: tapered hull, stern castle, two masts
// with square sails, Jolly-Roger flag. Gentle bob on sin() so it reads as
// floating without needing buoyancy physics.

const COLOR_HULL_DARK = "#4A2F1A";
const COLOR_HULL_MID = "#6B3E22";
const COLOR_MAST = "#3A2818";
const COLOR_SAIL = "#F2E8D0";
const COLOR_FLAG = "#1A1410";
const COLOR_SKULL = "#F2E8D0";
const COLOR_TRIM = "#8B5A2B";
const COLOR_METAL = "#2A2A2A";

interface PirateShipProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function PirateShip({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: PirateShipProps) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = position[1] + Math.sin(t * 0.6) * 0.04;
    ref.current.rotation.z = rotation[2] + Math.sin(t * 0.6) * 0.02;
    ref.current.rotation.x = rotation[0] + Math.sin(t * 0.45 + 1.1) * 0.015;
  });
  return (
    <group ref={ref} position={position} rotation={rotation}>
      <Hull />
      <Masts />
      <Sails />
      <Flag />
      <Cannons />
    </group>
  );
}

function Hull() {
  return (
    <group>
      {/* Main hull body */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 0.7, 1.1]} />
        <meshStandardMaterial color={COLOR_HULL_DARK} roughness={0.85} />
      </mesh>
      {/* Upper strip / gunwale */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[4.0, 0.2, 1.0]} />
        <meshStandardMaterial color={COLOR_HULL_MID} roughness={0.8} />
      </mesh>
      {/* Gold trim above gunwale */}
      <mesh position={[0, 0.93, 0]}>
        <boxGeometry args={[4.02, 0.04, 1.02]} />
        <meshStandardMaterial
          color={COLOR_TRIM}
          roughness={0.4}
          metalness={0.4}
        />
      </mesh>
      {/* Deck surface */}
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[3.8, 0.04, 0.85]} />
        <meshStandardMaterial color={COLOR_HULL_MID} roughness={0.9} />
      </mesh>
      {/* Stern castle */}
      <mesh position={[-1.7, 1.3, 0]} castShadow>
        <boxGeometry args={[0.7, 1.0, 0.95]} />
        <meshStandardMaterial color={COLOR_HULL_DARK} roughness={0.85} />
      </mesh>
      {/* Stern castle roof trim */}
      <mesh position={[-1.7, 1.85, 0]}>
        <boxGeometry args={[0.75, 0.08, 1.0]} />
        <meshStandardMaterial
          color={COLOR_TRIM}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
      {/* Bow prow — tapered cone giving the hull a pointed front */}
      <mesh
        position={[2.35, 0.5, 0]}
        rotation={[0, 0, -Math.PI / 2]}
        castShadow
      >
        <coneGeometry args={[0.55, 0.6, 6]} />
        <meshStandardMaterial color={COLOR_HULL_DARK} roughness={0.85} />
      </mesh>
      {/* Bowsprit — angled forward and up from the bow */}
      <mesh
        position={[2.5, 1.05, 0]}
        rotation={[0, 0, -Math.PI / 2 + 0.35]}
        castShadow
      >
        <cylinderGeometry args={[0.05, 0.07, 0.9, 8]} />
        <meshStandardMaterial color={COLOR_MAST} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Masts() {
  return (
    <group>
      {/* Foremast */}
      <mesh position={[1.1, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 2.4, 10]} />
        <meshStandardMaterial color={COLOR_MAST} roughness={0.9} />
      </mesh>
      {/* Mainmast — taller, slightly aft of center */}
      <mesh position={[-0.3, 2.3, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.11, 3.2, 10]} />
        <meshStandardMaterial color={COLOR_MAST} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Sails() {
  return (
    <group>
      {/* Foremast spar */}
      <mesh position={[1.1, 2.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} />
        <meshStandardMaterial color={COLOR_MAST} />
      </mesh>
      {/* Foremast sail — flat face normal to ship's forward axis */}
      <mesh position={[1.1, 1.95, 0]} castShadow>
        <boxGeometry args={[0.04, 1.1, 1.45]} />
        <meshStandardMaterial color={COLOR_SAIL} roughness={0.95} side={2} />
      </mesh>
      {/* Mainmast spar */}
      <mesh position={[-0.3, 3.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2.0, 8]} />
        <meshStandardMaterial color={COLOR_MAST} />
      </mesh>
      {/* Mainmast sail */}
      <mesh position={[-0.3, 2.35, 0]} castShadow>
        <boxGeometry args={[0.04, 1.5, 1.85]} />
        <meshStandardMaterial color={COLOR_SAIL} roughness={0.95} side={2} />
      </mesh>
    </group>
  );
}

function Flag() {
  return (
    <group position={[-0.3, 3.9, 0]}>
      {/* Flag body trailing off mainmast top toward the stern */}
      <mesh position={[-0.3, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.32, 0.015]} />
        <meshStandardMaterial color={COLOR_FLAG} roughness={0.9} side={2} />
      </mesh>
      {/* Skull — two eye spheres at z=0 so they read from both sides */}
      <mesh position={[-0.38, 0.04, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color={COLOR_SKULL} />
      </mesh>
      <mesh position={[-0.22, 0.04, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color={COLOR_SKULL} />
      </mesh>
      {/* Jaw bar */}
      <mesh position={[-0.3, -0.07, 0]}>
        <boxGeometry args={[0.1, 0.04, 0.005]} />
        <meshBasicMaterial color={COLOR_SKULL} />
      </mesh>
    </group>
  );
}

function Cannons() {
  const positions = [-1.0, 0.2, 1.0];
  return (
    <group>
      {positions.map((x, i) => (
        <group key={i}>
          <mesh
            position={[x, 0.65, 0.58]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.07, 0.07, 0.35, 10]} />
            <meshStandardMaterial
              color={COLOR_METAL}
              roughness={0.5}
              metalness={0.6}
            />
          </mesh>
          <mesh
            position={[x, 0.65, -0.58]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.07, 0.07, 0.35, 10]} />
            <meshStandardMaterial
              color={COLOR_METAL}
              roughness={0.5}
              metalness={0.6}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
