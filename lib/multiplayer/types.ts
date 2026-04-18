import type { ArmState, HandState } from "@/types";

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
  // Null when no pose was detected this frame.
  arms: ArmLandmarks | null;
  // 21 landmarks per hand when detected, else null.
  leftHand: WireLandmark[] | null;
  rightHand: WireLandmark[] | null;
  // Pre-derived gesture/arm metrics so receivers don't re-compute.
  armStates: { left: ArmState | null; right: ArmState | null };
  handStates: { left: HandState | null; right: HandState | null };
}

export type BroadcastPayload =
  | { event: "player_state"; payload: PlayerState }
  | { event: "attack"; payload: AttackEvent }
  | { event: "hit"; payload: HitEvent }
  | { event: "game_event"; payload: GameEvent }
  | { event: "pose"; payload: PoseSnapshot };
