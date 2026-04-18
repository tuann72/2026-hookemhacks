"use client";

import { createContext, useContext, useState } from "react";
import type { BodyTrackingState } from "@/types";

const defaultState: BodyTrackingState = {
  leftArm: null,
  rightArm: null,
  leftHand: null,
  rightHand: null,
  fps: 0,
  isReady: false,
};

export const BodyTrackingContext = createContext<BodyTrackingState>(defaultState);

export function useBodyDetection(): BodyTrackingState {
  return useContext(BodyTrackingContext);
}

// TODO: Full MediaPipe implementation
export function useBodyDetectionProvider() {
  const [state] = useState<BodyTrackingState>(defaultState);
  return state;
}
