"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { getAvatarBody } from "./avatarCollision";
import { useBallsStore, type FallingBall } from "@/lib/store/ballsStore";
import { useGameStore } from "@/lib/store/gameStore";

// Snappier-than-real gravity so the drop feels game-y, not sluggish.
const GRAVITY = -14;
const BALL_RADIUS = 0.18;
// Approximate head-crown height above the avatar root. Matches Avatar.tsx:
// HIPS_Y(1.0) + SPINE(0.2) + CHEST(0.25) + NECK(0.1) + HEAD(0.22) + HEAD_R.
const HEAD_TOP_OFFSET = 1.95;

function Ball({ ball }: { ball: FallingBall }) {
  const ref = useRef<Mesh>(null);
  const vy = useRef(0);
  const landed = useRef(false);

  // Spawn above the target's current position. Captured once on mount — if
  // the target moves horizontally mid-fall the ball still tracks its air
  // column, which is the visually expected behavior for a dropped object.
  useEffect(() => {
    const target = getAvatarBody(ball.targetPlayerId);
    const mesh = ref.current;
    if (!target || !mesh) return;
    mesh.position.set(
      target.position.x,
      target.position.y + ball.startY,
      target.position.z,
    );
  }, [ball.targetPlayerId, ball.startY]);

  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh || landed.current) return;
    // Cap dt so a tab-switch-induced hitch doesn't launch the ball through
    // the head on its first post-resume frame.
    const step = Math.min(dt, 0.05);
    vy.current += GRAVITY * step;
    mesh.position.y += vy.current * step;

    const target = getAvatarBody(ball.targetPlayerId);
    if (target) {
      const headTop = target.position.y + HEAD_TOP_OFFSET;
      const dx = mesh.position.x - target.position.x;
      const dz = mesh.position.z - target.position.z;
      const xzDist = Math.hypot(dx, dz);
      // Hit = ball reached head height and is still within a loose XZ radius.
      if (mesh.position.y <= headTop && xzDist < BALL_RADIUS + 0.35) {
        landed.current = true;
        useGameStore.getState().damagePlayer(ball.targetPlayerId, ball.damage);
        useBallsStore.getState().remove(ball.id);
        return;
      }
    }
    // Safety net: if the ball misses and keeps falling, clean up.
    if (mesh.position.y < -5) useBallsStore.getState().remove(ball.id);
  });

  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[BALL_RADIUS, 20, 20]} />
      <meshStandardMaterial color="#f43f5e" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

/** Scene-level container — renders one Ball per entry in the balls store. */
export function FallingBalls() {
  const balls = useBallsStore((s) => s.balls);
  return (
    <>
      {balls.map((b) => (
        <Ball key={b.id} ball={b} />
      ))}
    </>
  );
}
