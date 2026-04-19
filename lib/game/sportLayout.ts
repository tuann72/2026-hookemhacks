import type { PlayerSlot, Sport } from "@/types";

// Where each player stands in a given sport. Index 0 = local, index 1 = remote.
// Avatars read their slot via sport + player index — keeps layout data out of
// the avatar itself and lets Track 2 tweak spacing without touching rigging.

export const PLAYER_SLOTS: Record<Sport, [PlayerSlot, PlayerSlot]> = {
  // Sword duel: combatants face each other across the raised dojo platform.
  // Platform top is y=0.2, so avatars stand slightly elevated.
  swords: [
    { position: [0, 0.2, 0.2], rotationY: Math.PI },
    { position: [0, 0.2, -4.2], rotationY: 0 },
  ],
  // Ping pong: opposite baselines, facing the net.
  tennis: [
    { position: [0, 0, 1.8], rotationY: 0 },
    { position: [0, 0, -7.8], rotationY: Math.PI },
  ],
  // Golf: adjacent tee boxes, same direction.
  golf: [
    { position: [-0.7, 0, 1.8], rotationY: 0 },
    { position: [0.8, 0, 1.8], rotationY: 0 },
  ],
  // Boxing: red corner vs blue corner. Symmetric around the ring center
  // (z=-1.6) with both fighters placed just outside the red center-logo
  // circle (outer radius 1.0 → circle edges at z=-0.6 and z=-2.6). 2.2 m
  // gap → covered by the 1.6×-scaled 1.92 m reach + HIT_RADIUS.
  boxing: [
    { position: [0, 0.3, -0.3], rotationY: Math.PI },
    { position: [0, 0.3, -2.9], rotationY: 0 },
  ],
};
