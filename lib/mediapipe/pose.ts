import {
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export interface RawPoseResult {
  poseLandmarks: NormalizedLandmark[][];
  leftHandLandmarks: NormalizedLandmark[] | null;
  rightHandLandmarks: NormalizedLandmark[] | null;
}

let poseLandmarker: PoseLandmarker | null = null;
let handLandmarker: HandLandmarker | null = null;

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

export async function initPose(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

  [poseLandmarker, handLandmarker] = await Promise.all([
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    }),
    HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    }),
  ]);
}

export function processFrame(video: HTMLVideoElement, timestamp: number): RawPoseResult {
  if (!poseLandmarker || !handLandmarker) {
    return { poseLandmarks: [], leftHandLandmarks: null, rightHandLandmarks: null };
  }

  const poseResult = poseLandmarker.detectForVideo(video, timestamp);
  const handResult = handLandmarker.detectForVideo(video, timestamp);

  let leftHandLandmarks: NormalizedLandmark[] | null = null;
  let rightHandLandmarks: NormalizedLandmark[] | null = null;

  handResult.handedness.forEach((handedness, i) => {
    // MediaPipe hand labels are from the model's perspective — swapped to match mirrored display
    const label = handedness[0]?.categoryName;
    if (label === "Left") leftHandLandmarks = handResult.landmarks[i];
    else if (label === "Right") rightHandLandmarks = handResult.landmarks[i];
  });

  return {
    poseLandmarks: poseResult.landmarks,
    leftHandLandmarks,
    rightHandLandmarks,
  };
}
