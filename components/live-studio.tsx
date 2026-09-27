"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AudioLines, Mic, Square, VolumeX, ArrowRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MicrophonePicker } from "@/components/microphone-picker";
import { microphoneError } from "@/lib/speech/audio-source";
import { BrowserPcmSource } from "@/lib/live/pcm-source";
import { LiveSession, type Snapshot } from "@/lib/live/session";
import type { Cue, Mode, SessionResult, Setup } from "@/lib/live/types";
import { LiveReview, LiveComparison, time } from "./live-review";
import { AudioCueSettings } from "./audio-cue-settings";
import type { CueAudioOutput } from "@/lib/live/audio-output";
import { CameraCheck } from "./camera-check";
import { CUE_CATALOG } from "@/lib/live/cue-catalog";
const empty: Snapshot = {
  state: "idle",
  seconds: 0,
  partial: "",
  segments: [],
  cues: [],
  events: [],
  level: 0,
  error: "",
  muted: false,
};
export function LiveStudio({ controlled = false, countdownTest = false }: { controlled?: boolean; countdownTest?: boolean }) {
  const [mode, setMode] = useState<Mode>("practice"),
    [audience, setAudience] = useState(""),
    [takeaway, setTakeaway] = useState(""),
    [points, setPoints] = useState(""),
    [limit, setLimit] = useState(countdownTest ? 45 : 60),
    [save, setSave] = useState(false),
    [continueOnFailure, setContinue] = useState(false);
  const [device, setDevice] = useState(""),
    [micBusy, setMicBusy] = useState(false),
    [visual, setVisual] = useState(true),
    [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [cue, setCue] = useState<Cue | null>(null),
    [timeCue, setTimeCue] = useState<Cue | null>(null),
    [results, setResults] = useState<SessionResult[]>([]),
    [selected, setSelected] = useState(0),
    [compare, setCompare] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [configured, setConfigured] = useState<boolean | null>(null);
  const session = useRef<LiveSession | null>(null),
    urls = useRef(new Set<string>()),
    generation = useRef(0),
    visualRef = useRef(true),
    cueTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    frame = useRef<number | undefined>(undefined);
  const audioOutput = useRef<CueAudioOutput | null>(null),
    audioEnabled = useRef(false),
    master = useRef(false);
  const [masterMuted, setMasterMuted] = useState(false);
  const active = [
    "permission",
    "connecting",
    "listening",
    "unavailable",
    "stopping",
  ].includes(snapshot.state);
  const capturing =
    snapshot.state === "listening" || snapshot.state === "unavailable";
  useEffect(() => {
    const recordingUrls = urls.current;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) =>
        setConfigured(
          (d as { transcriptionConfigured: boolean }).transcriptionConfigured,
        ),
      )
      .catch(() => setConfigured(null));
    return () => {
      // Invalidate the latest async start, including starts after this effect mounted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      session.current?.cancel();
      recordingUrls.forEach((u) => URL.revokeObjectURL(u));
      clearTimeout(cueTimer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden && session.current) {
        setCue(null);
        setNotice(
          "Listening stopped because this page left the foreground. Keep it visible during a presentation.",
        );
        void session.current.stop("page-hidden");
      }
    };
    const offline = () => {
      if (session.current) {
        setNotice(
          "Your device is offline. Stop and start a new session after reconnecting.",
        );
        void session.current.stop("offline");
      }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("offline", offline);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("offline", offline);
    };
  }, []);
  const setup = (): Setup => ({
    mode,
    audience: audience.trim(),
    takeaway: takeaway.trim(),
    points: points
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 2),
    limit,
    save: mode === "practice" || save,
    continueOnFailure,
  });
  async function start(retry?: Setup) {
    if (active || micBusy) return;
    setError("");
    setNotice("");
    setCompare(false);
    setCue(null);
    setTimeCue(null);
    setSnapshot({ ...empty, state: "permission" });
    const n = ++generation.current;
    try {
      const source = controlled
        ? new (
            await import("@/lib/live/controlled-source")
          ).ControlledPcmSource(countdownTest ? "/samples/live-countdown.wav" : undefined)
        : new BrowserPcmSource(device);
      if (n !== generation.current) {
        source.stop();
        return;
      }
      const next = new LiveSession(retry ?? setup(), source, {
        change: (s) => {
          if (n === generation.current) {
            setSnapshot(s);
            if (s.state === "unavailable" || s.state === "idle") {
              setCue(null);
              setTimeCue(null);
              audioOutput.current?.silence();
            }
          }
        },
        cue: (c) => {
          if (n !== generation.current || master.current) return;
          if (audioEnabled.current && audioOutput.current)
            void audioOutput.current
              .deliver(c)
              .catch(() => {
                audioEnabled.current = false;
                audioOutput.current?.invalidate();
                setNotice(
                  "Audio output failed. Audio cues are off; check your earbud.",
                );
                session.current?.mute(master.current || !visualRef.current);
              });
          else session.current?.recordAudio(c.id, { status: "off", mode: audioOutput.current?.getMode() ?? "voice", detail: "Audio cues were off for this event." });
          if (!visualRef.current) return;
          if (c.type === "time") setTimeCue(c);
          else {
            setCue(c);
            clearTimeout(cueTimer.current);
            cueTimer.current = setTimeout(() => setCue(null), 5000);
          }
          frame.current = requestAnimationFrame(() => {
            if (n === generation.current && visualRef.current)
              session.current?.markShown(c.id);
          });
        },
        done: (r) => {
          if (n !== generation.current) {
            if (r.audioUrl) URL.revokeObjectURL(r.audioUrl);
            return;
          }
          session.current = null;
          audioOutput.current?.silence();
          setSnapshot({ ...empty, state: "done" });
          setCue(null);
          setTimeCue(null);
          if (!r.complete)
            setNotice("Live coaching or transcript finalization was interrupted. Capture has stopped; this take may have missing words or cues.");
          if (r.audioUrl) urls.current.add(r.audioUrl);
          if (!r.setup.save) {
            setNotice(
              `${r.complete ? "Presentation ended." : "Live coaching was interrupted and capture stopped."} This app discarded the session’s transcript and cue history; no recording was kept. ElevenLabs retention still applies.`,
            );
            return;
          }
          setResults((old) => {
            const updated = [...old, r];
            setSelected(updated.length - 1);
            return updated;
          });
        },
      });
      session.current = next;
      next.mute(
        master.current || (!visualRef.current && !audioEnabled.current),
      );
      await next.start();
    } catch (e) {
      setError(microphoneError(e));
      setSnapshot(empty);
      session.current?.cancel();
      session.current = null;
    }
  }
  function updateMute() {
    session.current?.mute(
      master.current || (!visualRef.current && !audioEnabled.current),
    );
  }
  function mute() {
    master.current = !master.current;
    setMasterMuted(master.current);
    setCue(null);
    setTimeCue(null);
    audioOutput.current?.silence();
    updateMute();
  }
  function visualChange(value: boolean) {
    setVisual(value);
    visualRef.current = value;
    setCue(null);
    setTimeCue(null);
    updateMute();
  }
  function audioChange(value: boolean) {
    audioEnabled.current = value;
    updateMute();
  }
  function stop() {
    setCue(null);
    setTimeCue(null);
    audioOutput.current?.silence();
    clearTimeout(cueTimer.current);
    if (session.current) void session.current.stop();
    else {
      generation.current++;
      setSnapshot(empty);
    }
  }
  function clear() {
    audioOutput.current?.silence();
    generation.current++;
    session.current?.cancel();
    session.current = null;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setResults([]);
    setSelected(0);
    setCompare(false);
    setSnapshot(empty);
    setCue(null);
    setError("");
    setNotice(
      "Session data cleared from this tab. This does not delete provider copies.",
    );
  }
  const current = results[selected];
  const practices = results.filter((r) => r.setup.mode === "practice");
  return (
    <>
      <a className="skip-link" href="#studio">
        Skip to speaking controls
      </a>
      <header className="topbar">
        <Link href="/" className="brand">
          <AudioLines aria-hidden="true" />
          SpeakSense<span className="brand-tag">LIVE COACH</span>
        </Link>
        <span className="small">HackGT · microphone prototype</span>
      </header>
      <main id="studio" className="live-shell">
        {controlled && (
          <div className="notice">
            <strong>Controlled streaming test.</strong> Synthesized speech is
            fed through the browser audio processor in real time and sent to
            Scribe as it plays. It uses API credits. This tests the live
            pipeline; it does not verify your physical microphone or
            natural-speech accuracy.
          </div>
        )}
        <div className="studio-title">
          <div>
            <p className="eyebrow">GUIDANCE WHILE YOU SPEAK</p>
            <h1>Keep your message moving.</h1>
            <p>One useful cue at a time. Your pitch, your pace.</p>
          </div>
          <a className="text-button" href="/review-demo">
            Explore the earlier sample review <ArrowRight size={16} />
          </a>
        </div>
        <div
          className={`studio-layout ${capturing && mode === "presentation" ? "presenting" : ""}`}
        >
          <section className="setup-panel" aria-label="Pitch setup">
            <p className="eyebrow">01 / SET THE CONTEXT</p>
            <fieldset className="mode-picker" disabled={active}>
              <legend className="sr-only">Speaking mode</legend>
              {(["practice", "presentation"] as const).map(value => <label key={value} className={mode === value ? "chosen" : ""}>
                <input type="radio" name="speaking-mode" checked={mode === value} onChange={() => setMode(value)} />
                <span><strong>{value === "practice" ? "Practice" : "Live presentation"}</strong><small>{value === "practice" ? "Rehearse, review, retry" : "Discreet cues in the room"}</small></span>
              </label>)}
            </fieldset>
            {!controlled && (
              <MicrophonePicker
                value={device}
                onChange={setDevice}
                disabled={active}
                onBusyChange={setMicBusy}
              />
            )}
            {controlled && <p className="notice">Synthetic audio input · your microphone is off. <Link href="/">Use my microphone instead</Link></p>}
            <div className="setup-fields">
              <label htmlFor="audience">
                Who will hear your pitch? <span>Optional</span>
              </label>
              <textarea
                id="audience"
                rows={2}
                maxLength={160}
                placeholder="Investors, accelerator judges…"
                value={audience}
                disabled={active}
                onChange={(e) => setAudience(e.target.value)}
              />
              <label htmlFor="takeaway">
                What should they remember or do? <span>Optional</span>
              </label>
              <textarea
                id="takeaway"
                rows={3}
                maxLength={300}
                placeholder="Understand the problem and book a follow-up"
                value={takeaway}
                disabled={active}
                onChange={(e) => setTakeaway(e.target.value)}
              />
              <label htmlFor="limit">How long will you have?</label>
              <div className="duration-field">
                <input
                  id="limit"
                  type="number"
                  min={30}
                  max={600}
                  step={1}
                  value={limit}
                  disabled={active}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
                <span>seconds · 30–600</span>
              </div>
              <details>
                <summary>Message points & saving</summary>
                <label htmlFor="points">
                  Up to two points to check afterward
                </label>
                <textarea
                  id="points"
                  maxLength={600}
                  rows={2}
                  placeholder={"Who the product helps\nYour next-step ask"}
                  value={points}
                  disabled={active}
                  onChange={(e) => setPoints(e.target.value)}
                />
                <p className="small">
                  One point per line. These guide your review; automatic message
                  cues are not enabled.
                </p>
                {mode === "presentation" && (
                  <label className="switch-label">
                    <Switch
                      checked={save}
                      disabled={active}
                      onCheckedChange={setSave}
                    />
                    Keep audio and transcript for review in this tab
                  </label>
                )}
                <label className="switch-label">
                  <Switch
                    checked={continueOnFailure}
                    disabled={active || !(mode === "practice" || save)}
                    onCheckedChange={setContinue}
                  />
                  Keep local recording if live coaching fails
                </label>
              </details>
            </div>
          </section>
          <section
            className="speaking-panel"
            aria-label="Live speaking controls"
          >
            <div className="section-heading">
              <p className="eyebrow">
                02 / {mode === "practice" ? "REHEARSE" : "PRESENT"}
              </p>
              <span
                className={`connection-pill ${capturing ? "is-active" : ""}`}
                role="status"
              >
                {snapshot.state === "listening"
                  ? "Listening · stream connected"
                  : snapshot.state === "unavailable"
                    ? "Live coaching unavailable"
                    : snapshot.state === "permission"
                      ? "Waiting for microphone permission"
                      : snapshot.state === "connecting"
                        ? "Connecting to live transcription"
                        : snapshot.state === "stopping"
                          ? "Microphone off · finalizing transcript"
                          : "Microphone off"}
              </span>
            </div>
            <div className="clock-face">
              <span role="timer" aria-label="Time remaining">
                {time(Math.max(0, limit - snapshot.seconds))}
              </span>
              <p>
                {capturing
                  ? "remaining"
                  : `${mode === "practice" ? "Practice" : "Presentation"} time limit`}
              </p>
            </div>
            <div className="signal-track" aria-label="Microphone signal">
              <span
                style={{ width: `${capturing ? snapshot.level * 100 : 0}%` }}
              />
            </div>
            {capturing && timeCue && visual && !masterMuted && <p className="time-reminder" role="status">{Math.max(0, Math.ceil(limit - snapshot.seconds))} seconds left · live coaching continues</p>}
            <div
              className={`cue-surface ${cue ? "has-cue" : ""}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="eyebrow">
                {cue
                  ? "A SMALL NUDGE"
                  : masterMuted
                    ? "CUES MUTED"
                    : !visual
                      ? "ON-SCREEN CUES OFF"
                      : snapshot.state === "unavailable"
                        ? "COACHING UNAVAILABLE"
                        : "YOUR LIVE CUE"}
              </span>
              <h2>
                {(cue?.type === "time"
                  ? `${Math.max(0, Math.ceil(limit - snapshot.seconds))} seconds left`
                  : cue?.message) ||
                  (!visual || masterMuted
                    ? "Keep speaking."
                    : snapshot.state === "unavailable"
                      ? "Use Stop when you’re ready."
                      : capturing
                        ? "Room to focus."
                        : "Ready when you are.")}
              </h2>
              <p>
                {cue
                  ? CUE_CATALOG[cue.type].help
                  : !visual || masterMuted
                    ? "Listening continues during a take."
                    : capturing
                      ? "Cues appear only when a supported pattern emerges."
                      : "Start listening to receive cues while you speak."}
              </p>
            </div>
            <div className="capture-actions">
              {active ? (
                <>
                  <button
                    className="secondary-button"
                    onClick={mute}
                    disabled={!capturing}
                  >
                    <VolumeX size={18} />
                    {masterMuted ? "Unmute cues" : "Mute cues"}
                  </button>
                  <button
                    className="stop-button"
                    onClick={stop}
                    disabled={snapshot.state === "stopping"}
                  >
                    <Square size={17} />
                    {capturing
                      ? "Stop listening"
                      : snapshot.state === "stopping"
                        ? "Finishing…"
                        : "Cancel start"}
                  </button>
                </>
              ) : (
                <button
                  className="primary-button start-button"
                  disabled={
                    micBusy ||
                    limit < 30 ||
                    limit > 600 ||
                    !Number.isInteger(limit) ||
                    configured === false
                  }
                  onClick={() => void start()}
                >
                  <Mic size={19} />
                  {controlled
                    ? "Start controlled live stream"
                    : "Start listening"}
                </button>
              )}
            </div>
            {controlled && capturing && (
              <button
                className="text-button"
                disabled={snapshot.state !== "listening"}
                onClick={() => session.current?.disconnectControlledStream()}
              >
                Disconnect stream (test)
              </button>
            )}
            {snapshot.state === "listening" && (
              <button className="text-button" disabled={masterMuted || cue?.type === "breathe"} onClick={() => session.current?.breathe()}>
                Breathe · give me a moment
              </button>
            )}
            <label className="switch-label visual-setting">
              <Switch
                checked={visual}
                onCheckedChange={visualChange}
                disabled={snapshot.state === "stopping"}
              />
              Show subtle cues on screen
            </label>
            <AudioCueSettings
              active={active}
              controlledTest={controlled}
              onDelivery={(id, result) => session.current?.recordAudio(id, result)}
              onOutput={(output) => {
                audioOutput.current = output;
              }}
              onEnabled={audioChange}
            />
            {(error || snapshot.error) && (
              <p role="alert" className="error">
                {error || snapshot.error}{" "}
                {snapshot.state === "unavailable"
                  ? "Local recording continues because you enabled it."
                  : ""}
              </p>
            )}
            {configured === false && (
              <p className="error">
                Live coaching needs the server’s ElevenLabs key.
              </p>
            )}
            <p className="processing-note">
              Starting sends{" "}
              {controlled ? "controlled synthetic" : "microphone"} audio
              continuously to ElevenLabs for transcription.{" "}
              {mode === "practice" || save
                ? "Audio, transcript and cue history stay in this tab for review and disappear on refresh or Clear."
                : "No audio recording is kept by this app. Transcript and cue history are discarded when you stop."}{" "}
              ElevenLabs applies its own retention policy. Other nearby voices
              may be captured. Keep this page visible.
            </p>
            {capturing && mode === "practice" && (
              <details className="stream-transcript">
                <summary>Live transcript · recognition can change</summary>
                <p>
                  {snapshot.segments
                    .slice(-2)
                    .map((s) => s.text)
                    .join(" ")}{" "}
                  <em>{snapshot.partial}</em>
                </p>
              </details>
            )}
          </section>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {!active && current && (
          <>
            <div className="review-nav">
              <div className="button-row">
                {results.map((r, i) => (
                  <button
                    key={r.id}
                    className={
                      selected === i && !compare
                        ? "primary-button"
                        : "secondary-button"
                    }
                    onClick={() => {
                      setSelected(i);
                      setCompare(false);
                    }}
                  >
                    Take {i + 1}
                  </button>
                ))}
                {practices.length >= 2 && (
                  <button
                    className="secondary-button"
                    onClick={() => setCompare(true)}
                  >
                    Compare last two practices
                  </button>
                )}
              </div>
              <button className="text-button" onClick={clear}>
                Clear sessions
              </button>
            </div>
            {compare ? (
              <LiveComparison
                first={practices[practices.length - 2]}
                second={practices.at(-1)!}
              />
            ) : (
              <LiveReview
                key={current.id}
                result={current}
                onChange={(r) =>
                  setResults((old) => old.map((x) => (x.id === r.id ? r : x)))
                }
                onRetry={
                  current.setup.mode === "practice"
                    ? () => {
                        setMode("practice");
                        setAudience(current.setup.audience);
                        setTakeaway(current.setup.takeaway);
                        setPoints(current.setup.points.join("\n"));
                        setLimit(current.setup.limit);
                        void start(current.setup);
                      }
                    : undefined
                }
              />
            )}
          </>
        )}
        {!controlled && <CameraCheck speaking={active} />}
        <footer className="studio-footer">
          <p>
            English delivery cues · optional quiet camera check · wearable inputs planned
          </p>
          <a href="/lab">Controlled stream test</a>
          {controlled && <Link href="/lab/countdown">Test speech cues during the final countdown</Link>}
        </footer>
      </main>
    </>
  );
}
