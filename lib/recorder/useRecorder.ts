"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SegmentRecorder } from "./recorder";
import type { ChunkHandler, RecorderOptions, RecorderState } from "./types";

export interface UseRecorderReturn {
  /** Current lifecycle state of the recorder. */
  state: RecorderState;
  /** Set when `state === 'error'`. */
  error: Error | null;
  /**
   * Begin recording. Safe to call multiple times — ignored while already
   * recording. Must be called after the stream is available.
   */
  start: (matchId: string, playerId: string) => void;
  /**
   * Stop recording and flush the final chunk. The returned promise resolves
   * once all chunks have been emitted.
   */
  stop: () => Promise<void>;
}

/**
 * React wrapper around {@link SegmentRecorder} for use in game page components.
 *
 * Wires up the recorder to an existing `MediaStream` (e.g., the one owned by
 * `useBodyDetectionProvider`), forwards chunk events to `onChunk`, and cleans
 * up on unmount. Safe against React StrictMode double-mounting — the recorder
 * is not started until `start()` is explicitly called.
 *
 * @param stream  - The active `MediaStream` to record. Obtain from
 *   `videoRef.current?.srcObject as MediaStream` after the body-detection
 *   provider has initialised. Pass `null` or `undefined` while not yet ready;
 *   the recorder is created as soon as the stream becomes available.
 * @param options - Optional recording configuration. Changes after mount are
 *   ignored; stop and restart to apply new options.
 * @param onChunk - Called with each {@link ChunkReady} as it is produced.
 *   Wrap in `useCallback` to prevent unnecessary effect re-runs.
 *
 * @example
 * ```tsx
 * const { state, start, stop } = useRecorder(
 *   videoRef.current?.srcObject as MediaStream ?? null,
 *   { chunkDurationMs: 5000 },
 *   useCallback((chunk) => uploadChunk(chunk), []),
 * );
 * ```
 */
export function useRecorder(
  stream: MediaStream | null | undefined,
  options?: RecorderOptions,
  onChunk?: ChunkHandler,
): UseRecorderReturn {
  const recorderRef = useRef<SegmentRecorder | null>(null);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<Error | null>(null);

  // Keep onChunk in a ref so handler identity changes don't recreate the recorder.
  const onChunkRef = useRef(onChunk);
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  // Snapshot options at recorder-creation time. A running recorder cannot
  // change options mid-session — the caller must stop() and start() again.
  const optionsRef = useRef(options);

  useEffect(() => {
    if (!stream) return;

    const rec = new SegmentRecorder(stream, optionsRef.current);

    const unsubChunk = rec.onChunk((chunk) => {
      onChunkRef.current?.(chunk);
    });

    const unsubState = rec.onStateChange((s, err) => {
      setState(s);
      setError(err);
    });

    setState("idle");
    setError(null);
    recorderRef.current = rec;

    return () => {
      unsubChunk();
      unsubState();
      // Stop cleanly on unmount; fire-and-forget is fine here because the
      // component is already gone. The promise still resolves — we just don't
      // await it.
      if (rec.currentState === "recording") {
        rec.stop();
      }
      recorderRef.current = null;
    };
  }, [stream]);

  const start = useCallback((matchId: string, playerId: string) => {
    recorderRef.current?.start(matchId, playerId);
  }, []);

  const stop = useCallback((): Promise<void> => {
    return recorderRef.current?.stop() ?? Promise.resolve();
  }, []);

  return { state, error, start, stop };
}
