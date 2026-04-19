/*
 * STANDALONE-CHUNK STRATEGY: PREPEND INIT SEGMENT
 *
 * MediaRecorder with `timeslice` produces a stream of Blobs where only the
 * first Blob contains the WebM initialization data (EBML header + Tracks
 * element). All subsequent Blobs are bare Cluster elements — they reference
 * codec configuration from the header and are NOT independently decodable.
 *
 * This module stores the first Blob as the "init segment" and constructs each
 * subsequent ChunkReady blob as `new Blob([initSegment, currentBlob])`. Every
 * emitted chunk is therefore a self-contained, playable WebM file so the
 * upload/captioning layer can process each chunk in isolation without
 * reassembly logic.
 *
 * Trade-off: chunks after the first carry a few hundred bytes of overhead
 * (the init segment). At 5 s / 1.5 Mbps that's ~937 KB per chunk, so the
 * overhead is negligible. The init segment is stored as a Blob reference —
 * no ArrayBuffer copy is needed; the browser concatenates lazily.
 */

import type {
  ChunkReady,
  ChunkHandler,
  RecorderOptions,
  RecorderState,
  StateChangeHandler,
  UnsubscribeFn,
} from "./types";

const MIME_FALLBACKS = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

const DEFAULT_OPTIONS = {
  mimeType: "video/webm;codecs=vp9",
  videoBitsPerSecond: 1_500_000,
  chunkDurationMs: 5_000,
} satisfies Required<RecorderOptions>;

function selectMimeType(preferred: string): string {
  const candidates = [preferred, ...MIME_FALLBACKS.filter((m) => m !== preferred)];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      if (mime !== preferred) {
        console.info(`[recorder] "${preferred}" not supported — using "${mime}"`);
      }
      return mime;
    }
  }
  console.info("[recorder] No preferred MIME type supported — using browser default");
  return "";
}

/**
 * Framework-agnostic webcam chunk recorder.
 *
 * Takes ownership of nothing: it receives an existing `MediaStream` and
 * records it into fixed-duration WebM chunks. It does not acquire a stream,
 * upload anything, or call any external APIs.
 *
 * @example
 * ```ts
 * const rec = new SegmentRecorder(stream, { chunkDurationMs: 5000 });
 * rec.onChunk((chunk) => uploadChunk(chunk));
 * rec.start(matchId, playerId);
 * // later:
 * await rec.stop();
 * ```
 */
export class SegmentRecorder {
  private readonly opts: Required<RecorderOptions>;
  private mr: MediaRecorder | null = null;
  private initBlob: Blob | null = null;
  private chunkIndex = 0;
  private chunkStartedAt = 0;
  private matchId = "";
  private playerId = "";
  private mimeType = "";

  private _state: RecorderState = "idle";
  private _error: Error | null = null;

  private chunkHandlers = new Set<ChunkHandler>();
  private stateHandlers = new Set<StateChangeHandler>();

  /**
   * @param stream - The `MediaStream` to record. Must already be active.
   *   Pass `videoRef.current.srcObject` from the body-detection provider.
   * @param options - Optional recording configuration.
   */
  constructor(
    private readonly stream: MediaStream,
    options?: RecorderOptions,
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Current lifecycle state of this recorder. */
  get currentState(): RecorderState {
    return this._state;
  }

  /** The last error, if `currentState === 'error'`. */
  get lastError(): Error | null {
    return this._error;
  }

  /**
   * Subscribe to chunk events. Each call to the handler represents one
   * self-contained, playable WebM segment.
   *
   * @returns A function that removes this subscription.
   */
  onChunk(handler: ChunkHandler): UnsubscribeFn {
    this.chunkHandlers.add(handler);
    return () => this.chunkHandlers.delete(handler);
  }

  /**
   * Subscribe to recorder state changes.
   *
   * @returns A function that removes this subscription.
   */
  onStateChange(handler: StateChangeHandler): UnsubscribeFn {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /**
   * Begin recording. Resets chunk index and starts a new MediaRecorder
   * session. Safe to call only when `currentState === 'idle'`; subsequent
   * calls while recording are no-ops.
   */
  start(matchId: string, playerId: string): void {
    if (this._state === "recording" || this._state === "stopping") return;

    this.matchId = matchId;
    this.playerId = playerId;
    this.chunkIndex = 0;
    this.initBlob = null;
    this._error = null;
    this.mimeType = selectMimeType(this.opts.mimeType);

    const mrInit: MediaRecorderOptions = {
      videoBitsPerSecond: this.opts.videoBitsPerSecond,
    };
    if (this.mimeType) mrInit.mimeType = this.mimeType;

    const mr = new MediaRecorder(this.stream, mrInit);
    this.mr = mr;

    this.chunkStartedAt = Date.now();

    mr.ondataavailable = (e: BlobEvent) => {
      if (!e.data || e.data.size === 0) return;

      const now = Date.now();
      const startedAt = this.chunkStartedAt;
      const durationMs = now - startedAt;
      this.chunkStartedAt = now;

      if (this.chunkIndex === 0) {
        // First blob: init segment + first cluster — already standalone.
        // Store it so we can prepend it to all subsequent blobs.
        this.initBlob = e.data;
        this.emitChunk(e.data, startedAt, durationMs);
      } else {
        // Prepend init segment to make this cluster independently decodable.
        const blob = this.initBlob
          ? new Blob([this.initBlob, e.data], { type: this.mimeType || "video/webm" })
          : e.data;
        this.emitChunk(blob, startedAt, durationMs);
      }

      this.chunkIndex++;
    };

    mr.onerror = (e: Event) => {
      const err =
        "error" in e && e.error instanceof Error
          ? (e.error as Error)
          : new Error("MediaRecorder error");
      this._error = err;
      this.setState("error");
    };

    mr.onstop = () => {
      if (this._state === "stopping") {
        this.setState("idle");
      }
    };

    mr.start(this.opts.chunkDurationMs);
    this.setState("recording");
  }

  /**
   * Stop recording and flush any buffered data. The returned promise resolves
   * once the final `ondataavailable` and `onstop` events have both fired,
   * meaning all chunks have been emitted before resolution.
   */
  stop(): Promise<void> {
    if (this._state !== "recording") return Promise.resolve();

    this.setState("stopping");

    return new Promise<void>((resolve) => {
      const mr = this.mr!;
      mr.addEventListener("stop", () => resolve(), { once: true });
      mr.stop();
    });
  }

  private emitChunk(blob: Blob, startedAt: number, durationMs: number): void {
    const chunk: ChunkReady = {
      matchId: this.matchId,
      playerId: this.playerId,
      chunkIndex: this.chunkIndex,
      startedAt,
      durationMs,
      blob,
    };
    for (const h of this.chunkHandlers) h(chunk);
  }

  private setState(next: RecorderState): void {
    this._state = next;
    for (const h of this.stateHandlers) h(next, this._error);
  }
}
