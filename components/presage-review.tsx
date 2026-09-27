"use client";
import { useMemo, useRef, useState } from "react";
import type { SessionResult } from "@/lib/live/types";
import type { AttemptPhysiology } from "@/lib/presage/types";
import {
  clock,
  combinedMoments,
  compareAttempts,
  physiologySummary,
  PULSE_DELTA_BPM,
  type CombinedMoment,
} from "@/lib/presage/correlate";
import { PULSE_WINDOW_S } from "@/lib/presage/timeline";
import { VALIDATION_ADVICE } from "@/lib/presage/service";
import { SourceBadge } from "./presage-panel";

const REASONS: Record<string, string> = {
  warmup: "warming up",
  "low-confidence": "low confidence",
  unstable: "unstable detection",
  signal: "camera signal issue",
  "out-of-range": "outside 40–110 BPM",
};
const KIND: Record<CombinedMoment["kind"], string> = {
  "pace-up": "Faster pace",
  "pace-down": "Slower pace",
  fillers: "Filled pauses",
  pause: "Long pause",
};

const W = 720,
  H = 190,
  PAD = { l: 40, r: 16, t: 22, b: 26 };

/** Single-series pulse line on the session timeline, with baseline and delivery moments. */
function PulseChart({ physiology, duration, moments }: {
  physiology: AttemptPhysiology;
  duration: number;
  moments: CombinedMoment[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const valid = physiology.samples.filter((s) => s.valid);
  const base = physiology.baseline?.bpm;
  const t0 = Math.max(-30, Math.min(0, physiology.samples[0]?.t ?? 0));
  const values = [...valid.map((s) => s.bpm), ...(base !== undefined ? [base] : [])];
  if (!values.length) return null;
  const lo = Math.floor((Math.min(...values) - 4) / 5) * 5,
    hi = Math.ceil((Math.max(...values) + 4) / 5) * 5;
  const x = (t: number) => PAD.l + ((t - t0) / (duration - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  // Break the line wherever readings were missing or excluded, so gaps stay visible.
  const paths: string[] = [];
  let d = "";
  let last = -Infinity;
  for (const s of physiology.samples) {
    if (s.t < t0) continue;
    if (!s.valid || s.t - last > 3) {
      if (d) paths.push(d);
      d = "";
    }
    if (s.valid) {
      d += `${d ? "L" : "M"}${x(s.t).toFixed(1)},${y(s.bpm).toFixed(1)}`;
      last = s.t;
    }
  }
  if (d) paths.push(d);
  const step = hi - lo <= 25 ? 5 : 10;
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  // Moment numbers sit above the plot; nudge right so neighbours never overlap.
  const labelX: number[] = [];
  moments.forEach((m, i) => labelX.push(Math.max(x(m.start) + 2, i ? labelX[i - 1] + 14 : -Infinity)));
  const xTicks = Array.from({ length: Math.floor(duration / 15) + 1 }, (_, i) => i * 15);
  const near = hover
    ? physiology.samples.reduce<(typeof physiology.samples)[number] | undefined>(
        (best, s) => (!best || Math.abs(s.t - hover.t) < Math.abs(best.t - hover.t) ? s : best),
        undefined,
      )
    : undefined;
  const hoverMoments = hover ? moments.filter((m) => hover.t >= m.start - 1 && hover.t <= m.end + 1) : [];
  function move(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * (W - PAD.l - PAD.r);
    const t = t0 + (px / (W - PAD.l - PAD.r)) * (duration - t0);
    const outer = box.current?.getBoundingClientRect();
    const left = e.clientX - (outer?.left ?? 0) + 12;
    // Keep the tooltip inside the chart; measured here, not during render.
    setHover({ x: Math.max(0, Math.min(left, (outer?.width ?? 300) - 190)), t });
  }
  return (
    <div className="pulse-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pulse over the session. Details are in the moments list below.">
        {moments.map((m, i) => (
          <g key={i}>
            <rect className="moment-band" x={x(m.start)} y={PAD.t} width={Math.max(2, x(m.end) - x(m.start))} height={H - PAD.t - PAD.b} />
            <text className="chart-muted" x={labelX[i]} y={PAD.t - 8}>{i + 1}</text>
          </g>
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="chart-muted" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} className="chart-muted" x={x(t)} y={H - 8} textAnchor="middle">{clock(t)}</text>
        ))}
        {t0 < 0 && (
          <g>
            <line className="chart-axis" x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} />
            <text className="chart-muted" x={x(t0) + 2} y={H - PAD.b - 6}>before speech</text>
          </g>
        )}
        {base !== undefined && (
          <g>
            <line className="chart-baseline" x1={PAD.l} x2={W - PAD.r} y1={y(base)} y2={y(base)} />
            <text className="chart-label" x={W - PAD.r} y={y(base) - 6} textAnchor="end">Baseline {Math.round(base)}</text>
          </g>
        )}
        {paths.map((p, i) => (
          <path key={i} className="chart-line" d={p} />
        ))}
        {hover && near && (
          <g>
            <line className="chart-axis" x1={x(hover.t)} x2={x(hover.t)} y1={PAD.t} y2={H - PAD.b} />
            {near.valid && <circle className="chart-dot" cx={x(near.t)} cy={y(near.bpm)} r={4} />}
          </g>
        )}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={W - PAD.l - PAD.r}
          height={H - PAD.t - PAD.b}
          fill="transparent"
          onPointerMove={move}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover && near && (
        <div className="chart-tooltip" style={{ left: hover.x }}>
          <strong>{near.valid ? `${Math.round(near.bpm)} BPM` : "No confident reading"}</strong>
          <span>
            {clock(Math.abs(near.t))}
            {near.t < 0 ? " before speech" : ""}
            {near.valid && base !== undefined ? ` · ${near.bpm - base >= 0 ? "+" : "−"}${Math.abs(Math.round(near.bpm - base))} vs baseline` : ""}
            {!near.valid && near.reason ? ` · ${REASONS[near.reason]}` : ""}
          </span>
          {hoverMoments.map((m, i) => (
            <span key={i}>{KIND[m.kind]}</span>
          ))}
        </div>
      )}
      <p className="small">
        Line = Presage pulse (12-second rolling average). Gaps = no confident reading. Numbered bands = delivery moments below.
      </p>
    </div>
  );
}

export function PhysiologyReview({ result, onPlay }: { result: SessionResult; onPlay: (t: number) => void }) {
  const physiology = result.physiology!;
  const summary = useMemo(() => physiologySummary(physiology, result.duration), [physiology, result.duration]);
  const moments = useMemo(
    () => combinedMoments({ segments: result.segments, duration: result.duration, physiology }),
    [result.segments, result.duration, physiology],
  );
  const b = physiology.baseline;
  return (
    <section className="physio-review" aria-label="Camera physiology context">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CAMERA CONTEXT · PRESAGE SMARTSPECTRA</p>
          <h3>Delivery and pulse on one timeline</h3>
        </div>
        <SourceBadge source={physiology.source} unavailable={!summary.validSpeaking && !b} />
      </div>
      {physiology.source === "mock" && (
        <p className="notice">
          <strong>Mock physiology.</strong> These values come from the bridge&apos;s labelled mock mode
          (<code>pnpm presage:mock</code>) and were not measured from your camera.
        </p>
      )}
      <div className="metric-row">
        <div>
          <strong>{b ? Math.round(b.bpm) : "—"}</strong>
          <span>
            {b
              ? b.carried
                ? "baseline BPM · carried from your previous take"
                : `baseline BPM · median of ${b.samples} readings before you spoke`
              : "baseline not established before speaking"}
          </span>
        </div>
        <div>
          <strong>{summary.mean !== undefined ? Math.round(summary.mean) : "—"}</strong>
          <span>
            {summary.mean !== undefined
              ? `avg BPM while speaking · range ${Math.round(summary.min!)}–${Math.round(summary.max!)}`
              : "no confident pulse while speaking"}
          </span>
        </div>
        <div>
          <strong>{Math.round(summary.coverage * 100)}%</strong>
          <span>of speaking time with a confident reading</span>
        </div>
        <div>
          <strong>{summary.elevated.length}</strong>
          <span>stretch{summary.elevated.length === 1 ? "" : "es"} ≥{PULSE_DELTA_BPM} BPM above baseline</span>
        </div>
      </div>
      {!summary.sufficient && (
        <p className="notice" role="status">
          Camera signal confidence was too low for most of this take, so pulse comparisons are limited.
          {summary.issues[0] &&
            ` Most common issue: ${VALIDATION_ADVICE[summary.issues[0].name] ?? summary.issues[0].hint} (${summary.issues[0].seconds}s).`}
        </p>
      )}
      <PulseChart physiology={physiology} duration={result.duration} moments={moments} />
      {summary.elevated.length > 0 && (
        <>
          <h4>Pulse changes on the timeline</h4>
          <ul className="physio-list">
            {summary.elevated.map((e, i) => (
              <li key={i}>
                <strong>
                  {clock(e.start)}–{clock(e.end)}
                </strong>{" "}
                pulse stayed at least {PULSE_DELTA_BPM} BPM above your baseline (peak {Math.round(e.peak)} BPM, +
                {Math.round(e.peakDelta)}).
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Delivery moments with pulse context</h4>
      {moments.length === 0 ? (
        <p className="small">No pace shifts, filler clusters or long pauses stood out in the recognized words.</p>
      ) : (
        <ol className="physio-moments">
          {moments.map((m, i) => (
            <li key={i}>
              <div className="section-heading">
                <strong>
                  {i + 1}. {clock(m.start)} · {KIND[m.kind]}
                </strong>
                <span className={`pill pulse-${m.pulse.relation ?? m.pulse.status}`}>
                  {m.pulse.status === "valid"
                    ? m.pulse.relation
                      ? m.pulse.relation === "near"
                        ? "Pulse near baseline"
                        : `Pulse ${m.pulse.relation} baseline`
                      : `Pulse ${Math.round(m.pulse.bpm!)} BPM`
                    : m.pulse.status === "low-confidence"
                      ? "Low camera confidence"
                      : "No pulse reading"}
                </span>
              </div>
              <p>
                {m.detail} {m.physiology}
              </p>
              {m.excerpt && <blockquote>“{m.excerpt}”</blockquote>}
              <button className="text-button" onClick={() => onPlay(Math.max(0, m.start - 1))}>
                Play {clock(m.start)}
              </button>
            </li>
          ))}
        </ol>
      )}
      {summary.issues.length > 0 && (
        <p className="small">
          Camera signal while speaking:{" "}
          {summary.issues
            .slice(0, 3)
            .map((x) => `${VALIDATION_ADVICE[x.name] ?? x.hint} (${x.seconds}s)`)
            .join(" · ")}
          .
        </p>
      )}
      <p className="small">
        Pulse is Presage&apos;s {PULSE_WINDOW_S}-second rolling average, so it trails what you said by a few seconds.
        Readings count only when Presage confidence is at least 50, the detection is stable, the camera signal was OK
        for most of the window, and the value is inside Presage&apos;s documented 40–110 BPM range. Breathing rate is not
        used because Presage does not measure it while you talk. This shows co-occurrence, not cause: SpeakSense does
        not infer stress, anxiety or emotion, and these wellness metrics are not medical measurements.
      </p>
      <details className="diagnostics">
        <summary>Physiology diagnostics</summary>
        <p>
          Source: {physiology.source === "mock" ? "mock (not measured)" : `Presage SmartSpectra SDK ${physiology.sdkVersion ?? ""}`} ·{" "}
          {physiology.samples.length} readings in window · excluded while speaking:{" "}
          {Object.entries(summary.excluded)
            .map(([k, v]) => `${REASONS[k] ?? k} ${v}`)
            .join(", ") || "none"}
          {physiology.arrivalTimed > 0 &&
            ` · ${physiology.arrivalTimed} readings used receipt time because their SDK timestamp did not match sent frames`}
          .
        </p>
        {physiology.errors.length > 0 && (
          <ul>
            {physiology.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

export function PhysiologyComparison({ first, second }: { first: SessionResult; second: SessionResult }) {
  const c = compareAttempts(first, second);
  const row = (label: string, f: (r: SessionResult, i: 0 | 1) => string) => (
    <tr>
      <th scope="row">{label}</th>
      <td>{f(first, 0)}</td>
      <td>{f(second, 1)}</td>
    </tr>
  );
  const fmt = (n: number | null | undefined, unit = "") =>
    n === null || n === undefined
      ? "—"
      : `${unit === " BPM Δ" ? (n >= 0 ? "+" : "−") : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}${unit}`;
  return (
    <div className="physio-compare">
      <h3>Pace and pulse across takes</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Attempt 1</th>
            <th scope="col">Attempt 2</th>
          </tr>
        </thead>
        <tbody>
          {row("Pace variation (window to window)", (_, i) => fmt(c.variation[i], "%"))}
          {row("Camera data", (r) =>
            r.physiology ? (r.physiology.source === "mock" ? "Mock (not measured)" : "Real Presage") : "Not recorded",
          )}
          {row("Baseline pulse", (r) =>
            `${fmt(r.physiology?.baseline?.bpm, " BPM")}${r.physiology?.baseline?.carried ? " (carried from previous take)" : ""}`,
          )}
          {row("Avg pulse while speaking", (r) =>
            r.physiology ? fmt(physiologySummary(r.physiology, r.duration).mean, " BPM") : "—",
          )}
          {row("Opening 30 s vs baseline", (_, i) => fmt(c.openingDelta[i], " BPM Δ"))}
          {row("Confident coverage", (r) => (r.physiology ? `${Math.round(r.physiology.coverage * 100)}%` : "—"))}
        </tbody>
      </table>
      <ul className="physio-list">
        {c.statements.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
