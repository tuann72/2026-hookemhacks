"use client";

export function usePoseSync(roomId: string, onRemotePose: (pose: unknown) => void) {
  function broadcastPose(pose: unknown) {
    // TODO: Supabase realtime broadcast
  }

  return { broadcastPose };
}
