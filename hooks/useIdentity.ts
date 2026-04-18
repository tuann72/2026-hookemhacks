"use client";

import { useEffect, useState } from "react";

const PLAYER_ID_KEY = "hookem:playerId";
const PLAYER_NAME_KEY = "hookem:playerName";

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

export function useIdentity() {
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerNameState] = useState("");

  useEffect(() => {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    setPlayerId(id);
    setPlayerNameState(sessionStorage.getItem(PLAYER_NAME_KEY) ?? "");
  }, []);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(PLAYER_NAME_KEY, name);
    }
  };

  return { playerId, playerName, setPlayerName };
}
