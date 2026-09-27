/** Where physiology came from. "mock" is a labelled development stand-in, never measured. */
export type PhysioSource = "presage" | "mock";

export type PresageState =
  | "off"
  | "camera"
  | "connecting"
  | "calibrating"
  | "ready"
  | "unavailable";

/** One pulse-rate sample (a 12-second rolling average per Presage's model card). */
export type PulseSample = {
  /** Seconds on the page's performance clock (performance.now() / 1000). */
  t: number;
  bpm: number;
  /** Presage confidence, 0–100. */
  confidence: number;
  stable: boolean;
  valid: boolean;
  /** Why an invalid sample was excluded. */
  reason?: "warmup" | "low-confidence" | "unstable" | "signal" | "out-of-range";
  /** "arrival" means the SDK timestamp did not match sent frames and receipt time was used. */
  timebase: "frame" | "arrival";
};

export type ValidationEvent = { t: number; code: number; name: string; hint: string };

export type PresageErrorInfo = {
  code: number;
  name: string;
  message: string;
  retryable: boolean;
};

export type Baseline = {
  bpm: number;
  samples: number;
  spanS: number;
  /** True when no fresh pre-speech window existed and the previous take's baseline was reused. */
  carried: boolean;
};

/** Physiology attached to one SpeakSense attempt. Times are seconds from speech capture start. */
export type AttemptPhysiology = {
  source: PhysioSource;
  sdkVersion: string | null;
  baseline: Baseline | null;
  /** Pulse samples from the baseline window through the end of speech (t < 0 = before speech). */
  samples: Omit<PulseSample, "timebase">[];
  validation: ValidationEvent[];
  /** Fraction (0–1) of speaking seconds covered by a valid pulse sample. */
  coverage: number;
  arrivalTimed: number;
  errors: string[];
};
