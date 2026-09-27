import type { Segment } from "../live/types.ts";
import type { AttemptPhysiology } from "./types.ts";
import { PULSE_WINDOW_S, median } from "./timeline.ts";

// SpeakSense thresholds for calling out a moment. Descriptive, not diagnostic.
export const PACE_WINDOW_S = 10;
export const PACE_STEP_S = 5;
export const PACE_CHANGE_RATIO = 0.2;
export const PACE_CHANGE_WPM = 20;
export const LONG_PAUSE_S = 1.5;
export const FILLER_CLUSTER_S = 8;
/** Pulse must differ from baseline by at least this much to be called "above"/"below". */
export const PULSE_DELTA_BPM = 6;
const OPENING_S = 30;
const FILLER = /^(u+m+|u+h+|e+r+m*|h+m+|m+m+)$/i;

export type Attempt = {
  segments: Segment[];
  duration: number;
  physiology?: AttemptPhysiology;
};
type TimedWord = { text: string; start: number; end: number };

const clean = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
export const clock = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
const round = (n: number) => Math.round(n);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(round(n))}`;

/** Word timing from the recognizer. Corrections change text, not the recorded timing. */
export function timedWords(segments: Segment[]): TimedWord[] {
  return segments
    .flatMap((s) => s.words)
    .filter((w) => w.type === "word" && /[\p{L}\p{N}]/u.test(w.text))
    .map((w) => ({ text: w.text, start: w.start, end: w.end }));
}

export function paceWindows(words: TimedWord[], duration: number) {
  const windows: { start: number; end: number; wpm: number; count: number }[] = [];
  for (let start = 0; start + PACE_WINDOW_S <= duration + 1e-6; start += PACE_STEP_S) {
    const end = start + PACE_WINDOW_S;
    const count = words.filter((w) => {
      const mid = (w.start + w.end) / 2;
      return mid >= start && mid < end;
    }).length;
    windows.push({ start, end, count, wpm: (count * 60) / PACE_WINDOW_S });
  }
  return windows;
}

/** Window-to-window pace variation (coefficient of variation, %) over speaking windows. */
export function paceVariation(words: TimedWord[], duration: number) {
  const w = paceWindows(words, duration).filter((x) => x.count > 0);
  if (w.length < 3) return null;
  const mean = w.reduce((s, x) => s + x.wpm, 0) / w.length;
  const sd = Math.sqrt(w.reduce((s, x) => s + (x.wpm - mean) ** 2, 0) / w.length);
  return mean ? (sd / mean) * 100 : null;
}

export type SpeechMoment = {
  kind: "pace-up" | "pace-down" | "fillers" | "pause";
  start: number;
  end: number;
  detail: string;
  excerpt: string;
};

function excerpt(words: TimedWord[], start: number, end: number) {
  const part = words.filter((w) => w.end >= start - 1 && w.start <= end + 1).slice(0, 14);
  return part.map((w) => w.text).join(" ");
}

export function speechMoments(segments: Segment[], duration: number): SpeechMoment[] {
  const words = timedWords(segments);
  const moments: SpeechMoment[] = [];
  const windows = paceWindows(words, duration);
  const speaking = windows.filter((w) => w.count > 0);
  const reference = speaking.length >= 3 ? median(speaking.map((w) => w.wpm)) : NaN;
  if (Number.isFinite(reference)) {
    let open: (SpeechMoment & { peak: number }) | undefined;
    for (const w of windows) {
      const kind =
        w.wpm >= reference * (1 + PACE_CHANGE_RATIO) && w.wpm - reference >= PACE_CHANGE_WPM
          ? "pace-up"
          : w.count > 0 &&
              w.wpm <= reference * (1 - PACE_CHANGE_RATIO) &&
              reference - w.wpm >= PACE_CHANGE_WPM
            ? "pace-down"
            : undefined;
      if (open && (kind !== open.kind || w.start > open.end)) {
        moments.push(open);
        open = undefined;
      }
      if (!kind) continue;
      const peak = open
        ? kind === "pace-up"
          ? Math.max(open.peak, w.wpm)
          : Math.min(open.peak, w.wpm)
        : w.wpm;
      open = {
        kind,
        start: open?.start ?? w.start,
        end: w.end,
        peak,
        detail: `${kind === "pace-up" ? "Your pace rose to" : "Your pace slowed to"} ${round(peak)} WPM (this take's median ${round(reference)} WPM).`,
        excerpt: "",
      };
    }
    if (open) moments.push(open);
  }
  const fillers = words.filter((w) => FILLER.test(clean(w.text)));
  for (let i = 0; i < fillers.length; ) {
    let j = i;
    while (j + 1 < fillers.length && fillers[j + 1].start - fillers[i].start <= FILLER_CLUSTER_S) j++;
    if (j > i)
      moments.push({
        kind: "fillers",
        start: fillers[i].start,
        end: fillers[j].end,
        detail: `${j - i + 1} filled pauses within ${Math.max(1, round(fillers[j].end - fillers[i].start))} seconds.`,
        excerpt: "",
      });
    i = j + 1;
  }
  words.slice(1).forEach((w, i) => {
    const gap = w.start - words[i].end;
    if (gap >= LONG_PAUSE_S)
      moments.push({
        kind: "pause",
        start: words[i].end,
        end: w.start,
        detail: `A ${gap.toFixed(1)}-second pause between “${words[i].text}” and “${w.text}”.`,
        excerpt: "",
      });
  });
  return moments
    .map(({ kind, start, end, detail }) => ({
      kind,
      start,
      end,
      detail,
      excerpt: excerpt(words, start, end),
    }))
    .sort((a, b) => a.start - b.start);
}

export type PulseContext = {
  status: "valid" | "low-confidence" | "none";
  bpm?: number;
  delta?: number;
  relation?: "above" | "below" | "near";
  samples: number;
};

/**
 * Pulse readings that describe [start, end]. Each reading is a 12-second average
 * ending at its timestamp, so readings up to 12 s after the moment still cover it.
 */
export function pulseContext(
  physiology: AttemptPhysiology | undefined,
  start: number,
  end: number,
): PulseContext {
  if (!physiology) return { status: "none", samples: 0 };
  const inWindow = physiology.samples.filter(
    (s) => s.t >= Math.max(0, start) && s.t <= end + PULSE_WINDOW_S,
  );
  const valid = inWindow.filter((s) => s.valid);
  if (!valid.length)
    return { status: inWindow.length ? "low-confidence" : "none", samples: 0 };
  const bpm = Math.round((valid.reduce((s, x) => s + x.bpm, 0) / valid.length) * 10) / 10;
  const base = physiology.baseline?.bpm;
  if (base === undefined) return { status: "valid", bpm, samples: valid.length };
  const delta = Math.round((bpm - base) * 10) / 10;
  return {
    status: "valid",
    bpm,
    delta,
    relation: delta >= PULSE_DELTA_BPM ? "above" : delta <= -PULSE_DELTA_BPM ? "below" : "near",
    samples: valid.length,
  };
}

export function pulseSentence(p: PulseContext, baseline?: number) {
  if (p.status === "none") return "No camera pulse reading covered this moment.";
  if (p.status === "low-confidence")
    return "Camera signal confidence was too low here to compare pulse.";
  if (baseline === undefined || p.delta === undefined)
    return `Pulse averaged ${round(p.bpm!)} BPM here; no pre-speech baseline to compare against.`;
  if (p.relation === "above")
    return `Pulse averaged ${round(p.bpm!)} BPM here, ${round(p.delta)} BPM above your pre-speech baseline of ${round(baseline)}.`;
  if (p.relation === "below")
    return `Pulse averaged ${round(p.bpm!)} BPM here, ${round(-p.delta)} BPM below your pre-speech baseline of ${round(baseline)}.`;
  return `Pulse stayed within ${PULSE_DELTA_BPM} BPM of your baseline here (${round(p.bpm!)} vs ${round(baseline)} BPM).`;
}

export type CombinedMoment = SpeechMoment & { pulse: PulseContext; physiology: string };

export function combinedMoments(attempt: Attempt): CombinedMoment[] {
  return speechMoments(attempt.segments, attempt.duration).map((m) => {
    const pulse = pulseContext(attempt.physiology, m.start, m.end);
    return {
      ...m,
      pulse,
      physiology: pulseSentence(pulse, attempt.physiology?.baseline?.bpm),
    };
  });
}

export type PhysiologySummary = {
  baseline?: number;
  mean?: number;
  min?: number;
  max?: number;
  validSpeaking: number;
  coverage: number;
  sufficient: boolean;
  /** Stretches where valid pulse stayed at least PULSE_DELTA_BPM above baseline. */
  elevated: { start: number; end: number; peak: number; peakDelta: number }[];
  excluded: Record<string, number>;
  issues: { name: string; hint: string; seconds: number }[];
};

export function physiologySummary(
  physiology: AttemptPhysiology,
  duration: number,
): PhysiologySummary {
  const speaking = physiology.samples.filter((s) => s.t >= 0);
  const valid = speaking.filter((s) => s.valid);
  const bpms = valid.map((s) => s.bpm);
  const base = physiology.baseline?.bpm;
  const excluded: Record<string, number> = {};
  for (const s of speaking) if (!s.valid && s.reason) excluded[s.reason] = (excluded[s.reason] ?? 0) + 1;
  const elevated: PhysiologySummary["elevated"] = [];
  if (base !== undefined) {
    let run: (typeof elevated)[number] | undefined;
    let lastT = -Infinity;
    for (const s of valid) {
      const d = s.bpm - base;
      if (d >= PULSE_DELTA_BPM && (!run || s.t - lastT <= 3)) {
        run = run ?? { start: s.t, end: s.t, peak: s.bpm, peakDelta: d };
        run.end = s.t;
        if (d > run.peakDelta) Object.assign(run, { peak: s.bpm, peakDelta: d });
      } else if (run) {
        elevated.push(run);
        run = d >= PULSE_DELTA_BPM ? { start: s.t, end: s.t, peak: s.bpm, peakDelta: d } : undefined;
      }
      lastT = s.t;
    }
    if (run) elevated.push(run);
  }
  const issueSeconds = new Map<string, { hint: string; seconds: number }>();
  const events = physiology.validation;
  events.forEach((e, i) => {
    if (e.code === 0) return;
    const from = Math.max(0, e.t),
      to = Math.min(duration, events[i + 1]?.t ?? duration);
    if (to <= from) return;
    const prev = issueSeconds.get(e.name) ?? { hint: e.hint, seconds: 0 };
    prev.seconds += to - from;
    issueSeconds.set(e.name, prev);
  });
  return {
    baseline: base,
    mean: bpms.length ? Math.round((bpms.reduce((a, b) => a + b, 0) / bpms.length) * 10) / 10 : undefined,
    min: bpms.length ? Math.min(...bpms) : undefined,
    max: bpms.length ? Math.max(...bpms) : undefined,
    validSpeaking: valid.length,
    coverage: physiology.coverage,
    sufficient: valid.length >= 3 && physiology.coverage >= 0.3,
    elevated,
    excluded,
    issues: [...issueSeconds]
      .map(([name, v]) => ({ name, hint: v.hint, seconds: Math.round(v.seconds) }))
      .filter((x) => x.seconds >= 1)
      .sort((a, b) => b.seconds - a.seconds),
  };
}

function openingDelta(p?: AttemptPhysiology) {
  if (!p?.baseline) return null;
  const v = p.samples.filter((s) => s.valid && s.t >= 0 && s.t <= OPENING_S);
  if (v.length < 2) return null;
  return v.reduce((s, x) => s + x.bpm, 0) / v.length - p.baseline.bpm;
}

/** Factual differences between two takes, stated only when both carry enough data. */
export function compareAttempts(first: Attempt, second: Attempt) {
  const statements: string[] = [];
  const va = paceVariation(timedWords(first.segments), first.duration),
    vb = paceVariation(timedWords(second.segments), second.duration);
  if (va !== null && vb !== null) {
    const diff = vb - va;
    statements.push(
      Math.abs(diff) >= 5
        ? `Attempt 2's pace was ${diff < 0 ? "more" : "less"} consistent: window-to-window variation ${round(vb)}% vs ${round(va)}%.`
        : `Pace consistency was similar (window-to-window variation ${round(va)}% vs ${round(vb)}%).`,
    );
  } else statements.push("Not enough timed speech in both takes to compare pace consistency.");
  const pa = first.physiology,
    pb = second.physiology;
  if (!pa || !pb) {
    statements.push("Camera physiology was not recorded for both takes, so pulse is not compared.");
  } else if (pa.source !== pb.source) {
    statements.push("One take used mock physiology and the other real Presage data; pulse is not compared.");
  } else {
    const da = openingDelta(pa),
      db = openingDelta(pb);
    if (da === null || db === null)
      statements.push(
        "Pulse during the opening 30 seconds can't be compared: at least one take lacks a baseline or confident readings there.",
      );
    else if (Math.abs(db - da) >= 3)
      statements.push(
        `Attempt 2 had a ${Math.abs(db) < Math.abs(da) ? "smaller" : "larger"} pulse change during the opening 30 seconds (${signed(db)} vs ${signed(da)} BPM relative to each take's own baseline).`,
      );
    else
      statements.push(
        `Opening pulse change relative to baseline was similar (${signed(da)} vs ${signed(db)} BPM).`,
      );
  }
  return {
    statements,
    variation: [va, vb] as const,
    openingDelta: [openingDelta(pa), openingDelta(pb)] as const,
  };
}
