"use client";

import { useState, useCallback } from "react";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  startGame,
} from "@/lib/multiplayer/roomService";
import type { Room } from "@/lib/multiplayer/types";

type RoomError = string | null;

export function useRoom(playerId: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<RoomError>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newRoom = await createRoom(playerId);
      setRoom(newRoom);
      return newRoom;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  const handleJoin = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);
      try {
        const joinedRoom = await joinRoom(code, playerId);
        setRoom(joinedRoom);
        return joinedRoom;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [playerId]
  );

  const handleLeave = useCallback(async () => {
    if (!room) return;
    setLoading(true);
    try {
      await leaveRoom(room.id, playerId);
      setRoom(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [room, playerId]);

  const handleStart = useCallback(async () => {
    if (!room) return;
    setLoading(true);
    setError(null);
    try {
      await startGame(room.id, playerId);
      setRoom((prev) => prev ? { ...prev, status: "active" } : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [room, playerId]);

  return {
    room,
    error,
    loading,
    createRoom: handleCreate,
    joinRoom: handleJoin,
    leaveRoom: handleLeave,
    startGame: handleStart,
  };
}
