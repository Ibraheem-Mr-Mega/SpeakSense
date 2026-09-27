import type {
  AttemptPhysiology,
  Baseline,
  PhysioSource,
  PulseSample,
  ValidationEvent,
} from "./types.ts";

// Values from Presage's model card / measurement-quality guide.
/** Pulse rate is a 12-second average; confidence is 0 until this window has filled. */
export const PULSE_WINDOW_S = 12;
/** Documented operating range for pulse rate. */
export const PULSE_RANGE = [40, 110] as const;
// SpeakSense thresholds (not Presage values). Kept conservative on purpose.
export const MIN_CONFIDENCE = 50;
export const SIGNAL_OK_FRACTION = 0.75;
export const BASELINE_LOOKBACK_S = 45;
export const BASELINE_MIN_SAMPLES = 3;
export const BASELINE_MIN_SPAN_S = 4;

/**
 * Frames are stamped with epoch microseconds derived from the page's performance
 * clock (timeOrigin + now), the same clock LiveSession uses. That keeps Presage
 * samples and ASR word times on one session timeline.
 */
export const clockToEpochUs = (clockS: number, timeOrigin: number) =>
  Math.round((timeOrigin + clockS * 1000) * 1000);
export const epochUsToClock = (epochUs: number, timeOrigin: number) =>
  (epochUs / 1000 - timeOrigin) / 1000;

/** Strictly increasing frame timestamps (the SDK rejects non-monotonic input). */
export class FrameClock {
  private last = 0;
  first = 0;
  constructor(private timeOrigin: number) {}
  next(clockS: number) {
    let us = clockToEpochUs(clockS, this.timeOrigin);
    if (us <= this.last) us = this.last + 1;
    this.last = us;
    if (!this.first) this.first = us;
    return us;
  }
  get latest() {
    return this.last;
  }
}

/**
 * SDK sample timestamps should echo the frame timestamps we sent. If one falls
 * outside the range of sent frames, fall back to receipt time and say so.
 */
export function alignSample(
  timestampUs: number,
  sent: { first: number; last: number },
  arrivalClockS: number,
  timeOrigin: number,
): { t: number; timebase: "frame" | "arrival" } {
  if (sent.first && timestampUs >= sent.first - 2e6 && timestampUs <= sent.last + 2e6)
    return { t: epochUsToClock(timestampUs, timeOrigin), timebase: "frame" };
  return { t: arrivalClockS, timebase: "arrival" };
}

/** Share of [from, to] during which validation was OK; null if no status was ever reported. */
export function signalOkFraction(events: ValidationEvent[], from: number, to: number) {
  if (to <= from) return null;
  let state: number | undefined;
  let cursor = from;
  let bad = 0;
  let known = false;
  for (const e of events) {
    if (e.t <= from) {
      state = e.code;
      known = true;
      continue;
    }
    if (e.t >= to) break;
    if (state !== undefined && state !== 0) bad += e.t - cursor;
    cursor = e.t;
    state = e.code;
    known = true;
  }
  if (!known) return null;
  if (state !== undefined && state !== 0) bad += to - cursor;
  return 1 - bad / (to - from);
}

export function classifySample(
  raw: { t: number; bpm: number; confidence: number; stable: boolean },
  validation: ValidationEvent[],
  sdkStartedAt: number,
): Pick<PulseSample, "valid" | "reason"> {
  if (raw.t - sdkStartedAt < PULSE_WINDOW_S) return { valid: false, reason: "warmup" };
  if (raw.bpm < PULSE_RANGE[0] || raw.bpm > PULSE_RANGE[1])
    return { valid: false, reason: "out-of-range" };
  if (raw.confidence < MIN_CONFIDENCE) return { valid: false, reason: "low-confidence" };
  if (!raw.stable) return { valid: false, reason: "unstable" };
  const ok = signalOkFraction(validation, raw.t - PULSE_WINDOW_S, raw.t);
  if (ok !== null && ok < SIGNAL_OK_FRACTION) return { valid: false, reason: "signal" };
  return { valid: true };
}

export function median(values: number[]) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Baseline = median valid pulse in the quiet window before speech starts.
 * Samples whose 12-second window overlaps an earlier take are excluded, so a
 * retry never inherits speaking-period readings as its baseline.
 */
export function computeBaseline(
  samples: PulseSample[],
  origin: number,
  earlierTakes: [number, number][],
): Baseline | null {
  const pool = samples.filter(
    (s) =>
      s.valid &&
      s.t >= origin - BASELINE_LOOKBACK_S &&
      s.t <= origin &&
      !earlierTakes.some(([a, b]) => s.t >= a && s.t <= b + PULSE_WINDOW_S),
  );
  if (pool.length < BASELINE_MIN_SAMPLES) return null;
  const span = pool.at(-1)!.t - pool[0].t;
  if (span < BASELINE_MIN_SPAN_S) return null;
  return {
    bpm: Math.round(median(pool.map((s) => s.bpm)) * 10) / 10,
    samples: pool.length,
    spanS: Math.round(span * 10) / 10,
    carried: false,
  };
}

/** Fraction of 1-second speaking bins that have a valid sample within 2 seconds. */
export function coverage(samples: { t: number; valid: boolean }[], duration: number) {
  const bins = Math.ceil(duration);
  if (!bins) return 0;
  const valid = samples.filter((s) => s.valid).map((s) => s.t);
  let covered = 0;
  for (let i = 0; i < bins; i++) {
    const mid = i + 0.5;
    if (valid.some((t) => Math.abs(t - mid) <= 2)) covered++;
  }
  return covered / bins;
}

/** Cut one attempt out of the continuous camera session and re-base times to speech start. */
export function sliceAttempt(input: {
  samples: PulseSample[];
  validation: ValidationEvent[];
  origin: number;
  duration: number;
  baseline: Baseline | null;
  source: PhysioSource;
  sdkVersion: string | null;
  errors: string[];
}): AttemptPhysiology {
  const { origin, duration } = input;
  const from = origin - BASELINE_LOOKBACK_S,
    to = origin + duration + 0.5;
  const samples = input.samples
    .filter((s) => s.t >= from && s.t <= to)
    .map((s) => ({
      t: Math.round((s.t - origin) * 100) / 100,
      bpm: s.bpm,
      confidence: s.confidence,
      stable: s.stable,
      valid: s.valid,
      reason: s.reason,
    }));
  const prior = input.validation.filter((e) => e.t < from).at(-1);
  const validation = [
    ...(prior ? [{ ...prior, t: from }] : []),
    ...input.validation.filter((e) => e.t >= from && e.t <= to),
  ].map((e) => ({ ...e, t: Math.round((e.t - origin) * 100) / 100 }));
  return {
    source: input.source,
    sdkVersion: input.sdkVersion,
    baseline: input.baseline,
    samples,
    validation,
    coverage: coverage(
      samples.filter((s) => s.t >= 0),
      duration,
    ),
    arrivalTimed: input.samples.filter((s) => s.t >= from && s.t <= to && s.timebase === "arrival")
      .length,
    errors: [...input.errors],
  };
}
