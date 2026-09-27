"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mic,
  ArrowRight,
  AudioLines,
  ShieldCheck,
  Timer,
  Target,
  Square,
  RotateCcw,
  Trash2,
  Headphones,
  LoaderCircle,
  ArrowLeft,
} from "lucide-react";
import { MicrophonePicker } from "@/components/microphone-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  MicrophoneSource,
  microphoneError,
  recordingDuration,
  type AudioSource,
} from "@/lib/speech/audio-source";
import { coach, validateTranscript } from "@/lib/speech/analysis";
import type { Attempt, Exercise, Recording } from "@/lib/speech/types";
import { AttemptReview, Comparison, stamp } from "@/components/attempt-review";
const exercises = [
  {
    id: "investor",
    title: "Investor pitch",
    desc: "Make the problem, value, and ask clear.",
    prompt: "Who you help, why it matters, what comes next.",
  },
  {
    id: "keynote",
    title: "Keynote opening",
    desc: "Give your audience a reason to listen.",
    prompt: "Open with a relevant idea. Tell us why it matters.",
  },
  {
    id: "leadership",
    title: "Leadership update",
    desc: "Align the room around a next step.",
    prompt: "What changed, why it matters, what the team should do.",
  },
] as const;
export default function ReviewDemo() {
  const [exercise, setExercise] = useState<Exercise>("investor"),
    [audience, setAudience] = useState("");
  const [live, setLive] = useState<Attempt[]>([]),
    [samples, setSamples] = useState<Attempt[]>([]),
    [mode, setMode] = useState<"live" | "sample">("live");
  const [preparing, setPreparing] = useState(true),
    [phase, setPhase] = useState<
      "idle" | "permission" | "recording" | "saving" | "uploading"
    >("idle");
  const [seconds, setSeconds] = useState(0),
    [level, setLevel] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null),
    [tab, setTab] = useState("attempt-0"),
    [sampleLoading, setSampleLoading] = useState(false);
  const [microphoneId, setMicrophoneId] = useState("");
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const source = useRef<AudioSource | null>(null),
    generation = useRef(0),
    request = useRef<AbortController | null>(null),
    urls = useRef(new Set<string>());
  const current = mode === "live" ? live : samples;
  const busy = phase !== "idle" || sampleLoading || microphoneBusy;
  const last = current[current.length - 1],
    analyzed = !!last?.transcript;
  const locked = live.length > 0 || busy;
  useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) =>
        setConfigured(
          (s as { transcriptionConfigured: boolean }).transcriptionConfigured,
        ),
      )
      .catch(() => setConfigured(null));
    return () => {
      generation.current++;
      source.current?.cancel();
      request.current?.abort();
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);
  useEffect(() => {
    const leave = () => {
      if (source.current && phase === "recording") {
        source.current.stop();
        setNotice(
          "Recording stopped when you left this page. Review the captured audio before transcription.",
        );
      }
    };
    const hidden = () => {
      if (document.hidden) leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [phase]);
  // A documented, read-only tool for browser agents; no recording or upload side effects.
  useEffect(() => {
    type ToolRegistry = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: ToolRegistry })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "speaksense_session_summary",
            description:
              "Read the displayed practice state, durations, and transcription status. Does not record, upload, or disclose transcript content.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: false },
            execute: async (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw new Error("Expected an empty object.");
              return {
                mode,
                phase,
                exercise,
                attempts: current.map((a) => ({
                  kind: a.kind,
                  duration: a.duration,
                  transcribed: !!a.transcript,
                })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [mode, phase, exercise, current]);
  function clear() {
    generation.current++;
    request.current?.abort();
    source.current?.cancel();
    source.current = null;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setLive([]);
    setSamples([]);
    setMode("live");
    setPreparing(true);
    setPhase("idle");
    setSeconds(0);
    setLevel(0);
    setError("");
    setNotice(
      "All attempts cleared from this session. This does not delete copies already processed by ElevenLabs.",
    );
    setTab("attempt-0");
  }
  async function start() {
    if (!audience.trim()) {
      setError("Add your intended audience or goal before you record.");
      document.getElementById("audience")?.focus();
      return;
    }
    if (busy || live.length >= 2) return;
    setError("");
    setNotice("");
    setSeconds(0);
    setLevel(0);
    setPhase("permission");
    const token = ++generation.current;
    const adapter = new MicrophoneSource(microphoneId);
    source.current = adapter;
    const complete = async (recording: Recording) => {
      if (token !== generation.current) return;
      setPhase("saving");
      source.current = null;
      const duration = await recordingDuration(
        recording.blob,
        recording.duration,
      );
      if (token !== generation.current) return;
      if (duration < 0.5 || recording.blob.size === 0 || duration > 65) {
        setError(
          "That recording was too short or interrupted. Try again and keep it under 60 seconds.",
        );
        setPhase("idle");
        return;
      }
      const url = URL.createObjectURL(recording.blob);
      urls.current.add(url);
      const attempt: Attempt = {
        id: crypto.randomUUID(),
        kind: "live",
        exercise,
        audience: audience.trim(),
        duration,
        audioUrl: url,
        blob: recording.blob,
        microphoneLabel: recording.microphoneLabel,
      };
      setLive((items) => [...items, attempt]);
      setPreparing(false);
      setPhase("idle");
      setTab(`attempt-${live.length}`);
      if (recording.interrupted)
        setNotice(
          "The microphone disconnected. Listen to what was captured before sending it.",
        );
    };
    try {
      await adapter.start({
        onTick: (s) => {
          if (token === generation.current) setSeconds(Math.min(60, s));
        },
        onLevel: (l) => setLevel(l),
        onComplete: complete,
        onError: (e) => {
          if (token === generation.current) {
            setError(e.message);
            setPhase("idle");
          }
        },
      });
      if (token === generation.current) setPhase("recording");
    } catch (e) {
      if (token === generation.current) {
        source.current = null;
        setError(microphoneError(e));
        setPhase("idle");
      }
    }
  }
  function cancelRecording() {
    generation.current++;
    source.current?.cancel();
    source.current = null;
    setPhase("idle");
    setSeconds(0);
    setLevel(0);
    setNotice("Recording discarded. Nothing was sent.");
  }
  async function transcribe() {
    if (!last?.blob || busy) return;
    setError("");
    setNotice("");
    setPhase("uploading");
    const token = ++generation.current;
    request.current = new AbortController();
    const timeout = setTimeout(() => request.current?.abort(), 65000);
    try {
      const body = new FormData();
      body.set(
        "audio",
        last.blob,
        "attempt." + (last.blob.type.includes("mp4") ? "mp4" : "webm"),
      );
      body.set("duration", String(last.duration));
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body,
        signal: request.current.signal,
      });
      const result = (await response.json().catch(() => ({
        error:
          response.status === 413
            ? "The recording exceeds the upload limit. Try a shorter take."
            : "The server could not process this recording. Try again.",
      }))) as { error?: string; transcript?: unknown };
      if (!response.ok)
        throw new Error(result.error || "Transcription failed. Please retry.");
      const transcript = validateTranscript(result.transcript, last.duration);
      if (token !== generation.current) return;
      setLive((items) =>
        items.map((a) => (a.id === last.id ? { ...a, transcript } : a)),
      );
      setNotice(
        transcript.words.some((w) => w.type === "word")
          ? "Your transcript is ready. Listen to highlighted moments before acting on feedback."
          : "No speech was recognized. You can listen to your recording and try again.",
      );
    } catch (e) {
      if (token === generation.current)
        setError(
          e instanceof Error && e.name === "AbortError"
            ? "The request was stopped. Your recording is still available; the provider may already have received the audio."
            : e instanceof Error
              ? e.message
              : "Transcription failed.",
        );
    } finally {
      clearTimeout(timeout);
      if (token === generation.current) setPhase("idle");
    }
  }
  function discardLast() {
    if (busy || !last) return;
    URL.revokeObjectURL(last.audioUrl);
    urls.current.delete(last.audioUrl);
    setLive((items) => items.slice(0, -1));
    setPreparing(true);
    setError("");
    setNotice("The latest recording was discarded. Ready for another take.");
  }
  async function loadSample(retry = false) {
    if (busy) return;
    const token = generation.current;
    setSampleLoading(true);
    setError("");
    try {
      const response = await fetch(`/samples/attempt-${retry ? 2 : 1}.json`);
      if (!response.ok)
        throw new Error("The sample could not load. Try again.");
      const a = (await response.json()) as Attempt;
      a.transcript = validateTranscript(a.transcript, a.duration);
      // Load the small fixture completely: some production asset hosts return 200
      // rather than byte ranges. Blob playback keeps timestamp seeking local.
      const audioResponse = await fetch(a.audioUrl);
      if (!audioResponse.ok)
        throw new Error("The sample audio could not load. Try again.");
      const audioBlob = await audioResponse.blob();
      if (token !== generation.current) return;
      if (!retry)
        samples.forEach((previous) => {
          URL.revokeObjectURL(previous.audioUrl);
          urls.current.delete(previous.audioUrl);
        });
      a.audioUrl = URL.createObjectURL(audioBlob);
      urls.current.add(a.audioUrl);
      setSamples((items) => (retry ? [items[0], a] : [a]));
      setMode("sample");
      setPreparing(false);
      setTab(retry ? "comparison" : "attempt-0");
      setNotice("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample unavailable.");
    } finally {
      setSampleLoading(false);
    }
  }
  function backToLive() {
    setMode("live");
    setPreparing(!live.length);
    setTab(`attempt-${Math.max(0, live.length - 1)}`);
    setError("");
    setNotice("");
  }
  const retryGoal = live[0]?.transcript ? coach(live[0]).goal : null;
  const sample = mode === "sample";
  return (
    <main>
      <a className="skip-link" href="#practice">
        Skip to practice
      </a>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="SpeakSense home">
          <AudioLines />
          SpeakSense<span className="stage">STAGE 01</span>
        </Link>
        <div className="header-actions">
          {live.length > 0 || samples.length > 0 ? (
            <button className="text-button" onClick={clear} disabled={busy}>
              <Trash2 size={16} />
              Clear attempts
            </button>
          ) : (
            <span className="header-note">Your next moment starts here.</span>
          )}
        </div>
      </header>
      <div className="workspace" id="practice">
        <div className="intro">
          <p className="eyebrow">THE PRACTICE STUDIO</p>
          <h1>
            {sample
              ? "A practice session, unpacked."
              : preparing && live.length
                ? "Same message. One new focus."
                : preparing
                  ? "Make your next minute matter."
                  : "Hear it. Learn from it. Try again."}
          </h1>
          <p>
            {sample
              ? "Explore a labeled example of practice, feedback, and a focused retry."
              : "A little practice. Specific feedback. One focused retry."}
          </p>
        </div>
        <ol className="steps" aria-label="Practice steps">
          <li className={preparing ? "active" : ""}>
            01 <span>Practice</span>
          </li>
          <li className={!preparing && current.length < 2 ? "active" : ""}>
            02 <span>Find your focus</span>
          </li>
          <li className={current.length === 2 ? "active" : ""}>
            03 <span>Try again & compare</span>
          </li>
        </ol>
        {sample && (
          <div className="sample-banner">
            <Headphones size={22} />
            <div>
              <strong>Sample session · synthetic voice</strong>
              <p>
                This is constructed demo audio, not your recording or an
                ElevenLabs result. Its spoken fillers and word timings are built
                into the audio.
              </p>
            </div>
            <button className="secondary" onClick={backToLive} disabled={busy}>
              <ArrowLeft size={15} />
              My practice
            </button>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {preparing && !sample ? (
          <div className="studio-grid">
            <section className="panel setup">
              <p className="eyebrow">
                {live.length ? "SAME EXERCISE" : "YOUR MOMENT"}
              </p>
              <h2>What are you preparing for?</h2>
              <RadioGroup
                aria-label="Pitch exercise"
                value={exercise}
                onValueChange={(v) => setExercise(v as Exercise)}
                disabled={locked}
                className="exercises"
              >
                {exercises.map((x) => (
                  <label
                    className={
                      exercise === x.id ? "exercise selected" : "exercise"
                    }
                    key={x.id}
                  >
                    <RadioGroupItem value={x.id} />
                    <span>
                      <strong>{x.title}</strong>
                      <small>{x.desc}</small>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <label className="field-label" htmlFor="audience">
                Who’s listening, or what’s your goal?
              </label>
              <input
                id="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                disabled={locked}
                maxLength={140}
                placeholder="e.g. Seed investors · earn a follow-up meeting"
              />
              <MicrophonePicker
                value={microphoneId}
                onChange={setMicrophoneId}
                disabled={phase !== "idle" || sampleLoading}
                onBusyChange={setMicrophoneBusy}
              />
              <div className="tip">
                <Target size={19} />
                <p>
                  {retryGoal ? "Your one retry goal" : "Keep it to one idea."}
                  <br />
                  <span>
                    {retryGoal ||
                      exercises.find((x) => x.id === exercise)!.prompt}
                  </span>
                </p>
              </div>
              {live.length > 0 && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setPreparing(false)}
                >
                  <ArrowLeft size={15} />
                  Back to first attempt
                </button>
              )}
            </section>
            <section
              className={
                "recorder panel " +
                (phase === "recording" ? "is-recording" : "")
              }
            >
              <div className="recorder-top">
                <span className="pill">
                  <Timer size={15} />
                  60-second exercise
                </span>
                <span className="small">DEVICE MICROPHONE</span>
              </div>
              <div className="mic-orbit">
                <Mic size={42} />
              </div>
              <h2 aria-live="polite">
                {phase === "permission"
                  ? "Allow microphone access"
                  : phase === "recording"
                    ? "Recording your moment."
                    : phase === "saving"
                      ? "Preparing your recording…"
                      : live.length
                        ? "Ready for your focused retry?"
                        : "Your space to rehearse."}
              </h2>
              <p>
                {phase === "recording"
                  ? "Recording on this device. Nothing is being sent."
                  : phase === "permission"
                    ? "Check your browser’s microphone permission prompt."
                    : "You don’t need a perfect take. Just a place to begin."}
              </p>
              <div
                className="timer"
                role="timer"
                aria-label={`${Math.ceil(60 - seconds)} seconds remaining`}
              >
                {stamp(Math.ceil(60 - seconds))}
                <span> / 1:00</span>
              </div>
              {phase === "recording" && (
                <div
                  className="level-meter"
                  aria-label="Microphone signal level"
                  role="meter"
                  aria-valuenow={Math.round(level * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div style={{ width: `${Math.max(2, level * 100)}%` }} />
                </div>
              )}
              {phase === "recording" ? (
                <>
                  <button
                    className="danger"
                    onClick={() => {
                      setPhase("saving");
                      source.current?.stop();
                    }}
                  >
                    <Square size={17} />
                    Stop recording
                  </button>
                  <button className="text-button" onClick={cancelRecording}>
                    Discard & start over
                  </button>
                </>
              ) : phase === "permission" ? (
                <button className="secondary" onClick={cancelRecording}>
                  Cancel request
                </button>
              ) : (
                <button className="primary" disabled={busy} onClick={start}>
                  <Mic size={18} />
                  {live.length ? "Record focused retry" : "Start recording"}
                </button>
              )}
              <p className="small">
                {phase === "recording"
                  ? "Stops automatically at 60 seconds."
                  : "You’ll be asked for microphone permission."}
              </p>
              {!busy && (
                <button className="text-button" onClick={() => loadSample()}>
                  <Headphones size={16} />
                  Explore a sample session <ArrowRight size={16} />
                </button>
              )}
            </section>
          </div>
        ) : (
          <>
            <div className="session-context">
              <span>
                {exercises.find((x) => x.id === last?.exercise)?.title} ·
                60-second exercise
              </span>
              <strong>{last?.audience}</strong>
            </div>
            {last && !analyzed ? (
              <section className="panel ready">
                <p className="eyebrow">RECORDING SAVED IN THIS TAB</p>
                <h2>Listen before you send.</h2>
                <p>
                  {last.duration.toFixed(1)} seconds ·{" "}
                  {last.microphoneLabel || "your microphone recording"}
                </p>
                <audio
                  controls
                  src={last.audioUrl}
                  aria-label="Your recorded attempt"
                />
                <div className="send-notice">
                  <ShieldCheck size={22} />
                  <p>
                    <strong>
                      You choose when your audio leaves this device.
                    </strong>
                    <br />
                    “Send for transcription” uploads this recording to
                    ElevenLabs Scribe v2. SpeakSense does not store it on a
                    server. ElevenLabs retention depends on the host’s account
                    settings.
                  </p>
                </div>
                {configured === false && (
                  <p className="service-status">
                    Live transcription needs an ElevenLabs API key on the
                    server. You can still play or download this recording,
                    retry, or explore the labeled sample.
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={transcribe}
                    disabled={busy}
                  >
                    {phase === "uploading" ? (
                      <>
                        <LoaderCircle className="spin" size={17} />
                        Sending to ElevenLabs…
                      </>
                    ) : (
                      <>
                        Send for transcription <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={discardLast}
                  >
                    <RotateCcw size={16} />
                    Record again
                  </button>
                  <a
                    className="text-button"
                    href={last.audioUrl}
                    download={
                      "speaksense-attempt." +
                      (last.blob?.type.includes("mp4") ? "mp4" : "webm")
                    }
                  >
                    Download audio
                  </a>
                </div>
                {phase === "uploading" && (
                  <button
                    className="text-button"
                    onClick={() => request.current?.abort()}
                  >
                    Stop waiting · provider may already have audio
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => loadSample()}
                  disabled={busy}
                >
                  Explore a sample session <ArrowRight size={16} />
                </button>
              </section>
            ) : (
              last && (
                <>
                  <Tabs value={tab} onValueChange={setTab}>
                    <TabsList
                      className="review-tabs"
                      aria-label="Review attempts"
                    >
                      <TabsTrigger value="attempt-0">Attempt 1</TabsTrigger>
                      {current[1]?.transcript && (
                        <TabsTrigger value="attempt-1">Attempt 2</TabsTrigger>
                      )}
                      {current[1]?.transcript && (
                        <TabsTrigger value="comparison">
                          Compare attempts
                        </TabsTrigger>
                      )}
                    </TabsList>
                    {current.map(
                      (a, i) =>
                        a.transcript && (
                          <TabsContent value={`attempt-${i}`} key={a.id}>
                            <AttemptReview attempt={a} index={i} />
                          </TabsContent>
                        ),
                    )}
                    {current[1]?.transcript && (
                      <TabsContent value="comparison">
                        <Comparison attempts={current} />
                      </TabsContent>
                    )}
                  </Tabs>
                  <div className="retry-bar">
                    <div>
                      <h3>
                        {current.length < 2
                          ? "Now, change just one thing."
                          : "Two takes. Something to build on."}
                      </h3>
                      <p>
                        {current.length < 2
                          ? "Keep the exercise and audience. Bring your one goal into the next take."
                          : "Listen to the examples side by side. Clear attempts to begin a new session."}
                      </p>
                    </div>
                    {current.length < 2 ? (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          sample ? loadSample(true) : setPreparing(true)
                        }
                      >
                        <RotateCcw size={17} />
                        {sample
                          ? "Load sample retry"
                          : "Try again with this goal"}
                      </button>
                    ) : (
                      <button className="secondary" onClick={clear}>
                        <Trash2 size={16} />
                        Clear & start fresh
                      </button>
                    )}
                  </div>
                </>
              )
            )}
          </>
        )}
        {configured === false && preparing && !sample && (
          <p className="service-footnote">
            Recording is available. Live transcription is awaiting the host’s
            API setup; sample analysis works now.
          </p>
        )}
        <p className="privacy">
          <ShieldCheck size={17} />
          Attempts live in this tab and disappear on refresh or when cleared. No
          account required.
        </p>
        <footer>
          <span>
            Different voices. Different styles. No confidence or health
            judgments.
          </span>
          <details>
            <summary>Stage 1 & what’s next</summary>
            <p>
              Stage 1: device microphone, timestamped transcription, measured
              feedback, and a focused retry. Camera delivery coaching, evaluated
              Presage readings, wearable pin audio and cues, and optional
              biometrics are future work. None are active here.
            </p>
            <p>
              English coaching and filler rules are limited; we preserve the
              provider’s original transcript. No accent scoring, emotion
              inference, or overall performance score.
            </p>
          </details>
        </footer>
      </div>
    </main>
  );
}
