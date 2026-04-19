"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CatmullRomCurve3,
  DoubleSide,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { Mesh, PointLight } from "three";
import type { Sport } from "@/types";
import { SwordArena } from "./props/SwordArena";
import { TennisCourt } from "./props/TennisCourt";
import { GolfGreen } from "./props/GolfGreen";
import { BoxingRing } from "./props/BoxingRing";
import { PirateShip } from "./props/PirateShip";
import { Cove } from "./props/Cove";

// Tropical-sunset arena — matches the landing-UI aesthetic (volcano, ocean,
// palms, warm sky) instead of the old neon concrete arena. Sport props still
// swap on top so each game zone feels distinct.

interface WorldProps {
  sport: Sport;
}

const COLOR_SAND = "#FFE5B4";
const COLOR_SAND_WARM = "#F5C978";
const COLOR_SUN = "#FF6B4A";
const COLOR_LAVA = "#FF3D1F";
const COLOR_LAVA_CORE = "#FF6B22";
const COLOR_LAVA_GLOW = "#FF8C42";
/** Crater fountain — white / yellow hot core like real eruption photos */
const COLOR_ERUPT_CORE = "#FFFEF5";
const COLOR_ERUPT_HOT = "#FFF0C8";
const COLOR_VOLCANO = "#3A2E4C";
const COLOR_VOLCANO_DEEP = "#261E35";
const COLOR_OCEAN = "#1F4C6B";
const COLOR_OCEAN_LIGHT = "#3A7C9C";
const COLOR_FOAM = "#E6DFD0";
const COLOR_PALM_TRUNK = "#5A3E2A";
const COLOR_FROND = "#2E6E3B";

export function World({ sport }: WorldProps) {
  return (
    <group>
      <ArenaShell />
      <SportZone sport={sport} />
    </group>
  );
}

function ArenaShell() {
  return (
    <group>
      {/* Sand floor — large enough to fill the camera-framed ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={COLOR_SAND} roughness={1.0} />
      </mesh>

      {/* Wet-sand strip near the water (darker warm) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -10]}>
        <planeGeometry args={[60, 4]} />
        <meshStandardMaterial color={COLOR_SAND_WARM} roughness={1.0} />
      </mesh>

      {/* Ocean — wide flat plane behind the beach, gently animated */}
      <Ocean />

      {/* Sky dome — inverted sphere with a vertical gradient painted on the
          inside via vertex color. Simpler than HDRI and matches the landing
          gradient (warm peach at the top through coral, crimson at the
          horizon where it meets the ocean). */}
      <SkyDome />

      {/* Sun disc at the horizon — emissive ball with a bloom-ish halo via
          scale-and-transparent shell */}
      <Sun />

      {/* Main volcano — a truncated cone centered-back with lava glow at the
          crater, per the landing backdrop */}
      <Volcano position={[2, 0, -22]} height={10} baseRadius={7} />

      {/* Left cove — volcano mountain with a rocky inlet that opens toward
          the pirate ship, replacing the plain background mountain */}
      <Cove position={[-9, 0, -18]} />

      {/* Cove off to the right — rocky inlet with its own volcano */}
      <Cove position={[17, 0, -19]} />

      {/* Pirate ship sailing the open water, mid-left — kept clear of both
          volcanoes' silhouettes and parked where the deep ocean is visible */}
      <PirateShip
        position={[-7, 0.35, -12]}
        rotation={[0, Math.PI * 0.22, 0]}
      />

      {/* Palm trees lining the beach on both sides */}
      <PalmCluster side="left" />
      <PalmCluster side="right" />
    </group>
  );
}

function Ocean() {
  const ref = useRef<Mesh>(null);
  const foamA = useRef<Mesh>(null);
  const foamB = useRef<Mesh>(null);
  const foamC = useRef<Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Gentle horizontal drift for subtle water motion
    if (ref.current) {
      ref.current.position.x = Math.sin(t * 0.18) * 0.6;
    }
    // Each foam strip drifts on its own sine so the ocean feels alive
    if (foamA.current) {
      foamA.current.position.x = Math.sin(t * 0.22) * 1.4;
    }
    if (foamB.current) {
      foamB.current.position.x = Math.cos(t * 0.16 + 0.8) * 1.8;
    }
    if (foamC.current) {
      foamC.current.position.x = Math.sin(t * 0.12 + 2.1) * 1.2;
    }
  });
  return (
    <group>
      {/* Deep ocean (far) — raised just above the sand plane so the blue
          actually shows instead of being hidden beneath it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, -18]}>
        <planeGeometry args={[120, 18]} />
        <meshStandardMaterial color={COLOR_OCEAN} roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Shore water (closer, lighter, drifting) */}
      <mesh
        ref={ref}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, -11]}
      >
        <planeGeometry args={[60, 3]} />
        <meshStandardMaterial
          color={COLOR_OCEAN_LIGHT}
          transparent
          opacity={0.75}
          roughness={0.4}
          metalness={0.4}
        />
      </mesh>
      {/* Foam/wave strips at staggered depths, each drifting independently */}
      <mesh
        ref={foamA}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, -13.5]}
      >
        <planeGeometry args={[80, 0.28]} />
        <meshStandardMaterial
          color={COLOR_FOAM}
          transparent
          opacity={0.38}
          roughness={0.5}
        />
      </mesh>
      <mesh
        ref={foamB}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, -16.5]}
      >
        <planeGeometry args={[90, 0.22]} />
        <meshStandardMaterial
          color={COLOR_FOAM}
          transparent
          opacity={0.32}
          roughness={0.5}
        />
      </mesh>
      <mesh
        ref={foamC}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, -20]}
      >
        <planeGeometry args={[100, 0.26]} />
        <meshStandardMaterial
          color={COLOR_FOAM}
          transparent
          opacity={0.28}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

function SkyDome() {
  // Hemisphere behind everything. Single flat color per sphere; we stack two
  // spheres (outer = high sky, inner clipped to lower = ocean band) for a
  // simple gradient feel.
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[80, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#FFB384" side={2} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[79.5, 32, 16, 0, Math.PI * 2, Math.PI / 3, Math.PI / 6]} />
        <meshBasicMaterial color="#FF9764" side={2} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

function Sun() {
  return (
    <group position={[6, 6, -25]}>
      {/* Halo */}
      <mesh>
        <sphereGeometry args={[3.2, 24, 24]} />
        <meshBasicMaterial color={COLOR_SUN} transparent opacity={0.22} toneMapped={false} />
      </mesh>
      {/* Disc */}
      <mesh>
        <sphereGeometry args={[1.8, 24, 24]} />
        <meshBasicMaterial color="#FFD88A" toneMapped={false} />
      </mesh>
    </group>
  );
}

interface VolcanoProps {
  position: [number, number, number];
  height: number;
  baseRadius: number;
  color?: string;
  hasLava?: boolean;
}

/**
 * Parabolic lava arcs ejected from the crater (ballistic streaks), reference:
 * thin glowing trails that fountain up then arc outward / down.
 */
function buildCraterFountainCurves(height: number, topRadius: number): CatmullRomCurve3[] {
  /** Slightly softer gravity = longer, more theatrical arcs */
  const g = 5.25;
  const craterY = height + 0.042;
  const curves: CatmullRomCurve3[] = [];

  const pushArc = (
    n: number,
    seed: number,
    rMin: number,
    rMax: number,
    alphaMinDeg: number,
    alphaMaxDeg: number,
    vpMin: number,
    vpMax: number,
    tMax: number,
    yCutoff: number
  ) => {
    for (let i = 0; i < n; i++) {
      const θ = (i / n) * Math.PI * 2 + seed + i * 0.11;
      const u = ((i * 7919 + seed * 1000) % 997) / 997;
      const rStart = topRadius * (rMin + u * (rMax - rMin));
      const p0 = new Vector3(rStart * Math.cos(θ), craterY, rStart * Math.sin(θ));
      const alphaDeg = alphaMinDeg + (((i * 13) % 100) / 100) * (alphaMaxDeg - alphaMinDeg);
      const alpha = (alphaDeg * Math.PI) / 180;
      const vp = vpMin + ((i * 17) % 10) / 10 * (vpMax - vpMin);
      const vx = vp * Math.sin(alpha) * Math.cos(θ);
      const vy = vp * Math.cos(alpha);
      const vz = vp * Math.sin(alpha) * Math.sin(θ);
      const pts: Vector3[] = [];
      const steps = 24;
      for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * tMax;
        const y = p0.y + vy * t - 0.5 * g * t * t;
        if (y < yCutoff) break;
        pts.push(new Vector3(p0.x + vx * t, y, p0.z + vz * t));
      }
      if (pts.length >= 2) {
        curves.push(new CatmullRomCurve3(pts));
      }
    }
  };

  // Tall arcs — main curtain of fire (higher speeds, longer hang time)
  pushArc(54, 0.15, 0.04, 0.98, 22, 58, 2.55, 4.35, 1.12, height - 1.25);
  // Dense vent spray from the hole itself
  pushArc(38, 1.55, 0.008, 0.26, 12, 42, 1.95, 3.55, 0.68, height + 0.2);
  // Near-vertical geyser jets
  pushArc(14, 4.9, 0.01, 0.07, 6, 20, 3.1, 4.85, 0.48, height + 0.55);
  // Wide ember hooks falling down the shoulders
  pushArc(20, 3.05, 0.28, 0.95, 36, 68, 2.15, 3.65, 1.22, height - 1.55);

  return curves;
}

/** Thin rim-anchored sheets (low profile on the cone) — reads as lava film, not tubes */
function VolcanoLavaDrips({
  height,
  baseRadius,
  topRadius,
}: {
  height: number;
  baseRadius: number;
  topRadius: number;
}) {
  const flatSheets = useMemo(() => {
    const dir = new Vector3();
    const tAzi = new Vector3();
    const tMer = new Vector3();
    const nOut = new Vector3();
    const surf = new Vector3();
    const u = new Vector3();
    const basis = new Matrix4();
    const quat = new Quaternion();
    const drDy = (topRadius - baseRadius) / height;
    const kCount = 8;
    type Sheet = {
      key: string;
      pos: [number, number, number];
      quat: [number, number, number, number];
      len: number;
      width: number;
      thick: number;
    };
    const sheets: Sheet[] = [];
    for (let k = 0; k < kCount; k++) {
      const θ = (k / kCount) * Math.PI * 2 + 0.55;
      const yAnchor = height * (0.89 + (k % 3) * 0.018);
      const r = baseRadius + (topRadius - baseRadius) * (yAnchor / height);
      const bulge = 0.006;
      const surfX = (r + bulge) * Math.cos(θ);
      const surfZ = (r + bulge) * Math.sin(θ);
      dir.set(-drDy * Math.cos(θ), -1, -drDy * Math.sin(θ)).normalize();
      tAzi.set(-Math.sin(θ), 0, Math.cos(θ));
      tMer.set(drDy * Math.cos(θ), 1, drDy * Math.sin(θ)).normalize();
      nOut.crossVectors(tMer, tAzi).normalize();
      surf.set(surfX, yAnchor, surfZ);
      if (nOut.dot(surf) < 0) nOut.negate();
      u.crossVectors(nOut, dir).normalize();
      basis.makeBasis(u, dir, nOut);
      quat.setFromRotationMatrix(basis);
      const len = 1.45 + (k % 5) * 0.28;
      const off = len * 0.46;
      sheets.push({
        key: `s-${k}`,
        pos: [surfX + dir.x * off, yAnchor + dir.y * off, surfZ + dir.z * off],
        quat: [quat.x, quat.y, quat.z, quat.w],
        len,
        width: 0.038 + (k % 3) * 0.01,
        thick: 0.008 + (k % 2) * 0.003,
      });
    }
    return sheets;
  }, [height, baseRadius, topRadius]);

  return (
    <group>
      {flatSheets.map((s) => (
        <mesh key={s.key} position={s.pos} quaternion={s.quat} castShadow>
          <boxGeometry args={[s.width, s.len, s.thick]} />
          <meshStandardMaterial
            color={COLOR_LAVA}
            emissive={COLOR_LAVA_CORE}
            emissiveIntensity={1.55}
            roughness={0.45}
            metalness={0.08}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Volcano({
  position,
  height,
  baseRadius,
  color = COLOR_VOLCANO,
  hasLava = true,
}: VolcanoProps) {
  const lavaRef = useRef<Mesh>(null);
  const innerGlowRef = useRef<Mesh>(null);
  const coronaRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);
  const craterCoreRef = useRef<Mesh>(null);
  const eruptMantleRef = useRef<Mesh>(null);
  const eruptBloomRef = useRef<Mesh>(null);
  const lavaFillLightRef = useRef<PointLight>(null);

  const topRadius = baseRadius * 0.25;
  const fountainCurves = useMemo(
    () => buildCraterFountainCurves(height, topRadius),
    [height, topRadius]
  );
  /** Upper open shell only — hot rock reads as molten near the rim */
  const rimH = Math.min(2.8, height * 0.3);
  const yRimBottom = height - rimH;
  const rRimBottom =
    baseRadius + (topRadius - baseRadius) * (yRimBottom / height);
  const rRimTop = topRadius;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
    const roar = 0.55 + 0.45 * Math.sin(t * 0.9);
    const flicker = pulse * 0.72 + roar * 0.28;

    if (lavaRef.current) {
      const m = lavaRef.current.material as { emissiveIntensity?: number };
      if (m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = 2.05 + flicker * 1.1;
      }
    }
    if (innerGlowRef.current) {
      const m = innerGlowRef.current.material as { emissiveIntensity?: number };
      if (m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = 1.05 + flicker * 1.15;
      }
    }
    if (coronaRef.current) {
      const m = coronaRef.current.material as { opacity?: number };
      if (m.opacity !== undefined) {
        m.opacity = 0.24 + flicker * 0.2;
      }
    }
    if (lightRef.current) {
      lightRef.current.intensity = 4.2 + flicker * 3.5;
    }
    if (lavaFillLightRef.current) {
      lavaFillLightRef.current.intensity = 2.4 + pulse * 2.2;
    }
    if (craterCoreRef.current) {
      const m = craterCoreRef.current.material as { emissiveIntensity?: number };
      if (m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = 5.2 + flicker * 3.2;
      }
    }
    if (eruptMantleRef.current) {
      const m = eruptMantleRef.current.material as { opacity?: number };
      if (m.opacity !== undefined) {
        m.opacity = 0.4 + flicker * 0.32;
      }
    }
    if (eruptBloomRef.current) {
      const m = eruptBloomRef.current.material as { opacity?: number };
      if (m.opacity !== undefined) {
        m.opacity = 0.22 + flicker * 0.16;
      }
    }
  });

  return (
    <group position={position}>
      {/* Truncated cone so the top is a flat crater the lava disc can sit in,
          instead of tapering to a sharp point that hides the glow */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[topRadius, baseRadius, height, 20, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {hasLava && (
        <>
          {/* Inner upper funnel — back faces pick up orange so the cone lip
              reads as glowing from molten rock below the crater opening */}
          <mesh
            ref={innerGlowRef}
            position={[0, yRimBottom + rimH / 2, 0]}
            castShadow={false}
            receiveShadow
          >
            <cylinderGeometry args={[rRimTop * 0.98, rRimBottom * 0.96, rimH, 24, 1, true]} />
            <meshStandardMaterial
              color={COLOR_VOLCANO_DEEP}
              emissive={COLOR_LAVA}
              emissiveIntensity={1.15}
              roughness={0.82}
              metalness={0.1}
              side={DoubleSide}
            />
          </mesh>
          <pointLight
            ref={lightRef}
            position={[0, height + 0.18, 0]}
            color={COLOR_ERUPT_CORE}
            intensity={5.5}
            distance={42}
            decay={2}
          />
          <pointLight
            ref={lavaFillLightRef}
            position={[0, height + 0.06, 0]}
            color={COLOR_LAVA}
            intensity={3.2}
            distance={36}
            decay={2}
          />
          {/* Soft heat above the rim — additive so it reads as lava light */}
          <mesh ref={coronaRef} position={[0, height + 0.2, 0]}>
            <sphereGeometry args={[Math.max(topRadius * 1.55, 0.95), 18, 14]} />
            <meshBasicMaterial
              color={COLOR_LAVA_GLOW}
              transparent
              opacity={0.28}
              depthWrite={false}
              toneMapped={false}
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh ref={lavaRef} position={[0, height + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[topRadius, 20]} />
            <meshStandardMaterial
              color={COLOR_LAVA}
              emissive={COLOR_LAVA}
              emissiveIntensity={2.0}
              toneMapped={false}
            />
          </mesh>
          {/* White-hot core + yellow halo — reads as pressure from the vent */}
          <mesh ref={craterCoreRef} position={[0, height + 0.065, 0]}>
            <sphereGeometry args={[Math.max(0.22, topRadius * 0.34), 18, 18]} />
            <meshStandardMaterial
              color={COLOR_ERUPT_CORE}
              emissive={COLOR_ERUPT_CORE}
              emissiveIntensity={6.0}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={eruptMantleRef} position={[0, height + 0.045, 0]} scale={[1, 0.48, 1]}>
            <sphereGeometry args={[topRadius * 0.88, 16, 16]} />
            <meshBasicMaterial
              color={COLOR_ERUPT_HOT}
              transparent
              opacity={0.45}
              depthWrite={false}
              toneMapped={false}
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh ref={eruptBloomRef} position={[0, height + 0.14, 0]}>
            <sphereGeometry args={[topRadius * 1.48, 12, 12]} />
            <meshBasicMaterial
              color={COLOR_LAVA_GLOW}
              transparent
              opacity={0.26}
              depthWrite={false}
              toneMapped={false}
              blending={AdditiveBlending}
            />
          </mesh>
          {/* Parabolic tube streaks — fountain of glowing arcs from the crater */}
          {fountainCurves.map((curve, fi) => {
            const thin = 0.006 + (fi % 6) * 0.0024;
            const hot = fi % 3 === 0 || fi % 5 === 1;
            return (
              <mesh key={fi} castShadow={false}>
                <tubeGeometry args={[curve, 16, thin, 5, false]} />
                <meshStandardMaterial
                  color={hot ? COLOR_ERUPT_HOT : COLOR_LAVA}
                  emissive={hot ? COLOR_ERUPT_CORE : COLOR_LAVA_CORE}
                  emissiveIntensity={hot ? 3.4 : 2.35}
                  roughness={0.26}
                  metalness={0.18}
                  toneMapped={false}
                />
              </mesh>
            );
          })}
          <VolcanoLavaDrips height={height} baseRadius={baseRadius} topRadius={topRadius} />
        </>
      )}
    </group>
  );
}

function PalmCluster({ side }: { side: "left" | "right" }) {
  const sign = side === "left" ? -1 : 1;
  // Staggered palm positions — lined along the beach, angled slightly so each
  // tree reads as individual even from the player's fixed camera.
  const palms = useMemo(
    () =>
      [
        { x: sign * 9, z: -2, height: 3.2, lean: 0.08 },
        { x: sign * 11, z: -6, height: 3.8, lean: -0.06 },
        { x: sign * 8, z: 2, height: 2.8, lean: 0.12 },
        { x: sign * 12, z: -12, height: 3.5, lean: 0.04 },
      ] as const,
    [sign],
  );
  return (
    <group>
      {palms.map((p, i) => (
        <PalmTree key={i} position={[p.x, 0, p.z]} height={p.height} lean={p.lean * sign} />
      ))}
    </group>
  );
}

function PalmTree({
  position,
  height,
  lean,
}: {
  position: [number, number, number];
  height: number;
  lean: number;
}) {
  const trunkSegments = 4;
  const trunkWidth = 0.14;
  // Match the 1.6× avatar scale so the trees don't look dwarfed next to the
  // enlarged fighters. Tree base stays anchored at `position` (y=0 ground).
  const TREE_SCALE = 1.6;
  return (
    <group position={position} rotation={[0, 0, lean]} scale={TREE_SCALE}>
      {/* Trunk — segmented cylinder sections for a palm-like profile */}
      {Array.from({ length: trunkSegments }).map((_, i) => {
        const y = (height / trunkSegments) * (i + 0.5);
        const r = trunkWidth * (1 - i * 0.08);
        return (
          <mesh key={i} position={[0, y, 0]} castShadow>
            <cylinderGeometry args={[r * 0.9, r, height / trunkSegments, 10]} />
            <meshStandardMaterial color={COLOR_PALM_TRUNK} roughness={0.95} />
          </mesh>
        );
      })}

      {/* Crown — 8 broad flat leaves arcing outward from the top, each
          drooping toward the tip so the whole canopy reads as a proper
          palm fan instead of a spike ring */}
      <group position={[0, height, 0]}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const tilt = -0.55; // droop downward
          const len = 1.4 + (i % 2) * 0.25; // slight length variation
          return (
            <group key={i} rotation={[0, angle, 0]}>
              <mesh
                position={[len / 2, -0.05, 0]}
                rotation={[0, 0, tilt]}
                castShadow
              >
                {/* flat wide leaf — long box, thin, tapered visual via scale */}
                <boxGeometry args={[len, 0.04, 0.32]} />
                <meshStandardMaterial
                  color={COLOR_FROND}
                  roughness={0.8}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Coconut cluster just below the crown */}
      <group position={[0, height - 0.15, 0]}>
        {[
          [0.12, 0, 0.06],
          [-0.1, -0.04, 0.08],
          [0.04, -0.08, -0.12],
        ].map((p, i) => (
          <mesh key={i} position={p as [number, number, number]} castShadow>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color="#3C2418" roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SportZone({ sport }: { sport: Sport }) {
  switch (sport) {
    case "swords":
      return <SwordArena />;
    case "tennis":
      return <TennisCourt />;
    case "golf":
      return <GolfGreen />;
    case "boxing":
      return <BoxingRing />;
  }
}
