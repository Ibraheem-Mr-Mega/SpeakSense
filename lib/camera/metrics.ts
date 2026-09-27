export type CameraReading = { value: number | null; confidence: number | null; reason: string };
export type CameraSnapshot = {
  state: string;
  seconds: number;
  guidance: string;
  pulse: CameraReading;
  breathing: CameraReading;
};
export type Sample = { value: number; confidence: number; stable: boolean; timestamp?: unknown };
export type TimedSample = { sample: Sample; received: number };
export const emptyReading = (reason: string): CameraReading => ({ value: null, confidence: null, reason });
export const VALIDATION_HINTS: Record<number, string> = {
  0: "Stay still and quiet, with your face and upper chest in view.",
  1: "Bring your face into the camera view.", 2: "Only one person should be in view.",
  3: "Center your face in the camera view.", 4: "Adjust your distance from the camera.",
  5: "Add even light in front of your face.", 6: "Move away from harsh light.",
  7: "Include your upper chest in the camera view.", 10: "Camera is adjusting. Stay still.",
  11: "Camera frames are arriving too slowly for a reliable reading.",
  12: "Hold still and keep the camera steady.", 13: "Move a little farther from the camera.",
  14: "Move a little closer to the camera.", 15: "Lower your face in the frame.",
  16: "Raise your face in the frame.", 17: "Face the camera directly.",
};
/** All values are omitted until a complete, uninterrupted quality window exists. */
export function gateReading(item: TimedSample | undefined, now: number, goodSince: number | null, window: number): CameraReading {
  if (goodSince === null) return emptyReading("Waiting for a steady, quiet view");
  if (now - goodSince < window) return emptyReading(`Collecting ${Math.ceil(window - (now - goodSince))} more seconds`);
  if (!item || now - item.received > 3) return emptyReading("No recent measurement; check signal or account access");
  const { sample } = item;
  if (!Number.isFinite(sample.value) || sample.value <= 0 || !Number.isFinite(sample.confidence) || sample.confidence > 100 || sample.confidence < 70 || sample.stable !== true)
    return emptyReading("Signal is not stable enough");
  return { value: sample.value, confidence: sample.confidence, reason: "Stable camera estimate" };
}
export function supportedPresageHost(platform: string, arch: string) {
  return (platform === "darwin" && arch === "arm64") || (platform === "linux" && ["x64", "arm64"].includes(arch)) || (platform === "win32" && arch === "x64");
}
