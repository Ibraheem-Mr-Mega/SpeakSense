"use client";
import { useRef, useState } from "react";
import { Play, Target, Check, Info, ArrowUpRight } from "lucide-react";
import { analyze, coach, compare, excerpt } from "@/lib/speech/analysis";
import type { Attempt, Evidence } from "@/lib/speech/types";
export const stamp = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
function useMomentPlayer() {
  const player = useRef<HTMLAudioElement>(null);
  const until = useRef<number | null>(null);
  const [playError, setPlayError] = useState("");
  const play = (e: Evidence) => {
    const a = player.current;
    if (!a) return;
    setPlayError("");
    a.currentTime = Math.max(0, e.start - 0.25);
    until.current = e.end + 0.45;
    void a
      .play()
      .catch(() =>
        setPlayError(
          "Playback could not start. Use the audio controls to try again.",
        ),
      );
  };
  const tick = () => {
    if (
      until.current !== null &&
      player.current &&
      player.current.currentTime >= until.current
    ) {
      player.current.pause();
      until.current = null;
    }
  };
  return {
    player,
    play,
    tick,
    playError,
    full: () => {
      until.current = null;
    },
  };
}
export function Metrics({ attempt }: { attempt: Attempt }) {
  const m = analyze(attempt.transcript!, attempt.duration);
  return (
    <div className="metrics">
      <div>
        <span>Speaking pace</span>
        <strong>
          {Math.round(m.wpm)}
          <small> wpm</small>
        </strong>
        <p>
          {m.wordCount} words / {attempt.duration.toFixed(1)} sec
        </p>
      </div>
      <div>
        <span>Filled pauses</span>
        <strong>
          {m.english ? m.fillers.length : "—"}
          <small>{m.english ? " found" : " English only"}</small>
        </strong>
        <p>
          {m.english
            ? `${m.fillerRate.toFixed(1)} per minute · transcript based`
            : "No English filler rules applied"}
        </p>
      </div>
      <div>
        <span>Word gaps ≥ 1 sec</span>
        <strong>
          {m.gaps.length}
          <small> found</small>
        </strong>
        <p>Time between recognized words</p>
      </div>
    </div>
  );
}
export function AttemptReview({
  attempt,
  index,
}: {
  attempt: Attempt;
  index: number;
}) {
  const { player, play, tick, playError, full } = useMomentPlayer();
  const m = analyze(attempt.transcript!, attempt.duration);
  const c = coach(attempt);
  const moment = (e?: Evidence) =>
    e ? (
      <button className="evidence" onClick={() => play(e)}>
        <span>
          <Play size={13} />
          {stamp(e.start)}
        </span>
        <q>{e.text}</q>
      </button>
    ) : null;
  return (
    <div className="review">
      <div className="review-grid">
        <section className="panel playback">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LISTEN BACK</p>
              <h2>Attempt {index + 1}</h2>
            </div>
            <span className="pill">
              {attempt.kind === "sample"
                ? "SYNTHETIC SAMPLE"
                : "YOUR RECORDING"}
            </span>
          </div>
          {attempt.microphoneLabel && (
            <p className="small">Input: {attempt.microphoneLabel}</p>
          )}
          <audio
            aria-label={`Attempt ${index + 1} recording`}
            ref={player}
            src={attempt.audioUrl}
            controls
            preload="metadata"
            onTimeUpdate={tick}
            onPointerDown={full}
            onKeyDown={full}
            onPlay={() => {
              document.querySelectorAll("audio").forEach((a) => {
                if (a !== player.current) a.pause();
              });
            }}
          />
          <button
            className="text-button"
            onClick={() => {
              full();
              if (player.current) {
                player.current.currentTime = 0;
                void player.current.play().catch(() => {});
              }
            }}
          >
            Play full attempt <Play size={14} />
          </button>
          {playError && <p role="alert">{playError}</p>}
          <Metrics attempt={attempt} />
          <details className="method">
            <summary>
              <Info size={15} /> How these numbers work
            </summary>
            <p>
              Pace = recognized words ÷ full recording seconds × 60, including
              pauses and fillers. There is no universal ideal pace.
            </p>
            <p>
              Filled pauses count English um, uh, er, erm, hmm and mm variants
              as whole words, ignoring punctuation. “Like” and “you know” are
              only review candidates, since they often carry meaning.
            </p>
            <p>
              Gaps are ≥ 1 second from a word’s end to the next word’s start,
              excluding tagged audio events. They are not verified silence.
              Transcription errors can change all metrics; listen before drawing
              conclusions.
            </p>
            <p>
              {attempt.kind === "sample"
                ? "Sample timestamps come from the construction of synthetic word-by-word audio. They are not ASR output."
                : "Word timestamps come from ElevenLabs Scribe v2; no filler removal or transcript rewriting is requested."}
            </p>
          </details>
          <div className="transcript-heading">
            <h3>Transcript</h3>
            <span className="small">Tap a word to hear it</span>
          </div>
          <p className="small">
            Original words preserved · highlighted words are detected filled
            pauses
          </p>
          <div className="transcript">
            {attempt.transcript!.words.map((w, i) =>
              w.type === "spacing" ? (
                <span key={i}>{w.text}</span>
              ) : w.type === "word" ? (
                <button
                  key={i}
                  className={m.fillers.includes(w) ? "word filler" : "word"}
                  title={`Play ${w.text} at ${stamp(w.start)}`}
                  aria-label={`Play word ${w.text} at ${stamp(w.start)}`}
                  onClick={() => play(w)}
                >
                  {w.text}{" "}
                </button>
              ) : (
                <span className="audio-event" key={i}>
                  {w.text}
                </span>
              ),
            )}
          </div>
          <details className="method">
            <summary>Original transcript text</summary>
            <p className="raw-text">
              {attempt.transcript!.text || "No speech recognized."}
            </p>
          </details>
        </section>
        <aside className="panel coaching">
          <p className="eyebrow">YOUR COACHING NOTES</p>
          <h2>One step closer.</h2>
          <p className="small">Evidence-based suggestions · no overall score</p>
          <div className="strength">
            <div className="note-label">
              <Check size={16} />A strength to keep
            </div>
            <p>{c.strength}</p>
            {moment(c.strengthEvidence)}
          </div>
          <h3 className="priority-heading">Focus on these next</h3>
          {c.improvements.map((item, i) => (
            <div className="coaching-note" key={item.title}>
              <span className="note-number">{i + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                {moment(item.evidence)}
              </div>
            </div>
          ))}
          <div className="goal">
            <div className="note-label">
              <Target size={17} />
              YOUR ONE RETRY GOAL
            </div>
            <p>{c.goal}</p>
          </div>
        </aside>
      </div>
      {(m.fillers.length > 0 ||
        m.gaps.length > 0 ||
        m.candidates.length > 0) && (
        <section className="panel moments">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BACK TO THE EVIDENCE</p>
              <h2>Moments worth a listen</h2>
            </div>
            <span className="small">Each clip plays its actual audio</span>
          </div>
          <div className="moment-list">
            {m.fillers.map((w, i) => (
              <button onClick={() => play(w)} key={"f" + i}>
                <Play size={16} />
                <span>{stamp(w.start)}</span>
                <strong>“{w.text}”</strong>
                <small>Filled pause</small>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {m.gaps.map((w, i) => (
              <button onClick={() => play(w)} key={"g" + i}>
                <Play size={16} />
                <span>{stamp(w.start)}</span>
                <strong>{w.text}</strong>
                <small>Word gap</small>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {m.candidates.map((w, i) => (
              <button onClick={() => play(w)} key={"c" + i}>
                <Play size={16} />
                <span>{stamp(w.start)}</span>
                <strong>“{w.text}”</strong>
                <small>Context check · not counted</small>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
function CompareCard({ attempt, index }: { attempt: Attempt; index: number }) {
  const { player, play, tick, full } = useMomentPlayer();
  const m = analyze(attempt.transcript!, attempt.duration);
  const opening = excerpt(m.words, 0, 12);
  const ending = excerpt(m.words, Math.max(0, m.words.length - 18), 18);
  return (
    <section className="panel compare-card">
      <p className="eyebrow">
        {index === 0 ? "THE STARTING POINT" : "THE FOCUSED RETRY"}
      </p>
      <h2>Attempt {index + 1}</h2>
      <p className="small">
        {attempt.kind === "sample" ? "Synthetic sample" : "Your recording"} ·{" "}
        {attempt.duration.toFixed(1)} seconds
        {attempt.microphoneLabel && <> · {attempt.microphoneLabel}</>}
      </p>
      <audio
        ref={player}
        src={attempt.audioUrl}
        controls
        aria-label={`Compare attempt ${index + 1}`}
        onTimeUpdate={tick}
        onPointerDown={full}
        onKeyDown={full}
        onPlay={() =>
          document.querySelectorAll("audio").forEach((a) => {
            if (a !== player.current) a.pause();
          })
        }
      />
      <Metrics attempt={attempt} />
      <h3>The opening</h3>
      {opening && (
        <button className="evidence" onClick={() => play(opening)}>
          <span>
            <Play size={13} />
            {stamp(opening.start)}
          </span>
          <q>{opening.text}</q>
        </button>
      )}
      <h3>The closing</h3>
      {ending && (
        <button className="evidence" onClick={() => play(ending)}>
          <span>
            <Play size={13} />
            {stamp(ending.start)}
          </span>
          <q>{ending.text}</q>
        </button>
      )}
      <h3>Filled-pause evidence</h3>
      {m.fillers.length ? (
        m.fillers.map((w, i) => (
          <button className="filler-chip" key={i} onClick={() => play(w)}>
            <Play size={12} />
            {stamp(w.start)} “{w.text}”
          </button>
        ))
      ) : (
        <p className="small">
          {m.english
            ? "No listed filler tokens found. This is not proof that none were spoken."
            : "English filler rules were not applied."}
        </p>
      )}
    </section>
  );
}
export function Comparison({ attempts }: { attempts: Attempt[] }) {
  const a = attempts[0],
    b = attempts[1],
    diff = compare(a, b),
    goal = coach(a);
  const change = (n: number, digits = 0) =>
    `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
  return (
    <section>
      <div className="comparison-intro">
        <div>
          <p className="eyebrow">YOUR PRACTICE, IN PERSPECTIVE</p>
          <h2>What changed between takes?</h2>
        </div>
        <span className="pill">Same exercise · same audience</span>
      </div>
      <div className="comparison-summary">
        <div>
          <strong>
            {diff.fillerChange === null ? "—" : change(diff.fillerChange)}
          </strong>
          <span>filled pauses</span>
        </div>
        <div>
          <strong>
            {diff.rateChange === null ? "—" : change(diff.rateChange, 1)}
          </strong>
          <span>filled pauses / minute</span>
        </div>
        <div>
          <strong>{change(diff.paceChange)}</strong>
          <span>words / minute</span>
        </div>
        <div>
          <strong>{change(diff.wordChange)}</strong>
          <span>recognized words</span>
        </div>
      </div>
      <div className="goal comparison-goal">
        <div className="note-label">
          <Target size={17} />
          THE GOAL YOU PRACTICED
        </div>
        <p>{goal.goal}</p>
        <p className="small">
          {goal.goalKind === "fillers" && diff.fillerChange !== null
            ? `The transcript count changed from ${diff.first.fillers.length} to ${diff.second.fillers.length}. Listen to both examples to check whether the pause helped your message.`
            : "Listen to the two closing excerpts below to assess the specific action or central idea. Message quality is not automatically scored."}
        </p>
      </div>
      <p className="comparison-note">
        {a.duration !== b.duration
          ? "These recordings have different lengths; use the per-minute rate alongside the raw count. "
          : ""}
        A change in pace is not automatically an improvement. Transcript
        differences may reflect recognition errors.
      </p>
      <div className="compare-grid">
        <CompareCard attempt={a} index={0} />
        <CompareCard attempt={b} index={1} />
      </div>
    </section>
  );
}
