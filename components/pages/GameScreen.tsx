"use client";

import { AvatarStage } from "../game/AvatarStage";

type GameScreenProps = {
  onEnd?: () => void;
  roomId?: string;
  playerId?: string;
};

export function GameScreen({ onEnd: _onEnd, roomId, playerId }: GameScreenProps) {
  return (
    <div className="game-wrap">
      <div className="game-field">
        <div className="game-view">
          <div className="webcam-fake">
            <div className="fake-sun" />
            <div className="fake-volcano" />
            <div className="fake-sand" />
            <div className="fake-palm" />
          </div>
          <div className="figure">
            <AvatarStage roomId={roomId} playerId={playerId} />
          </div>
        </div>

        <div className="hud-side" />
      </div>
    </div>
  );
}
