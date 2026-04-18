"use client";

import BodyDetector from "@/components/detection/BodyDetector";
import { useBodyDetection } from "@/hooks/useBodyDetection";

function DebugPanel() {
  const { leftArm, rightArm, leftHand, rightHand, fps, isReady } = useBodyDetection();
  return (
    <pre style={{ fontFamily: "monospace", fontSize: 13, padding: 24, color: "#00ff00", background: "#000", minHeight: "100dvh" }}>
      {`isReady: ${isReady}   fps: ${fps}\n\n`}
      {`LEFT ARM:\n`}
      {leftArm
        ? `  elbowAngle:   ${leftArm.elbowAngle.toFixed(1)}°\n  swingSpeed:   ${leftArm.swingSpeed.toFixed(3)}\n  raisedHeight: ${leftArm.raisedHeight.toFixed(3)}\n  isExtended:   ${leftArm.isExtended}\n`
        : `  (not detected)\n`}
      {`\nRIGHT ARM:\n`}
      {rightArm
        ? `  elbowAngle:   ${rightArm.elbowAngle.toFixed(1)}°\n  swingSpeed:   ${rightArm.swingSpeed.toFixed(3)}\n  raisedHeight: ${rightArm.raisedHeight.toFixed(3)}\n  isExtended:   ${rightArm.isExtended}\n`
        : `  (not detected)\n`}
      {`\nLEFT HAND:  ${leftHand ? `${leftHand.gesture} (pinch: ${leftHand.pinchDistance.toFixed(2)})` : "(not detected)"}\n`}
      {`RIGHT HAND: ${rightHand ? `${rightHand.gesture} (pinch: ${rightHand.pinchDistance.toFixed(2)})` : "(not detected)"}`}
    </pre>
  );
}

export default function DebugGesturesPage() {
  return (
    <BodyDetector debug>
      <DebugPanel />
    </BodyDetector>
  );
}
