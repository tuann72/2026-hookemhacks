"use client";

import { useEffect, useRef, useState } from "react";
import { useBodyDetection } from "@/hooks/useBodyDetection";
import { useCalibrationSignalStore } from "@/lib/store/calibrationSignalStore";
import { usePunchCalibrationStore } from "@/lib/store/punchCalibrationStore";
import { sampleHand } from "@/lib/detection/punch";
import type { PoseLandmark } from "@/types";

const GUARD_LEADIN_MS = 2000;
const GUARD_DONE_MS = 900;
const MAX_GUARD_RETRIES = 3;
const RETRY_DELAY_MS = 900;

type Phase =
  | "connecting"
  | "guard-leadin"
  | "guard-hold"
  | "guard-done"
  | "waiting-peer"
  | "done";

type GameLoadingOverlayProps = {
  /** Peer sync complete — from GamePage (peerBroadcastSeen or fallback). */
  ready: boolean;
  /** Whether a peer is visible in presence; affects connecting-phase copy. */
  hasPeerPresence: boolean;
  /** Peer has broadcast guard_ready — their baseline is captured. */
  peerGuardReady: boolean;
  /** Fires exactly once when our local baseline capture lands — parent
   *  broadcasts a guard_ready event in response. */
  onSelfGuardReady?: () => void;
  /** Fires exactly once when the overlay transitions out of guard-done into
   *  done — the signal that combat is about to begin. */
  onDone?: () => void;
};

/**
 * Full-screen takeover shown at game-page load.
 *   connecting   → waits for Supabase peer sync (from parent's `ready`)
 *   guard-leadin → "RAISE YOUR HANDS" (2s)
 *   guard-hold   → real punch baseline capture (3-2-1 countdown)
 *   guard-done   → "GUARD LOCKED" flash (~0.9s)
 *   done         → component renders null; game visible.
 *
 * Must be mounted inside a <BodyDetector> so useBodyDetection() is available.
 */
export function GameLoadingOverlay({
  ready,
  hasPeerPresence,
  peerGuardReady,
  onSelfGuardReady,
  onDone,
}: GameLoadingOverlayProps) {
  const { leftHandLandmarks, rightHandLandmarks } = useBodyDetection();
  const baseline = usePunchCalibrationStore((s) => s.baseline);
  const guardCountdown = usePunchCalibrationStore((s) => s.countdown);
  const calibrateMsg = usePunchCalibrationStore((s) => s.calibrateMsg);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [attemptId, setAttemptId] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  // Ref-synced callback/prop values so the guard-done timer effect doesn't
  // re-schedule every time the parent re-creates `onDone` inline, which would
  // extend the 900ms flash past its intended duration.
  const onDoneRef = useRef(onDone);
  const onSelfGuardReadyRef = useRef(onSelfGuardReady);
  const peerGuardReadyRef = useRef(peerGuardReady);
  const hasPeerPresenceRef = useRef(hasPeerPresence);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => { onSelfGuardReadyRef.current = onSelfGuardReady; }, [onSelfGuardReady]);
  useEffect(() => { peerGuardReadyRef.current = peerGuardReady; }, [peerGuardReady]);
  useEffect(() => { hasPeerPresenceRef.current = hasPeerPresence; }, [hasPeerPresence]);

  // Guard against firing onSelfGuardReady more than once per mount — the
  // baseline-success effect below re-fires on every dep change.
  const selfGuardReadyFiredRef = useRef(false);

  // Rematch trigger: re-enter the calibration flow when the external
  // calibrationSignalStore tick bumps. Skips the initial tick value so the
  // first mount goes through the normal "connecting → guard-leadin" path;
  // only later bumps (rematch / requestRecalibrate) re-arm the overlay.
  const recalTick = useCalibrationSignalStore((s) => s.requestTick);
  const lastHandledRecalTickRef = useRef(recalTick);
  useEffect(() => {
    if (recalTick === lastHandledRecalTickRef.current) return;
    lastHandledRecalTickRef.current = recalTick;
    selfGuardReadyFiredRef.current = false;
    setRetryCount(0);
    setAttemptId((n) => n + 1);
    setPhase("guard-leadin");
    // Wipe the prior-round baseline before the new countdown starts. Without
    // this, the guard-hold baseline-check effect fires immediately on entry
    // (baseline still truthy from round N) and flashes straight to
    // guard-done, skipping the 3-2-1.
    usePunchCalibrationStore.getState().setBaseline(null);
  }, [recalTick]);

  // Landmarks are kept in a ref so capture() doesn't close over stale state.
  const latestHandsRef = useRef<{
    left: PoseLandmark[] | null;
    right: PoseLandmark[] | null;
  }>({ left: null, right: null });
  useEffect(() => {
    latestHandsRef.current = { left: leftHandLandmarks, right: rightHandLandmarks };
  }, [leftHandLandmarks, rightHandLandmarks]);

  // connecting → guard-leadin once the peer sync signal arrives.
  useEffect(() => {
    if (phase === "connecting" && ready) {
      setPhase("guard-leadin");
    }
  }, [phase, ready]);

  // guard-leadin → guard-hold after a fixed "get your hands up" window.
  useEffect(() => {
    if (phase !== "guard-leadin") return;
    const t = window.setTimeout(() => setPhase("guard-hold"), GUARD_LEADIN_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Schedule the 3-2-1 countdown + baseline capture on entering guard-hold.
  // Each retry bumps attemptId to re-fire this effect. This is a local
  // reimplementation of usePunchDetector.onCalibrate so we don't spin up a
  // second punch-detection loop alongside the gameplay one.
  useEffect(() => {
    if (phase !== "guard-hold") return;
    const store = usePunchCalibrationStore.getState();
    store.setCalibrateMsg(null);
    store.setCountdown(3);
    const timers = [
      window.setTimeout(() => usePunchCalibrationStore.getState().setCountdown(2), 1000),
      window.setTimeout(() => usePunchCalibrationStore.getState().setCountdown(1), 2000),
      window.setTimeout(() => {
        const s = usePunchCalibrationStore.getState();
        const l = sampleHand(latestHandsRef.current.left);
        const r = sampleHand(latestHandsRef.current.right);
        s.setCountdown(null);
        if (!l && !r) {
          s.setCalibrateMsg("No hand visible — raise your guard in frame.");
          return;
        }
        s.setBaselineSides(l, r);
        s.resetCounts();
        s.setCalibrateMsg(null);
      }, 3000),
    ];
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (usePunchCalibrationStore.getState().countdown !== null) {
        usePunchCalibrationStore.getState().setCountdown(null);
      }
    };
  }, [phase, attemptId]);

  // Success: baseline landed → celebrate. Also tell the parent we're locked
  // in so it can broadcast guard_ready to the peer (gate for their waiting-peer).
  useEffect(() => {
    if (phase !== "guard-hold") return;
    if (!baseline) return;
    if (baseline.left || baseline.right) {
      setPhase("guard-done");
      if (!selfGuardReadyFiredRef.current) {
        selfGuardReadyFiredRef.current = true;
        onSelfGuardReadyRef.current?.();
      }
    }
  }, [phase, baseline]);

  // Auto-retry on "no hand visible" up to MAX_GUARD_RETRIES.
  useEffect(() => {
    if (phase !== "guard-hold") return;
    if (guardCountdown !== null) return;
    if (!calibrateMsg) return;
    if (retryCount >= MAX_GUARD_RETRIES - 1) return;
    const t = window.setTimeout(() => {
      setRetryCount((n) => n + 1);
      setAttemptId((n) => n + 1);
    }, RETRY_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [phase, guardCountdown, calibrateMsg, retryCount]);

  // guard-done → (done | waiting-peer) after the "GUARD LOCKED!" flash. Only
  // dismisses to combat if the peer has also broadcast guard_ready (or isn't
  // present at all — solo fallback). Otherwise parks in waiting-peer until
  // the peer signal lands, preventing the "one side boxing while the other
  // is still calibrating" race on slow clients.
  // Reads latest peer/presence/onDone through refs so the timer isn't
  // re-scheduled by dep churn (which would extend the flash duration).
  useEffect(() => {
    if (phase !== "guard-done") return;
    const t = window.setTimeout(() => {
      if (peerGuardReadyRef.current || !hasPeerPresenceRef.current) {
        onDoneRef.current?.();
        setPhase("done");
      } else {
        setPhase("waiting-peer");
      }
    }, GUARD_DONE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // waiting-peer → done the moment the peer's guard_ready arrives, or if
  // they disconnect out of presence (solo fallback, matches the existing
  // presenceTimedOut/soloTimedOut pattern on the parent).
  useEffect(() => {
    if (phase !== "waiting-peer") return;
    if (peerGuardReady || !hasPeerPresence) {
      onDoneRef.current?.();
      setPhase("done");
    }
  }, [phase, peerGuardReady, hasPeerPresence]);

  // Position the BodyDetector's debug MediaPipe canvas to match the phase:
  //   connecting + guard-leadin            → hidden (no camera visible)
  //   guard-hold + guard-done + waiting-peer → centered + enlarged on screen
  //   gameplay (overlay gone)              → bottom-right corner (default inline style)
  // Done by toggling classes on <html> that CSS targets .body-debug-canvas.
  useEffect(() => {
    const root = document.documentElement;
    const hide = phase === "connecting" || phase === "guard-leadin";
    const center =
      phase === "guard-hold" ||
      phase === "guard-done" ||
      phase === "waiting-peer";
    root.classList.toggle("hide-body-debug", hide);
    root.classList.toggle("body-debug-center", center);
    return () => {
      root.classList.remove("hide-body-debug");
      root.classList.remove("body-debug-center");
    };
  }, [phase]);

  const handleManualRetry = () => {
    if (phase !== "guard-hold") return;
    setRetryCount(0);
    setAttemptId((n) => n + 1);
  };

  if (phase === "done") return null;

  const retriesExhausted =
    phase === "guard-hold" &&
    guardCountdown === null &&
    !!calibrateMsg &&
    retryCount >= MAX_GUARD_RETRIES - 1;

  const showWebcam =
    phase === "guard-hold" ||
    phase === "guard-done" ||
    phase === "waiting-peer";

  return (
    <div aria-live="polite" role="status">
      {/* Full-screen sand backdrop — below the debug canvas (9999), so the
       * canvas can show centered on top of it during guard-hold. */}
      <div className="gload-bg" />

      {phase === "connecting" && (
        <div className="gload-fullscreen">
          <div className="gload-sun" />
          <div className="gload-label mono">
            {hasPeerPresence ? "Syncing with your buddy…" : "Joining the cove…"}
          </div>
        </div>
      )}

      {phase === "guard-leadin" && (
        <div className="gload-fullscreen">
          <div className="gload-leadin-card">
            <div className="gload-hint">Guard calibration</div>
            <div className="gload-big">RAISE YOUR HANDS</div>
            <div className="gload-sub">Get both hands up, palms forward</div>
            <div className="gload-bar">
              <div className="gload-bar-fill" />
            </div>
          </div>
        </div>
      )}

      {showWebcam && (
        // Transparent anchor matching where the repositioned debug canvas
        // lands; houses the countdown banner / lock celebration above it.
        // Rendered as a top-level sibling so its z-index stacks above the
        // canvas's inline z-index: 9999.
        <div className="gload-center-anchor">
          {phase === "guard-hold" && (
            <div className="gload-banner">
              {retriesExhausted ? (
                <>
                  <div className="gload-hint">Couldn&apos;t capture your guard</div>
                  <div className="gload-err">
                    {calibrateMsg ?? "Make sure both hands are visible."}
                  </div>
                  <button
                    type="button"
                    className="gload-retry-btn"
                    onClick={handleManualRetry}
                  >
                    Try again
                  </button>
                </>
              ) : guardCountdown !== null ? (
                <>
                  <div className="gload-hint">Hold your guard</div>
                  <div className="gload-count">{guardCountdown}</div>
                  <div className="gload-sub">keep both hands up</div>
                </>
              ) : (
                <>
                  <div className="gload-hint">Hold your guard</div>
                  <div className="gload-spinner" />
                  <div className="gload-sub">
                    {retryCount > 0 ? `Retrying (${retryCount + 1}/${MAX_GUARD_RETRIES})…` : "Get ready…"}
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "guard-done" && (
            <div className="gload-locked">
              <div className="gload-locked-burst" />
              <div className="gload-locked-card">
                <div className="gload-locked-check">✓</div>
                <div className="gload-locked-title">GUARD LOCKED!</div>
                <div className="gload-locked-sub">Starting match…</div>
              </div>
            </div>
          )}

          {phase === "waiting-peer" && (
            <div className="gload-waiting-peer">
              <div className="gload-locked-card gload-waiting-card">
                <div className="gload-locked-check">✓</div>
                <div className="gload-locked-title">GUARD LOCKED</div>
                <div className="gload-locked-sub">Waiting for your buddy…</div>
                <div className="gload-spinner" />
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        /* Toggled from GameLoadingOverlay's phase effect.
         *   .hide-body-debug     → debug canvas hidden
         *   .body-debug-center   → debug canvas centered + enlarged on screen
         * The default inline style (bottom:16 right:16, 480x360) kicks back in
         * as soon as both classes come off (gameplay). */
        .hide-body-debug .body-debug-canvas { display: none !important; }
        .body-debug-center .body-debug-canvas {
          bottom: auto !important;
          right: auto !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: min(720px, 92vw) !important;
          height: auto !important;
          aspect-ratio: 4 / 3 !important;
          border: 3px solid var(--ink) !important;
          border-radius: var(--radius-lg) !important;
          box-shadow: var(--shadow-chunky) !important;
        }

        /* Sand backdrop — sits below the debug canvas (z-index 9999), visible
         * around it when it's centered during guard phases. */
        .gload-bg {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: linear-gradient(180deg, var(--sand) 0%, var(--sand-warm) 100%);
          animation: gload-fade 160ms ease-out both;
        }
        /* Full-screen content layer for connecting + leadin — above the debug
         * canvas, so the sun/label/leadin-card can sit on the sand. */
        .gload-fullscreen {
          position: fixed;
          inset: 0;
          z-index: 10001;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 22px;
          padding: 28px 24px;
          color: var(--ink);
          animation: gload-fade 160ms ease-out both;
          pointer-events: none;
        }
        .gload-fullscreen > * { pointer-events: auto; }
        @keyframes gload-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Connecting phase: sun + label centered on sand backdrop. */
        .gload-sun {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 45%, #fff1c2 0%, var(--sun) 60%, #c2492c 100%);
          box-shadow: 0 0 60px 12px color-mix(in srgb, var(--sun) 45%, transparent);
          animation: gload-pulse 1.6s ease-in-out infinite;
        }
        .gload-sun-small {
          width: 42px;
          height: 42px;
          box-shadow: 0 0 40px 8px color-mix(in srgb, var(--sun) 40%, transparent);
        }
        .gload-label {
          font-size: 13px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        @keyframes gload-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.92; }
          50%      { transform: scale(1.08); opacity: 1; }
        }

        /* Ghost container positioned exactly over the relocated debug canvas —
         * hosts the countdown banner and lock celebration above it (z-index
         * above the canvas's 9999). */
        .gload-center-anchor {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(720px, 92vw);
          aspect-ratio: 4 / 3;
          pointer-events: none;
          z-index: 10001;
        }

        /* Bottom banner over the centered webcam canvas. */
        .gload-banner {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          min-width: min(260px, calc(100% - 32px));
          max-width: 360px;
          padding: 14px 20px 16px;
          background: color-mix(in srgb, white 94%, transparent);
          border: 2px solid var(--ink);
          border-radius: var(--radius);
          box-shadow: var(--shadow-chunky);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          color: var(--ink);
          pointer-events: auto;
        }
        /* Standalone "RAISE YOUR HANDS" card for the leadin phase — shown on
         * the sand backdrop with no webcam behind it. */
        .gload-leadin-card {
          background: white;
          border: 3px solid var(--sun);
          border-radius: var(--radius-lg);
          box-shadow:
            0 0 0 6px color-mix(in srgb, var(--sun) 22%, transparent),
            var(--shadow-chunky);
          padding: 28px 36px 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          min-width: min(320px, 88vw);
          max-width: 440px;
          color: var(--ink);
          animation: gload-leadin-pulse 0.9s ease-in-out infinite alternate;
        }
        @keyframes gload-leadin-pulse {
          from { transform: scale(1);    }
          to   { transform: scale(1.03); }
        }
        .gload-hint {
          font-family: var(--font-outfit), sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink);
        }
        .gload-big {
          font-family: var(--font-outfit), sans-serif;
          font-size: clamp(26px, 5.5vw, 40px);
          font-weight: 800;
          line-height: 1;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--sun);
          margin: 4px 0;
          text-shadow:
            0 3px 0 rgba(58, 46, 76, 0.18),
            0 8px 22px color-mix(in srgb, var(--sun) 30%, transparent);
        }
        .gload-count {
          font-family: var(--font-outfit), sans-serif;
          font-size: clamp(48px, 10vw, 72px);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.04em;
          font-variant-numeric: tabular-nums;
          color: var(--sun);
          text-shadow:
            0 3px 0 rgba(58, 46, 76, 0.2),
            0 8px 24px color-mix(in srgb, var(--sun) 32%, transparent);
        }
        .gload-sub {
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .gload-bar {
          width: 100%;
          height: 6px;
          border-radius: 99px;
          background: color-mix(in srgb, var(--ink) 12%, transparent);
          margin-top: 8px;
          overflow: hidden;
        }
        .gload-bar-fill {
          height: 100%;
          width: 0%;
          background: var(--sun);
          border-radius: 99px;
          animation: gload-bar-fill 2s linear forwards;
        }
        @keyframes gload-bar-fill {
          from { width: 0%;   }
          to   { width: 100%; }
        }
        .gload-spinner {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid color-mix(in srgb, var(--sun) 25%, transparent);
          border-top-color: var(--sun);
          animation: gload-spin 0.9s linear infinite;
          margin: 6px 0;
        }
        @keyframes gload-spin { to { transform: rotate(360deg); } }
        .gload-err {
          font-family: var(--font-outfit), sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: #c0392b;
          margin-top: 4px;
        }
        .gload-retry-btn {
          margin-top: 8px;
          padding: 10px 18px;
          border: none;
          border-radius: var(--radius);
          background: var(--sun);
          color: white;
          font-family: var(--font-outfit), sans-serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: var(--shadow-chunky);
        }
        .gload-retry-btn:hover  { transform: translateY(-1px); }
        .gload-retry-btn:active { transform: translateY(1px);  }

        /* Guard locked celebration — leaf flash, constrained to the frame. */
        .gload-locked {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--leaf) 55%, transparent);
          animation: gload-locked-flash 0.35s ease-out;
          overflow: hidden;
        }
        @keyframes gload-locked-flash {
          0%   { background: color-mix(in srgb, var(--leaf) 10%, transparent); }
          40%  { background: color-mix(in srgb, var(--leaf) 80%, transparent); }
          100% { background: color-mix(in srgb, var(--leaf) 55%, transparent); }
        }
        .gload-locked-burst {
          position: absolute;
          inset: -40%;
          background: radial-gradient(circle at center,
            rgba(255, 255, 255, 0.75) 0%,
            color-mix(in srgb, var(--leaf) 50%, transparent) 30%,
            transparent 65%);
          animation: gload-locked-burst 0.9s ease-out forwards;
          pointer-events: none;
        }
        @keyframes gload-locked-burst {
          0%   { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(1);   opacity: 0; }
        }
        .gload-locked-card {
          position: relative;
          padding: 28px 36px;
          background: white;
          border: 3px solid var(--leaf);
          border-radius: var(--radius-lg);
          box-shadow:
            0 0 0 6px color-mix(in srgb, var(--leaf) 25%, transparent),
            var(--shadow-chunky);
          text-align: center;
          color: var(--ink);
          animation: gload-locked-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes gload-locked-pop {
          0%   { transform: scale(0.4) rotate(-4deg); opacity: 0; }
          60%  { transform: scale(1.06) rotate(2deg); opacity: 1; }
          100% { transform: scale(1)    rotate(0);    opacity: 1; }
        }
        .gload-locked-check {
          font-family: var(--font-outfit), sans-serif;
          font-size: clamp(64px, 14vw, 96px);
          font-weight: 900;
          line-height: 1;
          color: var(--leaf);
          text-shadow: 0 4px 0 rgba(58, 46, 76, 0.15);
        }
        .gload-locked-title {
          font-family: var(--font-outfit), sans-serif;
          font-size: clamp(22px, 5vw, 32px);
          font-weight: 800;
          letter-spacing: 0.04em;
          margin-top: 4px;
          color: var(--ink);
        }
        .gload-locked-sub {
          margin-top: 8px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }

        /* Waiting-peer variant — same card as guard-done, but no flash/burst
         * and no pop-in. Calmer presentation while we wait on the peer. */
        .gload-waiting-peer {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--leaf) 38%, transparent);
          overflow: hidden;
        }
        .gload-waiting-card {
          animation: none !important;
          gap: 6px;
        }
        .gload-waiting-card .gload-spinner {
          margin: 10px auto 0;
        }
      `}</style>
    </div>
  );
}
