"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Backdrop } from "@/components/scenery/Scenery";
import { BRAND } from "@/components/shared/constants";
import { joinRoom as joinRoomService } from "@/lib/multiplayer/roomService";
import { useIdentity } from "@/hooks/useIdentity";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = searchParams.get("code")?.toUpperCase().slice(0, 4) ?? "";

  const [inputCode, setInputCode] = useState<string[]>(
    prefill ? prefill.split("").concat(Array(4 - prefill.length).fill("")) : ["", "", "", ""]
  );
  const { playerId, playerName, setPlayerName } = useIdentity();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (idx: number, val: string) => {
    const v = val.toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
    const next = [...inputCode];
    next[idx] = v;
    setInputCode(next);
    if (v && idx < 3) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !inputCode[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
    if (!text) return;
    e.preventDefault();
    const next: string[] = ["", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setInputCode(next);
    const focusIdx = Math.min(text.length, 3);
    inputRefs.current[focusIdx]?.focus();
  };

  const filled = inputCode.every((c) => c);
  const codeStr = inputCode.join("");

  const joinRoom = async () => {
    if (!filled || !playerName.trim() || !playerId || joining) return;
    setJoining(true);
    setError(null);
    try {
      await joinRoomService(codeStr, playerId);
      router.push(`/lobby/${codeStr}`);
    } catch (e) {
      setError((e as Error).message);
      setJoining(false);
    }
  };

  return (
    <div className="app-stage" data-time="day" data-intensity="normal">
      <Backdrop />

      <div className="hj-wrap">
        <div className="hj-card card">
          <div className="hj-eyebrow">{BRAND.event} · Join a room</div>
          <h1 className="hj-title">Drop into a cove.</h1>
          <p className="hj-sub">
            Punch in the four-letter word the host sent you. No keyboard required after that.
          </p>

          <div className="room-code-label">Enter the room word</div>
          <div className="code-input-row">
            {inputCode.map((c, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                className={`code-input ${c ? "filled" : ""}`}
                maxLength={1}
                value={c}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                autoFocus={i === 0}
              />
            ))}
          </div>

          <div className="name-row" style={{ marginTop: 20 }}>
            <label htmlFor="join-name">Your player name</label>
            <input
              id="join-name"
              className="name-input"
              placeholder="e.g. Mango Molly"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            />
          </div>

          {error && (
            <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12 }}>
              {error}
            </p>
          )}

          <div className="action-row" style={{ marginTop: 24 }}>
            <Link href="/" className="btn ghost" style={{ flex: "0 0 auto", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ← Back
            </Link>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1, opacity: filled && playerName.trim() && !joining ? 1 : 0.5 }}
              disabled={!filled || !playerName.trim() || joining}
              onClick={joinRoom}
            >
              {joining ? "Joining…" : "Join the cove →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
