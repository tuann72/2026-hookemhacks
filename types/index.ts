// Shared types across the 4 tracks. Lock this contract before writing impl code.
// Ref: HOOKEMHACKS_CONTEXT.md — Shared Types section.

/**
 * Normalized MediaPipe landmark. MediaPipe returns 33 keypoints per frame,
 * each with x/y in normalized image coords [0,1] and z as depth (camera-relative).
 */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** A single frame of pose data at a timestamp. */
export interface PoseFrame {
  timestampMs: number;
  landmarks: PoseLandmark[]; // length 33 for MediaPipe Pose
}

/** Rolling window of pose frames — the unit we embed and search. */
export interface PoseSequence {
  sessionId: string;
  startMs: number;
  endMs: number;
  frames: PoseFrame[];
}

/**
 * Humanoid bone names — matches VRM Humanoid spec and Kalidokit.Pose.solve()
 * output keys, so Kalidokit rotations can be applied directly by name.
 */
export type HumanoidBoneName =
  // Core / spine chain
  | "Hips"
  | "Spine"
  | "Chest"
  | "Neck"
  | "Head"
  // Left arm
  | "LeftShoulder"
  | "LeftUpperArm"
  | "LeftLowerArm"
  | "LeftHand"
  // Left fingers (VRM humanoid optional bones; Kalidokit.Hand.solve outputs these names)
  | "LeftThumbProximal"
  | "LeftThumbIntermediate"
  | "LeftThumbDistal"
  | "LeftIndexProximal"
  | "LeftIndexIntermediate"
  | "LeftIndexDistal"
  | "LeftMiddleProximal"
  | "LeftMiddleIntermediate"
  | "LeftMiddleDistal"
  | "LeftRingProximal"
  | "LeftRingIntermediate"
  | "LeftRingDistal"
  | "LeftLittleProximal"
  | "LeftLittleIntermediate"
  | "LeftLittleDistal"
  // Right arm
  | "RightShoulder"
  | "RightUpperArm"
  | "RightLowerArm"
  | "RightHand"
  // Right fingers
  | "RightThumbProximal"
  | "RightThumbIntermediate"
  | "RightThumbDistal"
  | "RightIndexProximal"
  | "RightIndexIntermediate"
  | "RightIndexDistal"
  | "RightMiddleProximal"
  | "RightMiddleIntermediate"
  | "RightMiddleDistal"
  | "RightRingProximal"
  | "RightRingIntermediate"
  | "RightRingDistal"
  | "RightLittleProximal"
  | "RightLittleIntermediate"
  | "RightLittleDistal"
  // Legs
  | "LeftUpperLeg"
  | "LeftLowerLeg"
  | "LeftFoot"
  | "RightUpperLeg"
  | "RightLowerLeg"
  | "RightFoot";

export interface BoneRotation {
  x: number;
  y: number;
  z: number;
}

/** Kalidokit solver output — bone rotations to apply to the avatar rig. */
export interface RigRotations {
  pose?: Partial<Record<HumanoidBoneName, BoneRotation>>;
  face?: Record<string, unknown>;
  leftHand?: Record<string, unknown>;
  rightHand?: Record<string, unknown>;
}

export type Sport = "swords" | "tennis" | "golf" | "boxing";

export type GamePhase = "idle" | "countdown" | "playing" | "paused" | "ended";

/** Local player is always "self". Remote slot(s) are room-scoped opaque ids. */
export type PlayerId = string;
export const SELF_PLAYER_ID: PlayerId = "self";
export const REMOTE_PLAYER_ID: PlayerId = "remote";

export interface Player {
  id: PlayerId;
  displayName: string;
  tint: string; // primary avatar color (hex)
  score: number;
  isLocal: boolean;
  isConnected: boolean;
}

/** A spawn/stance point for a player within a sport scene. */
export interface PlayerSlot {
  position: [number, number, number];
  rotationY: number; // radians, applied to avatar root
}

/** Room metadata — used by Track 3 for presence / lobby screens. */
export interface Room {
  id: string;
  players: Player[];
  status: "waiting" | "active" | "finished";
}

/** Top-level snapshot of the game state — serializable for persistence / replay. */
export interface GameState {
  room: Room;
  localPlayerId: PlayerId;
  score: number;
  caloriesBurned: number;
}

export type GestureLabel = "open" | "fist" | "point" | "peace" | "thumbsUp" | "unknown";

export interface ArmState {
  elbowAngle: number;
  swingSpeed: number;
  raisedHeight: number;
  /**
   * Radians — forward/back arm swing in the sagittal plane. 0 = arm hangs
   * straight down, +π/2 = arm pointed forward (toward camera), -π/2 = arm
   * pointed backward. Computed from shoulder/wrist Y+Z deltas.
   */
  forwardAngle: number;
  /**
   * Radians — arm angle from straight-down in the image plane (XY only).
   * 0 = arm hanging, π/2 = arm horizontal to the side, π = arm raised up.
   * Does NOT fire when the arm is forward (toward camera), so it separates
   * "side raise" from "forward reach" cleanly. Use this instead of
   * raisedHeight for driving the upper arm's sideways tilt.
   */
  sideRaiseAngle: number;
  /**
   * Signed depth: wrist.z − shoulder.z from MediaPipe pose world landmarks
   * (meters). Negative = wrist closer to camera than shoulder (forearm
   * reaches forward); positive = wrist behind shoulder (forearm reaches
   * back, e.g. hands-behind-head). Used to pick the elbow bend direction
   * since the 2D/3D elbow angle alone can't tell a forward bend from a
   * backward one.
   */
  wristZOffset: number;
  isExtended: boolean;
}

export interface HandState {
  gesture: GestureLabel;
  pinchDistance: number;
}

/**
 * Torso orientation derived from the four shoulder/hip pose landmarks.
 * Drives Spine + Chest rotations on the avatar.
 */
export interface TorsoState {
  /** Radians — pitch. + = leaning forward (chest toward camera), 0 = upright. */
  leanForward: number;
  /** Radians — roll. + = leaning to the subject's own right side. */
  leanSide: number;
  /** Radians — yaw. + = shoulders rotated to subject's right relative to hips. */
  twist: number;
}

export interface BodyTrackingState {
  leftArm: ArmState | null;
  rightArm: ArmState | null;
  torso: TorsoState | null;
  leftHand: HandState | null;
  rightHand: HandState | null;
  /**
   * Raw 21-landmark MediaPipe hand output. Exposed so consumers can compute
   * per-finger joint angles for avatar rigging. `null` when the hand isn't
   * detected. Structured as {x, y, z} per landmark (z is wrist-relative and
   * more reliable than body pseudo-z).
   */
  leftHandLandmarks: PoseLandmark[] | null;
  rightHandLandmarks: PoseLandmark[] | null;
  /**
   * Raw 33-landmark MediaPipe pose output for the detected person. `null`
   * when no pose is detected on this frame. Exposed so consumers can draw
   * custom skeleton overlays (e.g. arms-only) without re-running the model.
   */
  poseLandmarks: PoseLandmark[] | null;
  fps: number;
  isReady: boolean;
}

export interface Move {
  swingSpeed: number;
  raisedHeight: number;
  timestamp: number;
}

export interface SessionRecord {
  id: string;
  userId: string | null;
  roomId: string | null;
  sport: Sport;
  startedAt: string;
  endedAt: string | null;
  finalScore: number | null;
}

export type GameEventType = "hit" | "miss" | "score" | "strike" | "foul" | "custom";

export interface GameEvent {
  sessionId: string;
  timestampMs: number;
  eventType: GameEventType;
  metadata?: Record<string, unknown>;
}

export interface SearchQuery {
  raw: string;
  intent?: "motion" | "event" | "comparative";
  filters?: Record<string, unknown>;
  embedding?: number[];
}

export interface SearchResult {
  sessionId: string;
  startMs: number;
  endMs: number;
  videoClipUrl: string;
  score: number;
}
