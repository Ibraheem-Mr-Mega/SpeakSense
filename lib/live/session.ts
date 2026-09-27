import { CueEngine } from "./cues.ts";
import { audioMessage, parseSegment, realtimeUrl } from "./protocol.ts";
import { pcmWav, type PcmSource } from "./pcm-source.ts";
import type { AudioDelivery } from "./audio-output.ts";
import type {
  Cue,
  Diagnostic,
  Segment,
  SessionResult,
  SessionState,
  Setup,
} from "./types.ts";
export type Snapshot = {
  state: SessionState;
  seconds: number;
  partial: string;
  segments: Segment[];
  cues: Cue[];
  events: Diagnostic[];
  level: number;
  error: string;
  muted: boolean;
};
type Callbacks = {
  change: (snapshot: Snapshot) => void;
  cue: (cue: Cue) => void;
  done: (result: SessionResult) => void;
};
type Dependencies = {
  token?: (signal: AbortSignal) => Promise<string>;
  socket?: (url: string) => WebSocket;
  now?: () => number;
};
export class LiveSession {
  readonly engine: CueEngine;
  private source: PcmSource;
  private callbacks: Callbacks;
  private setup: Setup;
  private deps: Dependencies;
  private ws?: WebSocket;
  private abort = new AbortController();
  private state: SessionState = "idle";
  private segments: Segment[] = [];
  private events: Diagnostic[] = [];
  private frames: Int16Array[] = [];
  private samples = 0;
  private started?: number;
  private lastFrame = 0;
  private lastMessage = 0;
  private lastVoice = 0;
  private timer?: ReturnType<typeof setInterval>;
  private partial = "";
  private error = "";
  private level = 0;
  private complete = true;
  private ending = false;
  private discarded = false;
  private finalTimer?: ReturnType<typeof setTimeout>;
  private receivedUntimed = 0;
  private receivedTimed = 0;
  constructor(
    setup: Setup,
    source: PcmSource,
    callbacks: Callbacks,
    deps: Dependencies = {},
  ) {
    this.setup = { ...setup, points: [...setup.points] };
    this.source = source;
    this.callbacks = callbacks;
    this.deps = deps;
    this.engine = new CueEngine(setup.limit);
  }
  private clock() {
    return (this.deps.now?.() ?? performance.now()) / 1000;
  }
  elapsed() {
    return this.started === undefined
      ? 0
      : Math.max(0, this.clock() - this.started);
  }
  private log(type: string, detail: string) {
    this.events.push({ at: this.elapsed(), type, detail });
  }
  snapshot(): Snapshot {
    return {
      state: this.state,
      seconds: this.elapsed(),
      partial: this.partial,
      segments: [...this.segments],
      cues: this.engine.events.map((c) => ({ ...c })),
      events: [...this.events],
      level: this.level,
      error: this.error,
      muted: this.engine.muted,
    };
  }
  private publish() {
    if (!this.discarded) this.callbacks.change(this.snapshot());
  }
  async start() {
    this.state = "permission";
    this.publish();
    try {
      await this.source.prepare(this.abort.signal);
      if (this.abort.signal.aborted) return;
      this.state = "connecting";
      this.publish();
      const token = await (
        this.deps.token ??
        (async (signal) => {
          const r = await fetch("/api/realtime-token", {
            method: "POST",
            signal,
          });
          const d = (await r.json()) as { token?: string; error?: string };
          if (!r.ok || !d.token)
            throw new Error(d.error || "Live authorization failed.");
          return d.token as string;
        })
      )(this.abort.signal);
      if (this.abort.signal.aborted) return;
      this.ws = (this.deps.socket ?? ((url) => new WebSocket(url)))(
        realtimeUrl(token),
      );
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error("Live connection timed out.")),
          12000,
        );
        const abort = () => {
          clearTimeout(deadline);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        this.abort.signal.addEventListener("abort", abort, { once: true });
        const ready = () => {
          clearTimeout(deadline);
          this.abort.signal.removeEventListener("abort", abort);
          resolve();
        };
        this.ws!.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data));
            this.lastMessage = this.clock();
            if (data.message_type === "session_started") {
              ready();
              return;
            }
            if (typeof data.error === "string")
              throw new Error(
                `Live transcription stopped (${data.message_type}). Check your connection, API access, or credits.`,
              );
            if (data.message_type === "warning") {
              this.log(
                "provider-warning",
                "ElevenLabs reported a session warning. Standard provider retention applies.",
              );
              return;
            }
            if (data.message_type === "partial_transcript") {
              this.partial = typeof data.text === "string" ? data.text : "";
              this.publish();
              return;
            }
            if (
              data.message_type === "committed_transcript" &&
              data.text?.trim()
            ) {
              this.receivedUntimed++;
              this.partial = "";
            }
            const segment = parseSegment(
              data,
              this.elapsed(),
              this.samples / 16000,
              this.segments.at(-1),
            );
            if (segment) {
              this.receivedTimed++;
              this.segments.push(segment);
              this.partial = "";
              if (!this.ending && this.state === "listening")
                this.deliver(this.engine.commit(this.segments, this.elapsed()));
              this.publish();
            }
          } catch (e) {
            clearTimeout(deadline);
            if (this.state === "connecting") reject(e);
            else
              this.failure(
                e instanceof Error ? e.message : "Invalid live response.",
              );
          }
        };
        this.ws!.onerror = () => {
          clearTimeout(deadline);
          if (this.state === "connecting")
            reject(new Error("Unable to connect to live transcription."));
          else this.failure("Live connection failed.");
        };
        this.ws!.onclose = () => {
          clearTimeout(deadline);
          if (this.state === "connecting")
            reject(new Error("Live connection closed before it was ready."));
          else if (!this.ending) this.failure("Live connection lost.");
        };
      });
      if (this.abort.signal.aborted) return;
      this.started = this.clock();
      this.lastFrame = this.clock();
      this.lastMessage = this.clock();
      this.state = "listening";
      this.log(
        "connection",
        "Scribe v2 Realtime connected. Audio streaming begins.",
      );
      this.publish();
      this.source.begin(
        (pcm) => this.frame(pcm),
        (message) => {
          this.failure(message);
          void this.stop();
        },
      );
      this.timer = setInterval(() => {
        const now = this.elapsed();
        if (this.clock() - this.lastFrame > 2.5) {
          this.failure("Audio capture stopped delivering frames.");
          void this.stop();
          return;
        }
        if (
          this.state === "listening" &&
          this.lastVoice > this.lastMessage &&
          this.clock() - this.lastMessage > 20
        )
          this.failure("Live transcription has stopped responding to speech.");
        if (this.state === "listening") this.deliver(this.engine.tick(now));
        this.publish();
        if (now >= this.setup.limit) void this.stop("time-limit");
      }, 100);
    } catch (e) {
      this.source.stop();
      this.ws?.close();
      if (this.abort.signal.aborted) return;
      this.error =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access in site settings, then try again."
          : e instanceof Error
            ? e.message
            : "Could not start live coaching.";
      this.log("start-failed", this.error);
      this.state = "idle";
      this.publish();
    }
  }
  private frame(pcm: Int16Array) {
    if (this.ending || !["listening", "unavailable"].includes(this.state))
      return;
    const remaining = Math.max(0, this.setup.limit * 16000 - this.samples);
    if (!remaining) {
      void this.stop("audio-limit");
      return;
    }
    if (pcm.length > remaining) pcm = pcm.slice(0, remaining);
    // First complete frame gives the capture time origin (100ms frames from the worklet).
    if (!this.samples) this.started = this.clock() - pcm.length / 16000;
    this.lastFrame = this.clock();
    this.samples += pcm.length;
    if (this.setup.save) this.frames.push(pcm.slice());
    const rms = Math.sqrt(pcm.reduce((s, v) => s + (v / 32768) ** 2, 0) / pcm.length);
    this.level = Math.min(1, rms * 5);
    if (this.level > 0.06) this.lastVoice = this.clock();
    this.engine.levels.observe(rms, this.samples / 16000);
    if (this.state === "listening") {
      if (this.ws?.readyState !== 1 || this.ws.bufferedAmount > 128000) {
        this.failure(
          "Live upload is falling behind. Speech cues are unavailable.",
        );
        return;
      }
      try {
        this.ws.send(audioMessage(pcm));
      } catch {
        this.failure("Live audio could not be sent.");
      }
    }
  }
  private deliver(cue?: Cue) {
    if (cue) cue.audioSentAt = this.samples / 16000;
    if (cue?.delivery === "pending") this.callbacks.cue({ ...cue });
  }
  markShown(id: string) {
    this.engine.markShown(id, this.elapsed());
    this.publish();
  }
  breathe() {
    if (this.state === "listening") {
      this.deliver(this.engine.breathe(this.elapsed()));
      this.publish();
    }
  }
  markAudio(id: string) {
    const c = this.engine.events.find((c) => c.id === id);
    if (c && !this.engine.muted && !this.ending) {
      c.audioAt = this.elapsed();
      if (c.delivery === "pending") c.delivery = "audio-only";
      this.publish();
    }
  }
  recordAudio(id: string, result: AudioDelivery) {
    const cue = this.engine.events.find(c => c.id === id);
    if (!cue) return;
    cue.audioStatus = result.status;
    cue.audioMode = result.mode;
    cue.audioDetail = result.detail;
    cue.audioQueueMs = result.queueMs;
    if (result.status === "started") this.markAudio(id);
    this.log("audio-" + result.status, `${result.mode} ${cue.type}: ${result.detail}`);
    this.publish();
  }
  mute(value: boolean) {
    this.engine.muted = value;
    for (const c of this.engine.events)
      if (c.delivery === "pending") c.delivery = "muted";
    this.log(
      value ? "cues-muted" : "cues-unmuted",
      "Capture and transcription continue; no delayed cues are queued.",
    );
    this.publish();
  }
  private failure(message: string) {
    if (this.discarded || this.state === "unavailable") return;
    this.complete = false;
    this.error = message;
    this.engine.stop();
    this.partial = "";
    this.log("connection-failure", message);
    if (!this.ending) {
      this.state = "unavailable";
      this.ws?.close();
      this.publish();
      if (!this.setup.continueOnFailure || !this.setup.save) void this.stop();
    }
  }
  async stop(reason = "user-stop") {
    if (this.ending) return;
    if (reason === "offline") {
      this.complete = false;
      this.log("connection-failure", "Device went offline; capture stopped.");
    }
    this.ending = true;
    this.engine.stop();
    this.source.stop();
    clearInterval(this.timer);
    if (this.started === undefined) {
      this.abort.abort();
      this.ws?.close();
      this.state = "idle";
      this.publish();
      return;
    }
    this.state = "stopping";
    this.log(
      "capture-stopped",
      `${reason}: microphone stopped immediately. Waiting briefly for already-sent transcript.`,
    );
    this.publish();
    if (this.ws?.readyState === 1) {
      try {
        this.ws.send(audioMessage(new Int16Array(0), true));
      } catch {
        this.complete = false;
      }
    }
    await new Promise<void>((resolve) => {
      this.finalTimer = setTimeout(resolve, 2200);
    });
    this.ws?.close();
    if (this.discarded) return;
    if (this.receivedUntimed > this.receivedTimed || this.partial.trim()) {
      this.complete = false;
      this.log(
        "incomplete-transcript",
        "Some final words did not receive timestamps before the connection closed.",
      );
    }
    this.partial = "";
    this.state = "done";
    const duration = this.samples / 16000;
    this.log("capture-summary", `${duration.toFixed(2)} seconds of PCM captured at 16 kHz; no batch transcription request was made.`);
    const audioUrl =
      this.setup.save && this.frames.length
        ? URL.createObjectURL(pcmWav(this.frames))
        : undefined;
    this.frames = [];
    const result: SessionResult = {
      id: crypto.randomUUID(),
      setup: this.setup,
      duration,
      audioUrl,
      segments: this.setup.save ? [...this.segments] : [],
      cues: this.setup.save ? this.engine.events.map((c) => ({ ...c })) : [],
      events: this.setup.save ? [...this.events] : [],
      complete: this.complete,
      microphone: this.source.label,
      source: this.source.kind,
      clockOrigin: this.started,
    };
    this.segments = [];
    if (!this.setup.save) {
      this.engine.events.length = 0;
      this.events = [];
    }
    this.callbacks.done(result);
  }
  disconnectControlledStream() {
    if (this.source.kind === "controlled" && !this.ending) {
      this.log(
        "test-disconnect",
        "Controlled lab closed the active WebSocket.",
      );
      this.ws?.close(4000, "Controlled connection-loss check");
    }
  }
  cancel() {
    this.discarded = true;
    this.ending = true;
    this.abort.abort();
    this.engine.stop();
    this.source.stop();
    this.ws?.close();
    clearInterval(this.timer);
    clearTimeout(this.finalTimer);
    this.frames = [];
    this.segments = [];
    this.events = [];
  }
}
