"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRecorder } from "@/lib/recorder";
import type { ChunkReady } from "@/lib/recorder";
import type { ActionEvent } from "./types";

export interface IngestionOptions {
  roomId: string;
  playerId: string;
  stream: MediaStream | null;
  /** Gate the match-start effect. Defaults true; pass false to defer creation
   *  of the matches row (and therefore recording) until e.g. combat begins. */
  enabled?: boolean;
  /** When true, stop the recorder and the event-flush interval but keep the
   *  matches row open. Used to halt ingestion at KO without triggering the
   *  match-start cleanup (which would race with the winner POST). */
  frozen?: boolean;
  drainEvents?: () => ActionEvent[];
  getChunkRollup?: () => Record<string, number>;
}

export function useIngestion({ roomId, playerId, stream, enabled = true, frozen = false, drainEvents, getChunkRollup }: IngestionOptions) {
  const [matchId, setMatchId] = useState<string | null>(null);
  // Keep matchId in a ref so callbacks always see the latest value without
  // needing to be re-created when the state updates.
  const matchIdRef = useRef<string | null>(null);

  // Start a match row in Postgres on mount; end it on unmount.
  useEffect(() => {
    if (!enabled || !roomId || !playerId) return;

    let cancelled = false;

    fetch("/api/matches/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    })
      .then((r) => r.json())
      .then(({ matchId: id }) => {
        if (!cancelled && id) {
          matchIdRef.current = id;
          setMatchId(id);
        }
      })
      .catch((err) => console.error("[ingestion] start match failed", err));

    return () => {
      cancelled = true;
      const id = matchIdRef.current;
      if (id) {
        // Fire-and-forget: component is unmounting (user leaving the page).
        fetch("/api/matches/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: id }),
        }).catch(() => {});
      }
    };
  }, [roomId, playerId, enabled]);

  const handleChunk = useCallback(
    async (chunk: ChunkReady) => {
      const id = matchIdRef.current;
      if (!id) return;

      const rollup = { counts: getChunkRollup?.() ?? {} };

      const form = new FormData();
      form.append("chunk", chunk.blob, `${chunk.chunkIndex}.webm`);
      form.append(
        "meta",
        JSON.stringify({
          matchId: id,
          playerId,
          chunkIndex: chunk.chunkIndex,
          startedAt: chunk.startedAt,
          durationMs: chunk.durationMs,
          rollup,
        })
      );

      try {
        const res = await fetch("/api/clips/upload", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[ingestion] chunk upload failed", chunk.chunkIndex, body);
        }
      } catch (err) {
        console.error("[ingestion] chunk upload error", chunk.chunkIndex, err);
      }
    },
    [playerId]
  );

  const { start: startRecorder, stop: stopRecorder, state: recorderState } = useRecorder(
    stream,
    { chunkDurationMs: 5_000 },
    handleChunk
  );

  // Start recording once both matchId and stream are available. Re-runs when
  // `frozen` flips, stopping the recorder mid-match at KO.
  useEffect(() => {
    if (!matchId || !stream || frozen) return;
    startRecorder(matchId, playerId);
    return () => {
      stopRecorder();
    };
  }, [matchId, stream, playerId, frozen, startRecorder, stopRecorder]);

  // Flush queued ActionEvents every 2.5 seconds.
  // No-ops until drainEvents is wired to an EventTracker (Phase 1).
  useEffect(() => {
    if (!matchId || frozen) return;

    const flush = async () => {
      const events = drainEvents?.() ?? [];
      if (!events.length) return;
      try {
        await fetch("/api/match-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, playerId, events }),
        });
      } catch (err) {
        console.error("[ingestion] event flush failed", err);
      }
    };

    const id = setInterval(flush, 2_500);

    // On unmount or when `frozen` flips true mid-match, drain whatever is
    // queued since the last tick — otherwise the last ~2.5s of punches never
    // reach the DB and downstream stats read 0.
    return () => {
      clearInterval(id);
      flush();
    };
  }, [matchId, playerId, frozen, drainEvents]);

  return { matchId, recorderState };
}
