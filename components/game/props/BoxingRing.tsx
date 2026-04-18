"use client";

import { useMemo } from "react";

// Classic roped boxing ring: raised square canvas, four corner posts, three
// horizontal ropes, red + blue corner pads, apron skirt around the bottom.
// Scaled so the two PLAYER_SLOTS (red/blue corners at z=±1.6) sit cleanly
// inside the ropes.

const RING_HALF = 3.2; // ring is 6.4×6.4 units across
const PLATFORM_HEIGHT = 0.3;
const POST_HEIGHT = 1.6;
const ROPE_COUNT = 3;
const ROPE_SPACING = POST_HEIGHT / (ROPE_COUNT + 1);
const ROPE_RADIUS = 0.04;
const POST_RADIUS = 0.1;

const CANVAS_COLOR = "#F2EAD3"; // off-white canvas
const APRON_COLOR = "#1E3A8A"; // deep blue skirt
const APRON_TRIM = "#FBBF24"; // gold trim
const RED_CORNER = "#DC2626";
const BLUE_CORNER = "#2563EB";
const NEUTRAL_CORNER = "#FFFFFF";
const ROPE_COLOR = "#F8FAFC";
const POST_COLOR = "#111827";

export function BoxingRing() {
  return (
    <group>
      <ApronSkirt />
      <Platform />
      <CenterLogo />
      <CornerPad position={[-RING_HALF + 0.4, 0, RING_HALF - 0.4]} color={RED_CORNER} />
      <CornerPad position={[RING_HALF - 0.4, 0, RING_HALF - 0.4]} color={NEUTRAL_CORNER} />
      <CornerPad position={[-RING_HALF + 0.4, 0, -RING_HALF + 0.4]} color={NEUTRAL_CORNER} />
      <CornerPad position={[RING_HALF - 0.4, 0, -RING_HALF + 0.4]} color={BLUE_CORNER} />
      <Posts />
      <Ropes />
      <Stool position={[-RING_HALF - 0.9, 0, RING_HALF + 0.2]} color={RED_CORNER} />
      <Stool position={[RING_HALF + 0.9, 0, -RING_HALF - 0.2]} color={BLUE_CORNER} />
    </group>
  );
}

function Platform() {
  // Raised canvas floor — slight off-white with a subtle warm tint.
  return (
    <group position={[0, 0, -1.6]}>
      <mesh position={[0, PLATFORM_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[RING_HALF * 2, PLATFORM_HEIGHT, RING_HALF * 2]} />
        <meshStandardMaterial color={CANVAS_COLOR} roughness={0.9} />
      </mesh>
    </group>
  );
}

function ApronSkirt() {
  // Decorative blue-and-gold apron hanging below the ring on all four sides.
  const apronHeight = PLATFORM_HEIGHT + 0.12;
  const trimHeight = 0.04;
  const sides: Array<{
    position: [number, number, number];
    size: [number, number, number];
  }> = [
    { position: [0, apronHeight / 2, RING_HALF + 0.02 - 1.6], size: [RING_HALF * 2 + 0.1, apronHeight, 0.04] },
    { position: [0, apronHeight / 2, -RING_HALF - 0.02 - 1.6], size: [RING_HALF * 2 + 0.1, apronHeight, 0.04] },
    { position: [RING_HALF + 0.02, apronHeight / 2, -1.6], size: [0.04, apronHeight, RING_HALF * 2 + 0.1] },
    { position: [-RING_HALF - 0.02, apronHeight / 2, -1.6], size: [0.04, apronHeight, RING_HALF * 2 + 0.1] },
  ];
  return (
    <group>
      {sides.map((s, i) => (
        <group key={i}>
          <mesh position={s.position}>
            <boxGeometry args={s.size} />
            <meshStandardMaterial color={APRON_COLOR} roughness={0.85} />
          </mesh>
          {/* Gold trim strip at the top of each apron panel */}
          <mesh
            position={[s.position[0], apronHeight - trimHeight / 2, s.position[2]]}
          >
            <boxGeometry
              args={[
                s.size[0] > s.size[2] ? s.size[0] : s.size[0] + 0.001,
                trimHeight,
                s.size[2] > s.size[0] ? s.size[2] : s.size[2] + 0.001,
              ]}
            />
            <meshStandardMaterial
              color={APRON_TRIM}
              emissive={APRON_TRIM}
              emissiveIntensity={0.2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CenterLogo() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, PLATFORM_HEIGHT + 0.002, -1.6]}
    >
      <ringGeometry args={[0.8, 1.0, 32]} />
      <meshStandardMaterial color={RED_CORNER} roughness={0.7} />
    </mesh>
  );
}

function CornerPad({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  // Turnbuckle pad wrapping the post — a stubby cylinder at the lower two
  // ropes' height, coloured red/blue/white per corner.
  return (
    <group position={[position[0], PLATFORM_HEIGHT, position[2] - 1.6]}>
      <mesh position={[0, POST_HEIGHT * 0.45, 0]} castShadow>
        <cylinderGeometry args={[POST_RADIUS * 2.3, POST_RADIUS * 2.3, POST_HEIGHT * 0.55, 16]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
    </group>
  );
}

function Posts() {
  const corners: [number, number][] = [
    [-RING_HALF + 0.4, RING_HALF - 0.4],
    [RING_HALF - 0.4, RING_HALF - 0.4],
    [-RING_HALF + 0.4, -RING_HALF + 0.4],
    [RING_HALF - 0.4, -RING_HALF + 0.4],
  ];
  return (
    <group position={[0, 0, -1.6]}>
      {corners.map(([x, z], i) => (
        <mesh
          key={i}
          position={[x, PLATFORM_HEIGHT + POST_HEIGHT / 2, z]}
          castShadow
        >
          <cylinderGeometry args={[POST_RADIUS, POST_RADIUS, POST_HEIGHT, 12]} />
          <meshStandardMaterial color={POST_COLOR} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* Post caps (slightly wider discs) */}
      {corners.map(([x, z], i) => (
        <mesh
          key={`cap-${i}`}
          position={[x, PLATFORM_HEIGHT + POST_HEIGHT + 0.03, z]}
        >
          <cylinderGeometry args={[POST_RADIUS * 1.4, POST_RADIUS * 1.4, 0.05, 12]} />
          <meshStandardMaterial color={APRON_TRIM} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Ropes() {
  // Three horizontal ropes on each side of the ring. Each rope is a thin
  // cylinder positioned between two adjacent posts.
  const segments = useMemo(() => {
    const out: Array<{
      position: [number, number, number];
      length: number;
      axis: "x" | "z";
    }> = [];
    const innerHalf = RING_HALF - 0.4; // posts sit inset by 0.4
    const length = innerHalf * 2;
    for (let i = 1; i <= ROPE_COUNT; i++) {
      const y = PLATFORM_HEIGHT + ROPE_SPACING * i;
      // Two ropes along x (front & back sides)
      out.push({ position: [0, y, innerHalf], length, axis: "x" });
      out.push({ position: [0, y, -innerHalf], length, axis: "x" });
      // Two ropes along z (left & right sides)
      out.push({ position: [innerHalf, y, 0], length, axis: "z" });
      out.push({ position: [-innerHalf, y, 0], length, axis: "z" });
    }
    return out;
  }, []);
  return (
    <group position={[0, 0, -1.6]}>
      {segments.map((s, i) => (
        <mesh
          key={i}
          position={s.position}
          rotation={s.axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[ROPE_RADIUS, ROPE_RADIUS, s.length, 8]} />
          <meshStandardMaterial color={ROPE_COLOR} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Stool({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  // Corner stool: small round seat on four thin legs. Painted in the corner's
  // team colour so the red and blue corners read from a distance.
  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.06, 16]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* legs */}
      {[
        [0.16, 0.16],
        [-0.16, 0.16],
        [0.16, -0.16],
        [-0.16, -0.16],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.2, lz]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 6]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
