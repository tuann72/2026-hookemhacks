import type { ArmState, HandState, RigRotations } from "@/types";

export type RoomStatus = "waiting" | "active" | "finished";

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  max_players: number;
  created_at: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  player_id: string;
  joined_at: string;
}

export interface PlayerPresence {
  playerId: string;
  name: string;
  onlineAt: string;
  ready: boolean;
}

export interface PlayerState {
  playerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: "left" | "right";
  action: string;
  health: number;
  timestamp: number;
}

export interface AttackEvent {
  playerId: string;
  attackType: "slash" | "thrust" | "block";
  hitbox: { x: number; y: number; w: number; h: number };
  timestamp: number;
}

export interface HitEvent {
  attackerId: string;
  targetId: string;
  damage: number;
  timestamp: number;
}

export interface GameEvent {
  type: "game_start" | "game_end" | "player_ready";
  payload: Record<string, unknown>;
  timestamp: number;
}

// Normalized (0..1) image-space landmark. Matches MediaPipe's NormalizedLandmark
// but locally-defined so multiplayer types don't depend on the mediapipe package.
export interface WireLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// Pose indices carried in `arms` (MediaPipe landmark numbering):
//   [0]=LEFT_SHOULDER(11) [1]=RIGHT_SHOULDER(12)
//   [2]=LEFT_ELBOW(13)    [3]=RIGHT_ELBOW(14)
//   [4]=LEFT_WRIST(15)    [5]=RIGHT_WRIST(16)
export type ArmLandmarks = [
  WireLandmark,
  WireLandmark,
  WireLandmark,
  WireLandmark,
  WireLandmark,
  WireLandmark,
];

export interface PoseSnapshot {
  playerId: string;
  timestamp: number;
  // Primary payload — fully solved bone rotations ready to apply on the
  // receiver with zero re-solve. When present, receivers should prefer this
  // over re-deriving from armStates.
  rig?: RigRotations;
  // Raw landmarks + derived metrics are optional and kept around so a future
  // client can re-solve locally (e.g. to apply its own smoothing). Null/omitted
  // when the sender only broadcasts the rig.
  arms?: ArmLandmarks | null;
  leftHand?: WireLandmark[] | null;
  rightHand?: WireLandmark[] | null;
  armStates?: { left: ArmState | null; right: ArmState | null };
  handStates?: { left: HandState | null; right: HandState | null };
  /**
   * Sender's live guard flags (hand-near-baseline, per side). Consumed by
   * the receiver's damage helper so a defender's guard reduces incoming
   * punch/ball damage.
   */
  inGuard?: { left: boolean; right: boolean };
}

export type BroadcastPayload =
  | { event: "player_state"; payload: PlayerState }
  | { event: "attack"; payload: AttackEvent }
  | { event: "hit"; payload: HitEvent }
  | { event: "game_event"; payload: GameEvent }
  | { event: "pose"; payload: PoseSnapshot };
