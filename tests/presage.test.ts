import test from "node:test";
import assert from "node:assert/strict";
import {
  FrameClock,
  alignSample,
  classifySample,
  clockToEpochUs,
  computeBaseline,
  coverage,
  epochUsToClock,
  signalOkFraction,
  sliceAttempt,
} from "../lib/presage/timeline.ts";
import {
  combinedMoments,
  compareAttempts,
  physiologySummary,
  pulseContext,
  speechMoments,
} from "../lib/presage/correlate.ts";
import type { AttemptPhysiology, PulseSample, ValidationEvent } from "../lib/presage/types.ts";
import type { Segment } from "../lib/live/types.ts";
import {
  encodeFrameHeader,
  mockPulse,
  normalizeMetrics,
  parseFrame,
  FRAME_HEADER_BYTES,
} from "../presage-bridge/protocol.mjs";

const origin = 1000; // speech time zero on the performance clock (seconds)
const timeOrigin = 1_790_000_000_000; // performance.timeOrigin (epoch ms)

function sample(t: number, bpm: number, valid = true): PulseSample {
  return { t, bpm, confidence: valid ? 90 : 10, stable: true, valid, timebase: "frame", reason: valid ? undefined : "low-confidence" };
}
/** Words at a steady rate in [from, to), `wps` words per second. */
function words(from: number, to: number, wps: number, text = "word") {
  const out = [];
  for (let t = from; t < to; t += 1 / wps) out.push({ text, start: t, end: t + 0.8 / wps, type: "word" });
  return out;
}
function segment(ws: ReturnType<typeof words>): Segment {
  return {
    id: `s-${ws[0].start}`,
    text: ws.map((w) => w.text).join(" "),
    originalText: "",
    words: ws,
    start: ws[0].start,
    end: ws.at(-1)!.end,
    receivedAt: 0,
    language: "en",
  };
}

test("frame timestamps round-trip between epoch µs and the performance clock", () => {
  const us = clockToEpochUs(origin + 12.5, timeOrigin);
  assert.ok(Math.abs(epochUsToClock(us, timeOrigin) - (origin + 12.5)) < 1e-6);
});

test("frame clock is strictly monotonic even when the page clock repeats", () => {
  const c = new FrameClock(timeOrigin);
  const a = c.next(5),
    b = c.next(5),
    d = c.next(4.9);
  assert.ok(a < b && b < d);
  assert.equal(c.first, a);
});

test("samples align to frame time; mismatched SDK timestamps fall back to arrival", () => {
  const sent = { first: clockToEpochUs(origin, timeOrigin), last: clockToEpochUs(origin + 30, timeOrigin) };
  const inRange = alignSample(clockToEpochUs(origin + 20, timeOrigin), sent, origin + 21, timeOrigin);
  assert.equal(inRange.timebase, "frame");
  assert.ok(Math.abs(inRange.t - (origin + 20)) < 1e-6);
  const wallClock = alignSample(5e15, sent, origin + 21, timeOrigin);
  assert.deepEqual(wallClock, { t: origin + 21, timebase: "arrival" });
});

test("validation OK fraction integrates non-OK spans and is unknown without events", () => {
  const events: ValidationEvent[] = [
    { t: 0, code: 0, name: "OK", hint: "" },
    { t: 4, code: 5, name: "TOO_DARK", hint: "" },
    { t: 7, code: 0, name: "OK", hint: "" },
  ];
  assert.equal(signalOkFraction(events, 0, 12), 0.75);
  assert.equal(signalOkFraction([], 0, 12), null);
});

test("pulse samples need warm-up, range, confidence, stability and a good signal", () => {
  const ok: ValidationEvent[] = [{ t: 0, code: 0, name: "OK", hint: "" }];
  const base = { t: 20, bpm: 75, confidence: 90, stable: true };
  assert.deepEqual(classifySample(base, ok, 0), { valid: true });
  assert.equal(classifySample({ ...base, t: 8 }, ok, 0).reason, "warmup");
  assert.equal(classifySample({ ...base, bpm: 130 }, ok, 0).reason, "out-of-range");
  assert.equal(classifySample({ ...base, confidence: 20 }, ok, 0).reason, "low-confidence");
  assert.equal(classifySample({ ...base, stable: false }, ok, 0).reason, "unstable");
  const dark: ValidationEvent[] = [...ok, { t: 10, code: 5, name: "TOO_DARK", hint: "" }];
  assert.equal(classifySample(base, dark, 0).reason, "signal");
});

test("baseline is the median of valid pre-speech readings and excludes earlier takes", () => {
  const samples = [
    ...[-30, -25, -20, -15, -10, -5].map((d) => sample(origin + d, 70 + (d % 2 ? 1 : 0))),
    sample(origin - 12, 99, false),
  ];
  const b = computeBaseline(samples, origin, []);
  assert.ok(b);
  assert.equal(b.samples, 6);
  assert.ok(b.bpm >= 70 && b.bpm <= 71);
  // Readings up to 12 s after an earlier take still average that take's speech.
  const withTake = computeBaseline(samples, origin, [[origin - 60, origin - 40]]);
  assert.equal(withTake?.samples, 5);
  assert.equal(computeBaseline(samples, origin, [[origin - 60, origin - 16]]), null);
  assert.equal(computeBaseline(samples.slice(0, 2), origin, []), null);
});

test("attempt slices are re-based to speech start and report coverage", () => {
  const samples = [
    sample(origin - 20, 70),
    sample(origin - 10, 71),
    ...Array.from({ length: 30 }, (_, i) => sample(origin + i, 80, i < 20)),
    sample(origin + 200, 90),
  ];
  const p = sliceAttempt({
    samples,
    validation: [{ t: origin - 100, code: 0, name: "OK", hint: "" }],
    origin,
    duration: 30,
    baseline: null,
    source: "presage",
    sdkVersion: "3.3.0",
    errors: [],
  });
  assert.equal(p.samples[0].t, -20);
  assert.ok(p.samples.every((s) => s.t <= 30.5));
  assert.equal(p.validation[0].t, -45);
  assert.equal(p.coverage, 21 / 30); // valid readings at 0–19 s cover bins 0–20 (±2 s)
  assert.equal(coverage([], 10), 0);
});

function physio(overrides: Partial<AttemptPhysiology> = {}): AttemptPhysiology {
  return {
    source: "presage",
    sdkVersion: "3.3.0",
    baseline: { bpm: 72, samples: 8, spanS: 20, carried: false },
    samples: [
      ...Array.from({ length: 40 }, (_, i) => ({ t: i, bpm: i >= 20 && i < 32 ? 84 : 73, confidence: 90, stable: true, valid: true })),
    ],
    validation: [{ t: -45, code: 0, name: "OK", hint: "" }],
    coverage: 1,
    arrivalTimed: 0,
    errors: [],
    ...overrides,
  };
}

test("speech moments find a pace increase, filler cluster and long pause", () => {
  const segs = [
    segment(words(0, 20, 2)),
    segment(words(20, 30, 3.5)),
    segment([
      { text: "um", start: 31, end: 31.3, type: "word" },
      { text: "uh", start: 33, end: 33.3, type: "word" },
    ]),
    segment(words(36, 40, 2)),
  ];
  const kinds = speechMoments(segs, 40).map((m) => m.kind);
  assert.ok(kinds.includes("pace-up"));
  assert.ok(kinds.includes("fillers"));
  assert.ok(kinds.includes("pause"));
});

test("pulse context compares against the attempt's own baseline", () => {
  const p = physio();
  const above = pulseContext(p, 20, 22);
  assert.equal(above.status, "valid");
  assert.equal(above.relation, "above");
  assert.equal(pulseContext(p, 0, 2).relation, "near");
  const low = physio({ samples: [{ t: 5, bpm: 70, confidence: 5, stable: true, valid: false, reason: "low-confidence" }] });
  assert.equal(pulseContext(low, 4, 6).status, "low-confidence");
  assert.equal(pulseContext(undefined, 0, 1).status, "none");
  const noBaseline = pulseContext(physio({ baseline: null }), 20, 22);
  assert.equal(noBaseline.relation, undefined);
});

test("combined moments never claim anxiety or stress", () => {
  const segs = [segment(words(0, 20, 2)), segment(words(20, 30, 3.5)), segment(words(30, 40, 2))];
  const moments = combinedMoments({ segments: segs, duration: 40, physiology: physio() });
  const pace = moments.find((m) => m.kind === "pace-up")!;
  assert.match(pace.physiology, /above your pre-speech baseline of 72/);
  for (const m of moments) assert.doesNotMatch(m.detail + m.physiology, /anxi|stress|nervous|emotion/i);
});

test("summary finds elevated stretches and comparisons need data in both takes", () => {
  const s = physiologySummary(physio(), 40);
  assert.equal(s.elevated.length, 1);
  assert.equal(s.elevated[0].start, 20);
  assert.equal(s.sufficient, true);
  const segs = [segment(words(0, 40, 2))];
  const a = { segments: segs, duration: 40, physiology: physio() };
  const calm = physio({ samples: Array.from({ length: 40 }, (_, i) => ({ t: i, bpm: 73, confidence: 90, stable: true, valid: true })) });
  const b = { segments: segs, duration: 40, physiology: calm };
  const c = compareAttempts(a, b);
  assert.ok(c.statements.some((x) => /similar/.test(x)));
  const none = compareAttempts(a, { segments: segs, duration: 40 });
  assert.ok(none.statements.some((x) => /not recorded for both/.test(x)));
  const mixed = compareAttempts(a, { ...b, physiology: { ...calm, source: "mock" } });
  assert.ok(mixed.statements.some((x) => /mock/.test(x)));
});

test("bridge frame header round-trips and rejects malformed frames", () => {
  const w = 4,
    h = 2,
    ts = 1_790_000_000_123_456;
  const buf = new Uint8Array(FRAME_HEADER_BYTES + w * h * 4);
  buf.set(new Uint8Array(encodeFrameHeader(w, h, ts)));
  const frame = parseFrame(Buffer.from(buf));
  assert.ok(typeof frame !== "string");
  assert.equal(frame.width, w);
  assert.equal(frame.timestampUs, ts);
  assert.equal(frame.pixels.length, w * h * 4);
  assert.equal(parseFrame(Buffer.from(buf.subarray(0, 20))), "frame length mismatch");
  assert.equal(parseFrame(Buffer.alloc(8)), "short frame");
});

test("bridge normalizes decoded metrics and mock values are deterministic", () => {
  const n = normalizeMetrics({
    cardio: {
      pulseRate: [{ value: 71.5, confidence: 88, stable: true, timestamp: 1790000000000000 }, { value: NaN, timestamp: 1 }],
      hrv: [{ rmssd: 30, sdnn: 40, confidence: 0, stable: false, timestamp: 1790000000000000 }],
    },
  });
  assert.equal(n.pulse.length, 1);
  assert.equal(n.pulse[0].timestampUs, 1790000000000000);
  assert.equal(n.hrv[0].rmssd, 30);
  assert.deepEqual(normalizeMetrics({}), { pulse: [], hrv: [] });
  assert.deepEqual(mockPulse(30), mockPulse(30));
  assert.equal(mockPulse(5).confidence, 0);
});
