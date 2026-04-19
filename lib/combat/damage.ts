// ─── Tunable combat values ────────────────────────────────────────────────────
// All numerical damage & mitigation knobs live here. Tweak freely; every
// consumer (game store, punch collision, ball drop, arm-sim) imports from this
// file so there's one place to adjust balance.
//
// Pure constants only — no store imports — so it sits at the bottom of the
// dependency graph and can be read during gameStore module init without a
// circular-import crash. Logic helpers (applyDamage, isTargetInGuard) live in
// lib/combat/index.ts.

// ─── Health ──────────────────────────────────────────────────────────────────

/** Starting and max HP for every player. */
export const MAX_HP = 100;

// ─── Raw damage amounts ──────────────────────────────────────────────────────

/** Damage applied on a counted punch hit, before guard mitigation. */
export const PUNCH_DAMAGE_BASE = 10;

/** Damage applied when a falling ball lands on a player, before guard mitigation. */
export const BALL_DAMAGE_BASE = 15;

// ─── Mitigation ──────────────────────────────────────────────────────────────

/** Multiplier applied to damage when the target is in guard (0..1). 0.5 = 50% mitigation. */
export const GUARD_MULTIPLIER = 0.5;

// ─── Punch timing & collision ────────────────────────────────────────────────

/** Arm-extend duration in ms (0 → fully straight). */
export const EXTEND_MS = 140;
/** Arm-recover duration in ms (straight → bent). */
export const RECOVER_MS = 180;
/** Fraction extended before a punch can register a hit. */
export const HIT_EXTENSION_THRESHOLD = 0.7;
/** Meters — max fist-to-head distance that counts as a landed punch. */
export const HIT_RADIUS = 0.35;
