"use client";
import { useRef, useState } from "react";
import type { SessionResult } from "@/lib/live/types";
import { correctedSegment, segmentMetrics } from "@/lib/live/protocol";
import { PhysiologyComparison, PhysiologyReview } from "./presage-review";
export const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export function LiveReview({
  result,
  onChange,
  onRetry,
}: {
  result: SessionResult;
  onChange: (result: SessionResult) => void;
  onRetry?: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const metric = segmentMetrics(result.segments, result.duration);
  const shown = result.cues.filter((c) => c.delivery === "shown");
  const latencies = shown
    .flatMap((c) => (c.latencyMs === undefined ? [] : [c.latencyMs]))
    .sort((a, b) => a - b);
  const play = (start: number) => {
    if (audio.current) {
      audio.current.currentTime = Math.min(
        start,
        Math.max(0, result.duration - 0.1),
      );
      void audio.current
        .play()
        .catch(() => setError("Use the audio player to begin playback."));
    }
  };
  function save() {
    try {
      onChange({
        ...result,
        segments: result.segments.map((s) =>
          s.id === editing ? correctedSegment(s, draft) : s,
        ),
      });
      setEditing(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="live-review" aria-label="Session review">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {result.setup.mode === "practice"
              ? "YOUR PRACTICE"
              : "PRESENTATION REVIEW"}
          </p>
          <h2>Hear what prompted the cue.</h2>
        </div>
        {onRetry && (
          <button className="primary-button" onClick={onRetry}>
            Retry this pitch
          </button>
        )}
      </div>
      <p className="small">
        {result.source === "controlled"
          ? "Controlled synthetic audio · not a physical microphone test"
          : result.microphone}{" "}
        · {time(result.duration)} captured
      </p>
      {!result.complete && (
        <p role="status" className="notice">
          Live transcription was interrupted or incomplete. Metrics describe
          only recognized words; comparisons may undercount.
        </p>
      )}
      {result.audioUrl && (
        <audio
          ref={audio}
          src={result.audioUrl}
          controls
          preload="metadata"
          aria-label="Session recording"
        />
      )}
      <div className="metric-row">
        <div>
          <strong>{metric.words}</strong>
          <span>recognized words</span>
        </div>
        <div>
          <strong>{Math.round(metric.wpm)}</strong>
          <span>words / minute</span>
        </div>
        <div>
          <strong>{metric.fillers ?? "—"}</strong>
          <span>recognized filled pauses</span>
        </div>
        <div>
          <strong>{shown.length}</strong>
          <span>on-screen cues</span>
        </div>
      </div>
      <p className="small">
        Pace = recognized words ÷ captured minutes, including pauses. English
        filled-pause rules count um, uh, er, erm, hmm and mm; “like” is not
        automatically a filler. Recognition can miss words.{" "}
        {metric.corrected ? "Counts include your corrections." : ""}
      </p>
      {result.physiology && <PhysiologyReview result={result} onPlay={play} />}
      <div className="review-columns">
        <div>
          <h3>Cue timeline</h3>
          <p className="small">
            Each event keeps the evidence that was available when it triggered.
            Corrections do not rewrite this history.
          </p>
          {result.cues.length === 0 ? (
            <p>No eligible cues triggered. That is not a score.</p>
          ) : (
            <ol className="cue-history">
              {result.cues.map((c) => (
                <li key={c.id}>
                  <div className="section-heading">
                    <strong>{c.message}</strong>
                    <span className="pill">
                      {c.delivery === "shown"
                        ? `Shown ${time(c.renderedAt ?? c.at)}`
                        : c.delivery === "audio-only"
                          ? `Audio ${time(c.audioAt ?? c.at)}`
                          : `Not shown · ${c.delivery}`}
                    </span>
                  </div>
                  <p>{c.reason}</p>
                  {c.evidenceText && (
                    <blockquote>“{c.evidenceText}”</blockquote>
                  )}
                  <button
                    className="text-button"
                    onClick={() => play(Math.max(0, c.evidenceStart - 1))}
                  >
                    Play {time(c.evidenceStart)} source moment
                  </button>
                  {c.latencyMs !== undefined && (
                    <p className="small">
                      {(c.latencyMs / 1000).toFixed(2)}s from final triggering
                      word to on-screen render
                      {c.audioAt !== undefined
                        ? ` · ${c.audioMode ?? "tone"} playback started`
                        : ""}
                      .
                    </p>
                  )}
                  <p className="small">Audio: {c.audioStatus ?? "not requested"}{c.audioMode ? ` (${c.audioMode})` : ""}{c.audioQueueMs !== undefined ? ` · ${Math.round(c.audioQueueMs)} ms queue wait` : ""}. {c.audioDetail}</p>
                  {c.receivedAt !== undefined && <p className="small">Recognition arrived {Math.max(0, c.receivedAt - c.evidenceEnd).toFixed(2)}s after the triggering word.{c.renderedAt !== undefined ? ` Display followed ${(Math.max(0, c.renderedAt - c.receivedAt) * 1000).toFixed(0)} ms later.` : ""}{c.audioAt !== undefined ? ` Audio started ${Math.max(0, c.audioAt - c.evidenceEnd).toFixed(2)}s after the triggering word.` : ""}</p>}
                </li>
              ))}
            </ol>
          )}
          <h3>Two things to try</h3>
          <ol className="suggestions">
            <li>
              {metric.fillers && metric.fillers > 0 ? (
                <>
                  The {metric.corrected ? "corrected" : "recognized"} transcript
                  contains {metric.fillers} filled pauses.{" "}
                  <strong>Try one silent beat at a transition.</strong> Listen
                  first; fillers are normal speech.
                </>
              ) : (
                <>
                  Replay your opening for{" "}
                  <strong>{result.setup.audience || "your audience"}</strong>.
                  Decide whether it establishes the intended takeaway: “
                  {result.setup.takeaway ||
                    "the main thing you want listeners to remember"}
                  ”. This is a listening prompt.
                </>
              )}
            </li>
            <li>
              Replay your closing. <strong>Make the next step specific.</strong>{" "}
              {result.segments.at(-1) && (
                <>
                  Your final recognized segment is “
                  {result.segments.at(-1)!.text}”.{" "}
                </>
              )}
              SpeakSense cannot determine whether the audience understood or
              will act.
            </li>
          </ol>
          {result.setup.points.length > 0 && (
            <div className="message-check">
              <h3>Your message checklist</h3>
              {result.setup.points.map((point, i) => (
                <p key={i}>□ {point}</p>
              ))}
              <p className="small">
                Review these against the transcript. Automatic “missing point”
                cues are suppressed because recognition cannot reliably
                establish absence.
              </p>
            </div>
          )}
        </div>
        <div>
          <h3>Transcript you can correct</h3>
          <p className="small">
            Click a timestamp to listen. Corrections retain the original
            segment’s time range; word timing is no longer claimed for edited
            text.
          </p>
          {result.segments.length === 0 && (
            <p>
              No timestamped speech was recognized. Audio remains available if
              you chose to save it.
            </p>
          )}
          <ol className="transcript-segments">
            {result.segments.map((s) => (
              <li key={s.id}>
                <div className="segment-heading">
                  <button className="text-button" onClick={() => play(s.start)}>
                    {time(s.start)}–{time(s.end)}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setEditing(s.id);
                      setDraft(s.text);
                    }}
                  >
                    Correct text
                  </button>
                </div>
                {editing === s.id ? (
                  <div>
                    <label className="sr-only" htmlFor="correction">
                      Correct this segment
                    </label>
                    <textarea
                      id="correction"
                      maxLength={4000}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="button-row">
                      <button className="primary-button" onClick={save}>
                        Save correction
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => setEditing(null)}
                      >
                        Cancel correction
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>
                      {s.corrected
                        ? s.text
                        : s.words
                            .filter((w) => w.type === "word")
                            .map((w, i) => (
                              <button
                                className="word-button"
                                key={i}
                                onClick={() => play(w.start)}
                                aria-label={`Play ${w.text} at ${time(w.start)}`}
                              >
                                {w.text}{" "}
                              </button>
                            ))}
                    </p>
                    {s.corrected && (
                      <details>
                        <summary className="small">
                          Corrected · original transcript
                        </summary>
                        <p>{s.originalText}</p>
                      </details>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <details className="diagnostics">
        <summary>Session diagnostics & measured latency</summary>
        <p>
          Audio-to-screen latency uses the final triggering word’s provider
          timestamp and the browser clock at cue render. It includes capture,
          upload, recognition, cue scheduling and UI delay; it is an estimate
          tied to ASR timestamps.
        </p>
        <p>
          {latencies.length
            ? `${latencies.length} measured speech cue(s) · median ${(latencies[Math.floor(latencies.length / 2)] / 1000).toFixed(2)}s · max ${(latencies.at(-1)! / 1000).toFixed(2)}s`
            : "No audio-derived on-screen cue latency measured in this session."}
        </p>
        <p>At each cue trigger, the stream had sent: {result.cues.map(c=>`${c.type}: ${(c.audioSentAt??0).toFixed(2)}s of audio`).join("; ") || "no cue triggers"}. Final captured audio: {result.duration.toFixed(2)}s.</p>
        <ul>
          {result.events.map((e, i) => (
            <li key={i}>
              {time(e.at)} · {e.type}: {e.detail}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
export function LiveComparison({
  first,
  second,
}: {
  first: SessionResult;
  second: SessionResult;
}) {
  const a = segmentMetrics(first.segments, first.duration),
    b = segmentMetrics(second.segments, second.duration);
  const same =
    first.setup.mode === "practice" &&
    second.setup.mode === "practice" &&
    first.source === second.source &&
    first.setup.audience === second.setup.audience &&
    first.setup.takeaway === second.setup.takeaway &&
    first.setup.limit === second.setup.limit &&
    JSON.stringify(first.setup.points) === JSON.stringify(second.setup.points);
  if (!same) return <p>Choose two attempts of the same pitch to compare.</p>;
  return (
    <section className="live-review">
      <p className="eyebrow">SAME PITCH · TWO TAKES</p>
      <h2>Decide what changed.</h2>
      {(!first.complete || !second.complete) && (
        <p className="notice">
          At least one transcript is incomplete. These counts cannot establish
          improvement.
        </p>
      )}
      <div className="compare-grid">
        {[first, second].map((r, i) => {
          const m = i ? b : a;
          return (
            <article key={r.id}>
              <h3>Attempt {i + 1}</h3>
              <audio
                controls
                src={r.audioUrl}
                aria-label={`Attempt ${i + 1} recording`}
              />
              <p>
                {time(r.duration)} · {m.words} words · {Math.round(m.wpm)}{" "}
                words/min · {m.fillers ?? "unavailable"} filled pauses
              </p>
              <p>
                <strong>Opening:</strong>{" "}
                {r.segments[0]?.text || "No recognized opening"}
              </p>
              <p>
                <strong>Closing:</strong>{" "}
                {r.segments.at(-1)?.text || "No recognized closing"}
              </p>
            </article>
          );
        })}
      </div>
      <p>
        {a.fillers !== null && b.fillers !== null
          ? `${b.fillers - a.fillers >= 0 ? "+" : ""}${b.fillers - a.fillers} recognized filled pauses. `
          : ""}
        {Math.round(b.wpm - a.wpm) >= 0 ? "+" : ""}
        {Math.round(b.wpm - a.wpm)} words/min. Faster or fewer fillers does not
        establish a better pitch. Listen to both and judge the takeaway.
      </p>
      {(first.physiology || second.physiology) && (
        <PhysiologyComparison first={first} second={second} />
      )}
    </section>
  );
}
