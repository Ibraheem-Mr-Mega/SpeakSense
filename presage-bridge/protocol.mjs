// Wire protocol shared by the SpeakSense browser client and this bridge.
// Pure functions only, so tests can import this file without the native SDK.

/** Binary frame: 16-byte header + tightly packed RGBA pixels (stride = width * 4). */
export const FRAME_MAGIC = 0x31465353; // "SSF1" little-endian
export const FRAME_HEADER_BYTES = 16;
export const MAX_FRAME_DIM = 1920;

/** MetricType.PULSE_RATE from metric_types.proto. SpeakSense requests pulse only. */
export const PULSE_RATE = 15;

// Names mirror ValidationCode / SmartSpectraErrorCode / ProcessingStatus in the
// SDK's constants (stable wire values documented in the Node API reference).
export const VALIDATION_NAMES = {
  0: "OK",
  1: "NO_FACE_FOUND",
  2: "MULTIPLE_FACES_FOUND",
  3: "FACE_NOT_CENTERED",
  4: "FACE_SIZE_OUT_OF_RANGE",
  5: "TOO_DARK",
  6: "TOO_BRIGHT",
  7: "CHEST_NOT_VISIBLE",
  10: "CAMERA_TUNING",
  11: "FRAME_RATE_TOO_LOW",
  12: "EXCESSIVE_MOTION",
  13: "FACE_TOO_CLOSE",
  14: "FACE_TOO_FAR",
  15: "FACE_TOO_HIGH",
  16: "FACE_TOO_LOW",
  17: "FACE_NOT_FORWARD",
};
export const ERROR_NAMES = {
  0: "OK",
  1: "INVALID_STATE",
  2: "AUTHENTICATION_FAILED",
  3: "CONFIGURATION_FAILED",
  4: "CREDIT_EXHAUSTED",
  5: "NETWORK_ERROR",
  6: "SERVER_ERROR",
  7: "INPUT_UNAVAILABLE",
  8: "PROCESSING_FAILED",
  9: "FRAME_CONVERSION_FAILED",
  10: "NON_MONOTONIC_TIMESTAMP",
  11: "TIMESTAMP_GAP",
};
export const PROCESSING_NAMES = {
  0: "UNINITIALIZED",
  1: "IDLE",
  2: "STARTING",
  3: "RUNNING",
  4: "STOPPING",
  5: "ERROR",
};

export function encodeFrameHeader(width, height, timestampUs) {
  const header = new ArrayBuffer(FRAME_HEADER_BYTES);
  const view = new DataView(header);
  view.setUint32(0, FRAME_MAGIC, true);
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);
  view.setFloat64(8, timestampUs, true);
  return header;
}

/** Returns the frame, or a string describing why it was rejected. */
export function parseFrame(buffer) {
  if (buffer.byteLength < FRAME_HEADER_BYTES) return "short frame";
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== FRAME_MAGIC) return "bad frame magic";
  const width = view.getUint16(4, true);
  const height = view.getUint16(6, true);
  const timestampUs = view.getFloat64(8, true);
  if (!width || !height || width > MAX_FRAME_DIM || height > MAX_FRAME_DIM)
    return "frame size out of range";
  if (!Number.isSafeInteger(timestampUs) || timestampUs <= 0)
    return "frame timestamp invalid";
  const expected = FRAME_HEADER_BYTES + width * height * 4;
  if (buffer.byteLength !== expected) return "frame length mismatch";
  return {
    width,
    height,
    timestampUs,
    pixels: buffer.subarray(FRAME_HEADER_BYTES),
  };
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Reduce a decoded Metrics message (protobufjs toObject with longs: Number)
 * to the fields SpeakSense uses. Samples missing a timestamp or value are dropped.
 */
export function normalizeMetrics(decoded) {
  const cardio = decoded?.cardio ?? {};
  const pulse = (cardio.pulseRate ?? [])
    .filter((s) => finite(s?.value) && finite(Number(s?.timestamp)))
    .map((s) => ({
      value: s.value,
      confidence: finite(s.confidence) ? s.confidence : 0,
      stable: !!s.stable,
      timestampUs: Number(s.timestamp),
    }));
  const hrv = (cardio.hrv ?? [])
    .filter((s) => finite(Number(s?.timestamp)))
    .map((s) => ({
      rmssd: finite(s.rmssd) ? s.rmssd : null,
      sdnn: finite(s.sdnn) ? s.sdnn : null,
      confidence: finite(s.confidence) ? s.confidence : 0,
      stable: !!s.stable,
      timestampUs: Number(s.timestamp),
    }));
  return { pulse, hrv };
}

/**
 * Clearly-labelled development stand-in. Deterministic (no randomness), and every
 * message it produces carries source "mock". Never used unless --mock is passed.
 */
export function mockPulse(elapsedS) {
  if (elapsedS < 12) return { value: 0, confidence: 0, stable: false };
  // Slow drift plus a rise between 40s and 60s so correlation UI can be exercised.
  const rise = elapsedS > 40 && elapsedS < 60 ? 9 * Math.sin(((elapsedS - 40) / 20) * Math.PI) : 0;
  return {
    value: Math.round((72 + 2 * Math.sin(elapsedS / 7) + rise) * 10) / 10,
    confidence: 90,
    stable: true,
  };
}
