"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";

// Godzilla-style kaiju looming behind the main volcano. Dark purple silhouette
// matches the back-mountain palette so he reads as scenery; lava-glow eyes and
// mouth tie him to the volcano's emissive accents. Gentle idle bob sells the
// "giant breathing monster" feel without competing with the fighters.

const COLOR_KAIJU = "#2E2440";
const COLOR_KAIJU_DARK = "#1B1528";
const COLOR_SPINE = "#4A3A64";
const COLOR_EYE = "#FFB84A";
const COLOR_MOUTH = "#FF3D1F";

interface GodzillaProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

export function Godzilla({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: GodzillaProps) {
  const rootRef = useRef<Group>(null);
  const eyeLRef = useRef<Mesh>(null);
  const eyeRRef = useRef<Mesh>(null);
  const mouthRef = useRef<Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (rootRef.current) {
      rootRef.current.position.y = position[1] + Math.sin(t * 0.65) * 0.08;
    }
    const flicker = 1 + Math.sin(t * 3.4) * 0.22;
    const setIntensity = (mesh: Mesh | null, base: number) => {
      if (!mesh) return;
      const m = mesh.material as { emissiveIntensity?: number };
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = base * flicker;
    };
    setIntensity(eyeLRef.current, 3.8);
    setIntensity(eyeRRef.current, 3.8);
    setIntensity(mouthRef.current, 1.8);
  });

  const LEG_H = 2.6;
  const TORSO_H = 3.8;
  const TORSO_TOP = LEG_H + TORSO_H;

  return (
    <group ref={rootRef} position={position} rotation={rotation} scale={scale}>
      {/* Legs + feet */}
      {[-0.7, 0.7].map((x, i) => (
        <group key={`leg-${i}`}>
          <mesh position={[x, LEG_H * 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.58, 0.75, LEG_H, 8]} />
            <meshStandardMaterial color={COLOR_KAIJU} roughness={0.95} flatShading />
          </mesh>
          <mesh position={[x, 0.22, 0.35]} castShadow>
            <boxGeometry args={[1.1, 0.44, 1.4]} />
            <meshStandardMaterial color={COLOR_KAIJU_DARK} roughness={0.95} flatShading />
          </mesh>
          {[-0.32, 0, 0.32].map((dx, j) => (
            <mesh
              key={`claw-${i}-${j}`}
              position={[x + dx, 0.18, 1.02]}
              rotation={[0.25, 0, 0]}
              castShadow
            >
              <coneGeometry args={[0.11, 0.34, 6]} />
              <meshStandardMaterial color={COLOR_KAIJU_DARK} roughness={0.95} flatShading />
            </mesh>
          ))}
        </group>
      ))}

      {/* Torso — hunched forward slightly */}
      <group position={[0, LEG_H, 0]} rotation={[-0.1, 0, 0]}>
        <mesh position={[0, TORSO_H * 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.92, 1.3, TORSO_H, 10]} />
          <meshStandardMaterial color={COLOR_KAIJU} roughness={0.95} flatShading />
        </mesh>
        {/* Belly */}
        <mesh position={[0, TORSO_H * 0.42, 0.9]} castShadow>
          <sphereGeometry args={[0.75, 12, 10]} />
          <meshStandardMaterial color={COLOR_KAIJU_DARK} roughness={0.95} flatShading />
        </mesh>
      </group>

      {/* Arms — short T-Rex style, upper arm + forearm as one jointed limb
          per side. Use a group pivoted at the shoulder so the forearm stays
          attached to the upper arm no matter how we angle it. */}
      {[-1, 1].map((s, i) => {
        const shoulderY = LEG_H + TORSO_H * 0.78;
        const upperLen = 1.05;
        const foreLen = 0.75;
        return (
          <group key={`arm-${i}`} position={[s * 1.1, shoulderY, 0.35]}>
            {/* Upper arm: rotate outward-and-down from the shoulder */}
            <group rotation={[0.15, 0, s * 0.75]}>
              <mesh position={[0, -upperLen / 2, 0]} castShadow>
                <cylinderGeometry args={[0.22, 0.32, upperLen, 8]} />
                <meshStandardMaterial color={COLOR_KAIJU} roughness={0.95} flatShading />
              </mesh>
              {/* Elbow joint → forearm group pivots here */}
              <group position={[0, -upperLen, 0]} rotation={[1.1, 0, -s * 0.25]}>
                <mesh position={[0, -foreLen / 2, 0]} castShadow>
                  <cylinderGeometry args={[0.14, 0.22, foreLen, 8]} />
                  <meshStandardMaterial color={COLOR_KAIJU_DARK} roughness={0.95} flatShading />
                </mesh>
                {/* Hand claws at the forearm tip */}
                {[-0.12, 0, 0.12].map((dx, j) => (
                  <mesh
                    key={`hand-${i}-${j}`}
                    position={[dx, -foreLen - 0.08, 0]}
                    rotation={[0, 0, 0]}
                    castShadow
                  >
                    <coneGeometry args={[0.05, 0.22, 6]} />
                    <meshStandardMaterial color={COLOR_KAIJU_DARK} roughness={0.95} flatShading />
                  </mesh>
                ))}
              </group>
            </group>
          </group>
        );
      })}

      {/* Neck + head */}
      <group position={[0, TORSO_TOP - 0.35, 0.35]} rotation={[0.08, 0, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.78, 1.05, 8]} />
          <meshStandardMaterial color={COLOR_KAIJU} roughness={0.95} flatShading />
        </mesh>
        <group position={[0, 1.15, 0.6]}>
          {/* Skull */}
          <mesh castShadow>
            <boxGeometry args={[1.15, 0.95, 1.45]} />
            <meshStandardMaterial color={COLOR_KAIJU} roughness={0.95} flatShading />
          </mesh>
          {/* Snout */}
          <mesh position={[0, -0.24, 0.62]} castShadow>
            <boxGeometry args={[0.98, 0.58, 0.85]} />
            <meshStandardMaterial color={COLOR_KAIJU_DARK} roughness={0.95} flatShading />
          </mesh>
          {/* Glowing mouth slit */}
          <mesh ref={mouthRef} position={[0, -0.03, 1.04]}>
            <boxGeometry args={[0.74, 0.09, 0.05]} />
            <meshStandardMaterial
              color={COLOR_MOUTH}
              emissive={COLOR_MOUTH}
              emissiveIntensity={1.8}
              toneMapped={false}
            />
          </mesh>
          {/* Eyes */}
          <mesh ref={eyeLRef} position={[-0.33, 0.19, 0.72]}>
            <sphereGeometry args={[0.11, 8, 8]} />
            <meshStandardMaterial
              color={COLOR_EYE}
              emissive={COLOR_EYE}
              emissiveIntensity={3.8}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={eyeRRef} position={[0.33, 0.19, 0.72]}>
            <sphereGeometry args={[0.11, 8, 8]} />
            <meshStandardMaterial
              color={COLOR_EYE}
              emissive={COLOR_EYE}
              emissiveIntensity={3.8}
              toneMapped={false}
            />
          </mesh>
          {/* Small horn ears */}
          {[-0.45, 0.45].map((x, i) => (
            <mesh
              key={`horn-${i}`}
              position={[x, 0.55, -0.1]}
              rotation={[-0.35, 0, x > 0 ? -0.3 : 0.3]}
              castShadow
            >
              <coneGeometry args={[0.11, 0.42, 6]} />
              <meshStandardMaterial color={COLOR_KAIJU_DARK} roughness={0.95} flatShading />
            </mesh>
          ))}
        </group>
      </group>

      {/* Tail — 4 tapered segments curving back and down */}
      {[
        { pos: [0, LEG_H + 0.7, -0.95], rot: [0.45, 0, 0], len: 1.7, r0: 0.85, r1: 0.62 },
        { pos: [0, LEG_H + 0.1, -2.2], rot: [0.75, 0, 0], len: 1.55, r0: 0.62, r1: 0.44 },
        { pos: [0, LEG_H - 0.55, -3.35], rot: [1.0, 0, 0], len: 1.45, r0: 0.44, r1: 0.26 },
        { pos: [0, LEG_H - 1.15, -4.3], rot: [1.2, 0, 0], len: 1.25, r0: 0.26, r1: 0.08 },
      ].map((s, i) => (
        <mesh
          key={`tail-${i}`}
          position={s.pos as [number, number, number]}
          rotation={s.rot as [number, number, number]}
          castShadow
        >
          <cylinderGeometry args={[s.r1, s.r0, s.len, 8]} />
          <meshStandardMaterial color={COLOR_KAIJU} roughness={0.95} flatShading />
        </mesh>
      ))}

      {/* Dorsal spines — iconic jagged plates from neck down across tail */}
      {(
        [
          [TORSO_TOP + 0.15, 0.2, 0.55, 0.15],
          [TORSO_TOP - 0.55, -0.02, 0.7, 0.1],
          [TORSO_TOP - 1.35, -0.2, 0.75, 0.05],
          [TORSO_TOP - 2.15, -0.3, 0.68, 0],
          [TORSO_TOP - 2.95, -0.45, 0.58, -0.05],
          [LEG_H + 0.85, -1.4, 0.52, 0.35],
          [LEG_H + 0.25, -2.3, 0.42, 0.55],
          [LEG_H - 0.35, -3.1, 0.32, 0.8],
          [LEG_H - 0.9, -3.9, 0.22, 1.0],
          [LEG_H - 1.3, -4.5, 0.12, 1.15],
        ] as [number, number, number, number][]
      ).map(([y, z, size, lean], i) => (
        <mesh
          key={`spine-${i}`}
          position={[0, y + size * 0.55, z]}
          rotation={[lean, 0, 0]}
          castShadow
        >
          <coneGeometry args={[size * 0.52, size * 1.1, 4]} />
          <meshStandardMaterial color={COLOR_SPINE} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}
