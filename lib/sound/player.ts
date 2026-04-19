"use client";

import { useSoundStore } from "@/lib/store/soundStore";

// Tiny audio helper for one-shot SFX. Pools HTMLAudioElements per key so
// rapid overlapping hits don't cut each other off (one element can only play
// one stream at a time; we round-robin into a free slot instead). Source
// files are served from /public/sound/ so the browser fetches them via HTTP.
//
// All playback is gated on useSoundStore.enabled so the /world debug toggle
// can silence cues globally without having to thread a flag through every
// caller.

type Key = "hit" | "end";

const SOURCES: Record<Key, string> = {
  hit: "/sound/hit.mp3",
  end: "/sound/end.mp3",
};

const POOL_SIZE = 4;

const pool: Partial<Record<Key, HTMLAudioElement[]>> = {};

function claim(key: Key): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let arr = pool[key];
  if (!arr) {
    arr = Array.from({ length: POOL_SIZE }, () => {
      const a = new Audio(SOURCES[key]);
      a.preload = "auto";
      return a;
    });
    pool[key] = arr;
  }
  // Prefer a slot that's done playing; otherwise hijack the oldest one so we
  // never silently drop a hit cue.
  const free = arr.find((a) => a.paused || a.ended) ?? arr[0];
  try {
    free.currentTime = 0;
  } catch {
    // Some browsers throw if the element hasn't loaded metadata yet — safe
    // to ignore; play() below will start from 0 anyway.
  }
  return free;
}

export function playHit(): void {
  if (!useSoundStore.getState().enabled) return;
  const a = claim("hit");
  if (!a) return;
  void a.play().catch(() => {
    // Autoplay rejected (pre-gesture) or user paused it mid-play — ignore.
  });
}

export function playEnd(): void {
  if (!useSoundStore.getState().enabled) return;
  const a = claim("end");
  if (!a) return;
  void a.play().catch(() => {});
}
