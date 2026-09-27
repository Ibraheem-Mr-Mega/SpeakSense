import { pcmWav } from "./pcm-source.ts";
import type { Cue } from "./types.ts";
import { CUE_CATALOG, VOICE_PHRASES, voiceKey, type VoiceKey } from "./cue-catalog.ts";
export type RoutedAudio = HTMLAudioElement & {
  setSinkId?: (id: string) => Promise<void>;
  sinkId?: string;
};
/** A tone has no spoken words for ASR to mistake for the presenter. Output is opt-in. */
export function cueTone(type: Cue["type"]): Blob {
  const frequencies = CUE_CATALOG[type].tones;
  const samples = new Int16Array(Math.ceil(frequencies.length * 0.22 * 16000));
  frequencies.forEach((frequency, index) => {
    for (let i = 0; i < 2400; i++) {
      const envelope = Math.sin((Math.PI * i) / 2400) ** 2;
      samples[index * 3520 + i] = Math.round(
        Math.sin((2 * Math.PI * frequency * i) / 16000) * envelope * 8000,
      );
    }
  });
  return pcmWav([samples]);
}
export type AudioMode = "tone" | "voice";
export type AudioDelivery = { status: NonNullable<Cue["audioStatus"]>; mode: AudioMode; detail: string; queueMs?: number };
type Job = { cue: Cue; at: number; version: number; mode: AudioMode; resolve: (started: boolean) => void };
export const SYSTEM_OUTPUT = "system-output";
export class CueAudioOutput {
  private sink = "";
  private version = 0;
  private confirmed = false;
  private previewed = false;
  private enabled = false;
  private mode: AudioMode = "tone";
  private clips = new Map<VoiceKey, string>();
  private tones = new Map<Cue["type"], string>();
  private queue: Job[] = [];
  private finish?: () => void;
  private disposed = false;
  onInvalidated?: () => void;
  onStatus?: (id: string, result: AudioDelivery) => void;
  constructor(private audio: RoutedAudio = new Audio(), private load: typeof fetch = (input, init) => fetch(input, init)) {
    this.audio.preload = "auto";
  }
  supported() { return typeof this.audio.setSinkId === "function"; }
  hasOutput() { return !!this.sink; }
  getMode() { return this.mode; }
  async setMode(mode: AudioMode) {
    this.disable();
    this.previewed = false;
    this.confirmed = false;
    this.mode = mode;
    if (mode === "voice") {
      for (const key of Object.keys(VOICE_PHRASES) as VoiceKey[]) {
        if (this.clips.has(key)) continue;
        const r = await this.load("/cues/" + key + ".mp3", { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error("Voice clips could not load. Try again or select Tone.");
        const blob = await r.blob();
        if (this.disposed) return;
        this.clips.set(key, URL.createObjectURL(blob));
      }
    }
  }
  async choose(id: string) {
    this.invalidate();
    if (!id || id === "default" || id === "communications") throw new Error("Choose an output or Use system output.");
    const version = this.version;
    if (id === SYSTEM_OUTPUT) {
      if (this.supported()) await this.audio.setSinkId!("");
    } else {
      if (!this.supported()) throw new Error("Use system output in this browser.");
      await this.audio.setSinkId!(id);
    }
    if (version !== this.version) throw new Error("Output changed. Choose it again.");
    this.sink = id;
  }
  private source(cue: Cue, mode: AudioMode) {
    if (mode === "voice") {
      const url = this.clips.get(voiceKey(cue));
      if (!url) throw new Error("Voice clip unavailable. Select Voice again to load it.");
      return url;
    }
    if (!this.tones.has(cue.type)) this.tones.set(cue.type, URL.createObjectURL(cueTone(cue.type)));
    return this.tones.get(cue.type)!;
  }
  private checkRoute() {
    if (!this.sink || (this.sink !== SYSTEM_OUTPUT && this.audio.sinkId !== this.sink))
      throw new Error("Audio output changed; prompts are off.");
  }
  async preview(key: VoiceKey = "breathe") {
    this.silence();
    this.previewed = false;
    this.confirmed = false;
    this.checkRoute();
    const version = this.version;
    const cue = key.startsWith("time-") ? { type: "time", timeRemaining: Number(key.slice(5)) } : { type: key };
    this.audio.src = this.source(cue as Cue, this.mode);
    this.audio.currentTime = 0;
    // Assets are ready before this click; play() stays in the user gesture for Safari.
    await this.audio.play();
    if (version !== this.version) { this.audio.pause(); throw new Error("Output test interrupted."); }
    this.previewed = true;
  }
  confirm(value = true) {
    this.confirmed = value && !!this.sink && this.previewed;
    if (!value) this.disable();
  }
  setEnabled(value: boolean) {
    if (value && (!this.sink || !this.confirmed)) throw new Error("Test the output and confirm where you heard it first.");
    this.enabled = value;
    if (!value) this.silence();
  }
  setVolume(value: number) { this.audio.volume = Math.max(0, Math.min(1, value)); }
  deliver(cue: Cue): Promise<boolean> {
    if (!this.enabled || !this.confirmed || !this.sink) {
      this.report(cue.id, "off", "Audio cues are off.");
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      if (this.queue.length >= 2) {
        this.report(cue.id, "expired", "Another prompt is playing; queue is full.");
        resolve(false);
        return;
      }
      const job = { cue, at: performance.now(), version: this.version, mode: this.mode, resolve };
      this.queue.push(job);
      this.report(cue.id, "queued", "Waiting for the current prompt to finish.");
      this.next();
    });
  }
  private report(id: string, status: AudioDelivery["status"], detail: string, queueMs?: number, mode = this.mode) {
    this.onStatus?.(id, { status, mode, detail, queueMs });
  }
  private next() {
    if (this.finish) return;
    const job = this.queue.shift();
    if (!job) return;
    const delay = performance.now() - job.at;
    if (!this.enabled || job.version !== this.version || delay > 3500) {
      this.report(job.cue.id, delay > 3500 ? "expired" : "cancelled", "Prompt became stale or was muted.", delay, job.mode);
      job.resolve(false);
      this.next();
      return;
    }
    let started = false, settled = false;
    const cleanup = () => {
      clearTimeout(deadline);
      this.audio.onended = null;
      this.audio.onerror = null;
      this.finish = undefined;
      settled = true;
    };
    const finish = () => {
      if (settled) return;
      cleanup();
      if (!started) job.resolve(false);
      this.next();
    };
    const fail = () => {
      if (settled) return;
      this.report(job.cue.id, "failed", "Playback failed or did not finish in time.", delay, job.mode);
      cleanup();
      job.resolve(false);
      this.invalidate();
    };
    const deadline = setTimeout(fail, 6000);
    this.finish = () => {
      if (settled) return;
      this.report(job.cue.id, "cancelled", "Playback interrupted by mute, stop or output change.", delay, job.mode);
      cleanup();
      job.resolve(false);
    };
    this.audio.onended = finish;
    this.audio.onerror = fail;
    try {
      this.checkRoute();
      this.audio.src = this.source(job.cue, job.mode);
      this.audio.currentTime = 0;
      void this.audio.play().then(() => {
        if (settled || job.version !== this.version) return;
        started = true;
        this.report(job.cue.id, "started", "Browser playback started; physical audibility requires your output test.", delay, job.mode);
        job.resolve(true);
      }, fail);
    } catch { fail(); }
  }
  silence() {
    this.version++;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.finish?.();
    for (const job of this.queue.splice(0)) {
      this.report(job.cue.id, "cancelled", "Prompt cancelled by mute, stop or output change.", undefined, job.mode);
      job.resolve(false);
    }
  }
  disable() { this.enabled = false; this.silence(); }
  invalidate() {
    this.disable();
    this.confirmed = false;
    this.previewed = false;
    this.sink = "";
    this.onInvalidated?.();
  }
  devicesChanged() {
    // Initial device enumeration is not a disconnected, previously tested output.
    if (!this.hasOutput()) return false;
    this.invalidate();
    return true;
  }
  dispose() {
    this.disposed = true;
    this.onInvalidated = undefined;
    this.invalidate();
    this.onStatus = undefined;
    this.audio.removeAttribute("src");
    for (const url of [...this.clips.values(), ...this.tones.values()]) URL.revokeObjectURL(url);
  }
}
