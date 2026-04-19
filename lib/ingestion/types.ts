// Named ActionEvent (not GameEvent) to avoid collision with the existing
// GameEvent type in lib/multiplayer/types.ts (which is used for room signaling).
export interface ActionEvent {
  type: string;
  subtype?: string;
  occurredAt: number;    // epoch ms
  matchTimeMs: number;   // ms since match started
  metadata?: Record<string, unknown>;
}
