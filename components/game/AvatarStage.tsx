"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import BodyDetector from "@/components/detection/BodyDetector";
import { CVRigBridge } from "@/components/detection/CVRigBridge";
import { IngestionBridge } from "@/components/detection/IngestionBridge";
import { SELF_PLAYER_ID } from "@/types";

// Self-contained 3D avatar block for embedding inside any 2D UI container.
// Drops in where a <FigureSilhouette /> used to live — the parent just needs
// to give it a sized box and the Three.js canvas fills it. Opens the webcam
// via BodyDetector, pipes CV through CVRigBridge to the pose store, and
// renders the R3F scene. Only mount one of these per page (single webcam).

const GameCanvas = dynamic(
  () => import("./GameCanvas").then((m) => m.GameCanvas),
  { ssr: false, loading: () => <Booting /> }
);

function Booting() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        fontSize: 10,
        letterSpacing: "0.3em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)",
      }}
    >
      booting arena…
    </div>
  );
}

interface AvatarStageProps {
  debug?: boolean;
  roomId?: string;
  playerId?: string;
}

export function AvatarStage({ debug = false, roomId, playerId }: AvatarStageProps) {
  return (
    <BodyDetector debug={debug}>
      <CVRigBridge playerId={SELF_PLAYER_ID} />
      {roomId && playerId && (
        <IngestionBridge roomId={roomId} playerId={playerId} combatStarted />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          overflow: "hidden",
        }}
      >
        <GameCanvas debug={debug} />
        <Link
          href="/world"
          aria-label="Open fullscreen world view"
          title="Open fullscreen world view"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff",
            fontFamily: "monospace",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            textDecoration: "none",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          <span style={{ fontSize: 11, lineHeight: 1 }}>⤢</span>
          <span>Full</span>
        </Link>
      </div>
    </BodyDetector>
  );
}
