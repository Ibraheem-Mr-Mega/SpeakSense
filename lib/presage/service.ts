import { encodeFrameHeader, FRAME_HEADER_BYTES } from "../../presage-bridge/protocol.mjs";
import {
  FrameClock,
  PULSE_WINDOW_S,
  BASELINE_MIN_SPAN_S,
  alignSample,
  classifySample,
  computeBaseline,
  sliceAttempt,
} from "./timeline.ts";
import type {
  AttemptPhysiology,
  Baseline,
  PhysioSource,
  PresageErrorInfo,
  PresageState,
  PulseSample,
  ValidationEvent,
} from "./types.ts";

export const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:8790/presage";
const FRAME_WIDTH = 640;
const RETAIN_S = 15 * 60;
const IDLE_PAUSE_S = 180;

export type PresageSnapshot = {
  state: PresageState;
  source: PhysioSource | null;
  message: string;
  quality: "good" | "low" | "unknown";
  validation: ValidationEvent | null;
  /** Latest sample, whether or not it passed SpeakSense's validity checks. */
  pulse: PulseSample | null;
  calibration: number;
  baselineReady: boolean;
  fps: number;
  sdkVersion: string | null;
  error: PresageErrorInfo | null;
};

/** What to tell the user for each Presage ValidationCode (from Presage's measurement guide). */
export const VALIDATION_ADVICE: Record<string, string> = {
  OK: "Good signal",
  NO_FACE_FOUND: "Reposition: face the camera",
  MULTIPLE_FACES_FOUND: "Only one person in frame",
  FACE_NOT_CENTERED: "Center your face",
  FACE_SIZE_OUT_OF_RANGE: "Adjust your distance",
  TOO_DARK: "Improve lighting: add light in front of you",
  TOO_BRIGHT: "Reduce bright light behind or above you",
  CHEST_NOT_VISIBLE: "Show your upper chest",
  CAMERA_TUNING: "Camera adjusting…",
  FRAME_RATE_TOO_LOW: "Camera frame rate too low: improve lighting",
  EXCESSIVE_MOTION: "Hold still",
  FACE_TOO_CLOSE: "Move back a little",
  FACE_TOO_FAR: "Move a little closer",
  FACE_TOO_HIGH: "Move down, or tilt the camera up",
  FACE_TOO_LOW: "Move up, or tilt the camera down",
  FACE_NOT_FORWARD: "Face the camera",
};

function errorMessage(e: PresageErrorInfo) {
  switch (e.name) {
    case "AUTHENTICATION_FAILED":
      return "Presage rejected the API key. Check SMARTSPECTRA_API_KEY in .dev.vars and restart the bridge.";
    case "CREDIT_EXHAUSTED":
      return "Presage credits for this API key are exhausted.";
    case "NETWORK_ERROR":
    case "SERVER_ERROR":
      return "The Presage bridge could not reach Presage's servers.";
    case "PROCESSING_FAILED":
      return "Presage stopped processing. Most often the bridge could not authorize with Presage (network or API key). Check the bridge terminal.";
    case "CONFIGURATION_FAILED":
      return `Presage SDK could not initialize: ${e.message}`;
    default:
      return e.message || "Presage reported an error.";
  }
}

export function cameraError(e: unknown) {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError")
    return "Camera permission was denied. Allow camera access in site settings to add physiology context.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera was found.";
  if (name === "NotReadableError")
    return "The camera is in use by another app.";
  return e instanceof Error ? e.message : "The camera could not start.";
}

type Events = {
  change: PresageSnapshot;
  metric: PulseSample;
  validation: ValidationEvent;
  error: PresageErrorInfo;
};

/**
 * Browser side of the Presage integration. Owns the camera stream, pushes frames to
 * the localhost bridge (which runs the SmartSpectra SDK), and keeps a buffer of pulse
 * samples on the page's performance clock so they can be cut per speaking attempt.
 */
export class PresageService {
  private listeners: { [K in keyof Events]: Set<(v: Events[K]) => void> } = {
    change: new Set(),
    metric: new Set(),
    validation: new Set(),
    error: new Set(),
  };
  private snap: PresageSnapshot = PresageService.idle();
  private ws?: WebSocket;
  private media: MediaStream | null = null;
  private video?: HTMLVideoElement;
  private canvas?: HTMLCanvasElement;
  private frameClock = new FrameClock(performance.timeOrigin);
  private samples: PulseSample[] = [];
  private seen = new Set<number>();
  private validation: ValidationEvent[] = [];
  private errors: string[] = [];
  private takes: [number, number][] = [];
  private lastBaseline: Baseline | null = null;
  private sdkStartedAt = 0;
  private pumping = false;
  private frameHandle = 0;
  private busy = false;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private run = 0;
  private stopping = false;
  private failedAt = 0;

  constructor(private bridgeUrl = DEFAULT_BRIDGE_URL) {}

  static idle(): PresageSnapshot {
    return {
      state: "off",
      source: null,
      message: "Camera context off",
      quality: "unknown",
      validation: null,
      pulse: null,
      calibration: 0,
      baselineReady: false,
      fps: 0,
      sdkVersion: null,
      error: null,
    };
  }

  static healthUrl(bridgeUrl: string) {
    const u = new URL(bridgeUrl);
    u.protocol = u.protocol === "wss:" ? "https:" : "http:";
    u.pathname = "/health";
    return u.toString();
  }

  on<K extends keyof Events>(event: K, fn: (v: Events[K]) => void) {
    this.listeners[event].add(fn);
    return () => void this.listeners[event].delete(fn);
  }
  private emit<K extends keyof Events>(event: K, value: Events[K]) {
    this.listeners[event].forEach((fn) => fn(value));
  }
  private update(patch: Partial<PresageSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.emit("change", this.snap);
  }
  snapshot() {
    return this.snap;
  }
  get stream() {
    return this.media;
  }
  private now() {
    return performance.now() / 1000;
  }

  async start() {
    if (this.snap.state !== "off" && this.snap.state !== "unavailable") return;
    this.reset();
    const run = ++this.run;
    this.stopping = false;
    this.update({ ...PresageService.idle(), state: "camera", message: "Waiting for camera permission" });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera capture needs HTTPS or localhost.");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });
      if (run !== this.run) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      this.media = media;
      media.getVideoTracks()[0].onended = () =>
        this.fail("The camera disconnected. Speech coaching continues without physiology.");
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = media;
      await video.play();
      this.video = video;
    } catch (e) {
      if (run === this.run) this.fail(cameraError(e));
      return;
    }
    this.update({ state: "connecting", message: "Connecting to Presage bridge" });
    this.connect(run);
  }

  private connect(run: number) {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.bridgeUrl);
    } catch {
      this.fail(`Presage bridge URL is invalid: ${this.bridgeUrl}`);
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) ws.close();
    }, 5000);
    ws.onopen = () => {
      clearTimeout(timeout);
      ws.send(JSON.stringify({ type: "start" }));
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      if (run !== this.run || this.stopping) return;
      this.fail(
        this.snap.state === "connecting"
          ? "Presage bridge is not running. Start it with `pnpm presage:bridge`, then retry."
          : "Lost connection to the Presage bridge.",
      );
    };
    ws.onmessage = (event) => {
      if (run !== this.run || typeof event.data !== "string") return;
      try {
        this.message(JSON.parse(event.data));
      } catch {
        /* ignore malformed bridge messages */
      }
    };
  }

  private message(m: Record<string, unknown>) {
    const source = m.source === "mock" ? "mock" : "presage";
    switch (m.type) {
      case "hello":
        this.update({ source, sdkVersion: (m.sdkVersion as string) ?? null });
        if (!m.ok) this.fail(String(m.error || "Presage bridge is not configured."));
        return;
      case "started":
        this.sdkStartedAt = this.now();
        this.update({
          state: "calibrating",
          source,
          sdkVersion: (m.sdkVersion as string) ?? this.snap.sdkVersion,
          message: "Calibrating camera signal: hold still and stay quiet",
        });
        this.pump();
        this.armIdle();
        return;
      case "validation": {
        const { t } = alignSample(
          Number(m.timestampUs),
          { first: this.frameClock.first, last: this.frameClock.latest },
          this.now(),
          performance.timeOrigin,
        );
        const e: ValidationEvent = {
          t,
          code: Number(m.code),
          name: String(m.name),
          hint: String(m.hint || ""),
        };
        if (this.validation.at(-1)?.code !== e.code) this.validation.push(e);
        this.emit("validation", e);
        this.refresh(e);
        return;
      }
      case "metrics":
        for (const p of (m.pulse as Record<string, number>[]) ?? []) this.sample(p);
        this.refresh();
        return;
      case "stats":
        this.update({ fps: Number(m.fps) || 0 });
        return;
      case "error": {
        const info: PresageErrorInfo = {
          code: Number(m.code),
          name: String(m.name),
          message: String(m.message || ""),
          retryable: !!m.retryable,
        };
        this.emit("error", info);
        this.fail(errorMessage(info), info);
        return;
      }
      case "preempted":
        this.fail("The camera signal moved to another SpeakSense tab.");
        return;
    }
  }

  private sample(p: Record<string, number>) {
    if (this.seen.has(p.timestampUs)) return;
    this.seen.add(p.timestampUs);
    const { t, timebase } = alignSample(
      p.timestampUs,
      { first: this.frameClock.first, last: this.frameClock.latest },
      this.now(),
      performance.timeOrigin,
    );
    const raw = { t, bpm: Math.round(p.value * 10) / 10, confidence: p.confidence, stable: !!p.stable };
    const sample: PulseSample = {
      ...raw,
      timebase,
      ...classifySample(raw, this.validation, this.sdkStartedAt),
    };
    let i = this.samples.length;
    while (i > 0 && this.samples[i - 1].t > sample.t) i--;
    this.samples.splice(i, 0, sample);
    const cutoff = this.now() - RETAIN_S;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    this.emit("metric", sample);
  }

  private refresh(latestValidation?: ValidationEvent) {
    if (!["calibrating", "ready"].includes(this.snap.state)) return;
    const validation = latestValidation ?? this.validation.at(-1) ?? null;
    const pulse = this.samples.at(-1) ?? null;
    const now = this.now();
    const baselineReady = !!computeBaseline(this.samples, now, this.takes) || !!this.lastBaseline;
    const signalOk = !validation || validation.code === 0;
    const quality: PresageSnapshot["quality"] = !signalOk
      ? "low"
      : pulse?.valid
        ? "good"
        : pulse && pulse.reason !== "warmup"
          ? "low"
          : "unknown";
    const advice = validation && validation.code !== 0
      ? VALIDATION_ADVICE[validation.name] ?? validation.hint
      : "";
    const state: PresageState = baselineReady ? "ready" : "calibrating";
    this.update({
      state,
      validation,
      pulse,
      quality,
      baselineReady,
      calibration: baselineReady
        ? 1
        : Math.min(0.95, (now - this.sdkStartedAt) / (PULSE_WINDOW_S + BASELINE_MIN_SPAN_S + 2)),
      message:
        advice ||
        (state === "ready"
          ? quality === "low"
            ? "Low confidence: hold still in even light"
            : "Good signal · baseline ready"
          : "Calibrating camera signal: hold still and stay quiet"),
    });
  }

  /** Grab camera frames at the camera's own cadence and ship RGBA to the bridge. */
  private pump() {
    const video = this.video;
    if (!video || this.pumping) return;
    this.pumping = true;
    const canvas = document.createElement("canvas");
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      this.fail("This browser cannot read camera frames.");
      return;
    }
    const tick = (clockMs?: number) => {
      if (!this.pumping) return;
      const ws = this.ws;
      const w = Math.min(FRAME_WIDTH, video.videoWidth),
        h = Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth));
      if (w && h && ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < w * h * 8) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.drawImage(video, 0, 0, w, h);
        const pixels = ctx.getImageData(0, 0, w, h).data;
        const packet = new Uint8Array(FRAME_HEADER_BYTES + pixels.length);
        const ts = this.frameClock.next((clockMs ?? performance.now()) / 1000);
        packet.set(new Uint8Array(encodeFrameHeader(w, h, ts)), 0);
        packet.set(pixels, FRAME_HEADER_BYTES);
        ws.send(packet);
      }
      schedule();
    };
    const schedule = () => {
      if (!this.pumping) return;
      if ("requestVideoFrameCallback" in video)
        this.frameHandle = video.requestVideoFrameCallback((now) => tick(now));
      else this.frameHandle = window.setTimeout(() => tick(), 33);
    };
    schedule();
  }

  /** While a take is running the camera never auto-pauses. */
  setBusy(busy: boolean) {
    this.busy = busy;
    this.armIdle();
  }
  private armIdle() {
    clearTimeout(this.idleTimer);
    if (this.busy || !["calibrating", "ready"].includes(this.snap.state)) return;
    this.idleTimer = setTimeout(
      () => this.stop("Camera paused after 3 idle minutes to save Presage credits."),
      IDLE_PAUSE_S * 1000,
    );
  }

  /**
   * Physiology for one attempt. `origin` is the speech capture start on the
   * performance clock (seconds), the same origin as ASR word timestamps.
   */
  attempt(origin: number, duration: number): AttemptPhysiology | undefined {
    if (!this.sdkStartedAt || !this.snap.source) return;
    // Camera context had already failed before this take began: it contributed nothing.
    if (this.failedAt && this.failedAt < origin) return;
    const fresh = computeBaseline(this.samples, origin, this.takes);
    const baseline = fresh ?? (this.lastBaseline ? { ...this.lastBaseline, carried: true } : null);
    if (fresh) this.lastBaseline = fresh;
    this.takes.push([origin, origin + duration]);
    this.armIdle();
    return sliceAttempt({
      samples: this.samples,
      validation: this.validation,
      origin,
      duration,
      baseline,
      source: this.snap.source,
      sdkVersion: this.snap.sdkVersion,
      errors: this.errors,
    });
  }

  private fail(message: string, error: PresageErrorInfo | null = null) {
    this.errors.push(message);
    this.failedAt = this.now();
    this.halt();
    this.update({ state: "unavailable", message, error, quality: "unknown", fps: 0 });
  }

  /** Stop capture and the bridge session but keep the buffer (a take may still be finalizing). */
  private halt() {
    this.stopping = true;
    this.pumping = false;
    clearTimeout(this.idleTimer);
    if (this.video && "cancelVideoFrameCallback" in this.video)
      this.video.cancelVideoFrameCallback(this.frameHandle);
    clearTimeout(this.frameHandle);
    const ws = this.ws;
    this.ws = undefined;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
      setTimeout(() => ws.close(), 250);
    }
    this.media?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.media = null;
    if (this.video) this.video.srcObject = null;
    this.video = undefined;
    this.canvas = undefined;
  }

  private reset() {
    this.samples = [];
    this.seen.clear();
    this.validation = [];
    this.errors = [];
    this.takes = [];
    this.lastBaseline = null;
    this.sdkStartedAt = 0;
    this.failedAt = 0;
    this.frameClock = new FrameClock(performance.timeOrigin);
  }

  /** Forget earlier takes (after "Clear sessions") while keeping the live camera signal. */
  clearTakes() {
    this.takes = [];
    this.lastBaseline = null;
    this.errors = [];
  }

  /** Turn camera context off and forget all buffered readings. */
  stop(message = "Camera context off") {
    this.run++;
    this.halt();
    this.reset();
    this.snap = { ...PresageService.idle(), message };
    this.emit("change", this.snap);
  }
}
