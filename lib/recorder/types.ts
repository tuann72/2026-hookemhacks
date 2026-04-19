/**
 * A single recorded video segment emitted by {@link SegmentRecorder}.
 * Each chunk is a self-contained, playable WebM blob suitable for independent
 * upload, storage, and per-chunk processing (e.g., Gemini captioning).
 */
export interface ChunkReady {
  /** The match this chunk belongs to. */
  matchId: string;
  /** The player whose webcam stream was recorded. */
  playerId: string;
  /** Zero-based sequential index within the current recording session. */
  chunkIndex: number;
  /** Wall-clock epoch ms at which this chunk's recording window opened. */
  startedAt: number;
  /**
   * Actual duration of this chunk in milliseconds.
   * Equals `chunkDurationMs` for all chunks except the final one, which may be
   * shorter if `stop()` was called mid-interval.
   */
  durationMs: number;
  /** The recorded video data as a self-contained WebM blob. */
  blob: Blob;
}

/** Configuration for {@link SegmentRecorder}. All fields are optional. */
export interface RecorderOptions {
  /**
   * Preferred MIME type for the MediaRecorder.
   * Falls back to VP8, then the browser default, if unsupported.
   * @default 'video/webm;codecs=vp9'
   */
  mimeType?: string;
  /**
   * Target video bitrate in bits per second.
   * @default 1_500_000
   */
  videoBitsPerSecond?: number;
  /**
   * How often `ondataavailable` fires, in milliseconds.
   * Each interval produces one {@link ChunkReady} event.
   * @default 5000
   */
  chunkDurationMs?: number;
}

/** Lifecycle state of a {@link SegmentRecorder} instance. */
export type RecorderState = "idle" | "recording" | "stopping" | "error";

export type ChunkHandler = (chunk: ChunkReady) => void;
export type StateChangeHandler = (state: RecorderState, error: Error | null) => void;
export type UnsubscribeFn = () => void;
