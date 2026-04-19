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
  // Boxing: red corner vs blue corner, facing each other across the canvas.
  // Platform top y=0.3; ring center z=-1.6. Spacing is tightened so a fully
  // extended right arm (upper 0.30m + forearm 0.28m = 0.58m reach) can just
  // touch the opponent's front torso (torso half-depth 0.14m). Avatar
  // centers 0.72m apart: fist Z = -0.58 from shoulder, front edge = 0.14
  // from defender center → contact right at the torso front. Still above
  // AvatarCollisionResolver's 0.70m min separation so they don't shove.
  boxing: [
    { position: [0, 0.3, -1.15], rotationY: Math.PI },
    { position: [0, 0.3, -2.15], rotationY: 0 },
  ],
};
