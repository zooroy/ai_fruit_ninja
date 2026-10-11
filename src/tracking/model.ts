import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
export async function createModel(base: string) {
  const files = await FilesetResolver.forVisionTasks(base + "wasm");
  return HandLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: base + "models/hand_landmarker.task",
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
}
