/**
 * @module recorder
 *
 * Webcam chunk recorder for Hookem Hacks. Piggybacks on the MediaStream
 * already owned by the body-detection provider to produce self-contained
 * 5-second WebM blobs for post-game Gemini captioning and multimodal search.
 *
 * This module has no knowledge of Supabase, MediaPipe, or game logic.
 * The boundary between this module and the rest of the system is the
 * {@link ChunkReady} callback — upload and embedding are downstream.
 *
 * @example Wiring up alongside useBodyDetectionProvider in the game page
 * ```tsx
 * export default function GamePage() {
 *   const videoRef = useRef<HTMLVideoElement>(null);
 *
 *   // body-detection provider owns the stream and runs MediaPipe
 *   const bodyState = useBodyDetectionProvider(videoRef);
 *
 *   // recorder piggybacks on the same stream
 *   const stream = (videoRef.current?.srcObject as MediaStream) ?? null;
 *   const { state: recState, start, stop } = useRecorder(
 *     stream,
 *     { chunkDurationMs: 5_000 },
 *     useCallback(
 *       (chunk: ChunkReady) => {
 *         // hand off to your upload service — not this module's concern
 *         uploadChunk(chunk);
 *       },
 *       [],
 *     ),
 *   );
 *
 *   // start recording when the match begins
 *   useEffect(() => {
 *     if (gamePhase === "playing") start(matchId, localPlayerId);
 *     if (gamePhase === "ended")   stop();
 *   }, [gamePhase, matchId, localPlayerId, start, stop]);
 *
 *   return (
 *     <>
 *       <video ref={videoRef} style={{ display: "none" }} />
 *       {recState === "recording" && <RecordingIndicator />}
 *       <Scene bodyState={bodyState} />
 *     </>
 *   );
 * }
 * ```
 */

export { SegmentRecorder } from "./recorder";
export { useRecorder } from "./useRecorder";
export type {
  ChunkReady,
  ChunkHandler,
  RecorderOptions,
  RecorderState,
  StateChangeHandler,
  UnsubscribeFn,
} from "./types";
