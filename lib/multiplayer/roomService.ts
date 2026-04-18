import { supabase } from "@/lib/supabase/client";
import type { Room, RoomPlayer } from "./types";

function generateCode(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * 26)];
  return code;
}

export async function createRoom(hostId: string): Promise<Room> {
  let room: Room | null = null;

  // Retry on rare code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code: generateCode(), host_id: hostId })
      .select()
      .single();

    if (!error) {
      room = data;
      break;
    }

    if (error.code !== "23505") throw error; // 23505 = unique violation
  }

  if (!room) throw new Error("Failed to generate a unique room code");

  await supabase
    .from("room_players")
    .insert({ room_id: room.id, player_id: hostId });

  return room;
}

export async function joinRoom(
  code: string,
  playerId: string
): Promise<Room> {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select()
    .eq("code", code.toUpperCase())
    .eq("status", "waiting")
    .single();

  if (roomError || !room) throw new Error("Room not found or already started");

  const { data: players } = await supabase
    .from("room_players")
    .select()
    .eq("room_id", room.id);

  if (players && players.length >= room.max_players) {
    throw new Error("Room is full");
  }

  const { error: joinError } = await supabase
    .from("room_players")
    .insert({ room_id: room.id, player_id: playerId });

  // Ignore duplicate joins
  if (joinError && joinError.code !== "23505") throw joinError;

  return room;
}

export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<void> {
  await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("player_id", playerId);

  const { data: remaining } = await supabase
    .from("room_players")
    .select()
    .eq("room_id", roomId);

  if (!remaining || remaining.length === 0) {
    await supabase.from("rooms").update({ status: "finished" }).eq("id", roomId);
  }
}

export async function startGame(roomId: string, hostId: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ status: "active" })
    .eq("id", roomId)
    .eq("host_id", hostId)
    .eq("status", "waiting");

  if (error) throw error;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select()
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRoom(roomId: string): Promise<Room> {
  const { data, error } = await supabase
    .from("rooms")
    .select()
    .eq("id", roomId)
    .single();

  if (error || !data) throw new Error("Room not found");
  return data;
}

export async function getRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await supabase
    .from("room_players")
    .select()
    .eq("room_id", roomId);

  if (error) throw error;
  return data ?? [];
}
