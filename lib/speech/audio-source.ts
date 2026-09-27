import type { Recording } from "./types.ts";
export interface AudioSource {
  start(options: {
    onTick: (seconds: number) => void;
    onLevel: (level: number) => void;
    onComplete: (recording: Recording) => void;
    onError: (error: Error) => void;
  }): Promise<void>;
  stop(): void;
  cancel(): void;
}
/** Capture is an adapter. Transcription, analysis, and comparison only consume Recording. */
export class MicrophoneSource implements AudioSource {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private timer?: ReturnType<typeof setInterval>;
  private deadline?: ReturnType<typeof setTimeout>;
  private cancelled = false;
  private stopping = false;
  private started = 0;
  private stoppedAt = 0;
  constructor(private readonly deviceId = "") {}
  async start(options: Parameters<AudioSource["start"]>[0]) {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    )
      throw new Error(
        "Recording needs HTTPS (or localhost) and a browser with MediaRecorder support. Try current Safari, Chrome, or Edge.",
      );
    this.cancelled = false;
    this.stopping = false;
    this.stoppedAt = 0;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
        },
        video: false,
      });
      if (this.cancelled) {
        this.release();
        return;
      }
      const microphoneLabel =
        this.stream.getAudioTracks()[0]?.label || "Device microphone";
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(
        this.stream,
        mime ? { mimeType: mime } : undefined,
      );
      this.recorder = recorder;
      const chunks: BlobPart[] = [];
      let interrupted = false;
      let readLevel = () => 0;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => {
        this.cancel();
        options.onError(
          new Error(
            "Recording was interrupted. Please check microphone access and try again.",
          ),
        );
      };
      recorder.onstop = () => {
        const duration =
          ((this.stoppedAt || performance.now()) - this.started) / 1000;
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        this.release();
        if (!this.cancelled)
          options.onComplete({
            blob,
            duration,
            source: "microphone",
            interrupted,
            microphoneLabel,
          });
      };
      this.stream.getAudioTracks().forEach((t) => {
        t.onended = () => {
          interrupted = true;
          this.stop();
        };
      });
      // The optional signal meter must never block capture on browsers that suspend Web Audio.
      try {
        this.context = new AudioContext();
        void this.context.resume().catch(() => {});
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 256;
        this.context.createMediaStreamSource(this.stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        readLevel = () => {
          analyser.getByteTimeDomainData(data);
          return Math.min(
            1,
            Math.sqrt(
              data.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) /
                data.length,
            ) * 5,
          );
        };
      } catch {}
      this.started = performance.now();
      recorder.start(250);
      options.onTick(0);
      this.timer = setInterval(() => {
        if (this.stopping) return;
        const elapsed = (performance.now() - this.started) / 1000;
        options.onTick(elapsed);
        options.onLevel(readLevel());
        if (elapsed >= 60) this.stop();
      }, 100);
      this.deadline = setTimeout(() => this.stop(), 60000);
    } catch (e) {
      this.release();
      throw e;
    }
  }
  stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.stoppedAt = performance.now();
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.release();
  }
  cancel() {
    this.cancelled = true;
    this.stop();
    this.release();
  }
  private release() {
    clearInterval(this.timer);
    clearTimeout(this.deadline);
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    void this.context?.close().catch(() => {});
  }
}
export async function recordingDuration(
  blob: Blob,
  fallback: number,
): Promise<number> {
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return Number.isFinite(decoded.duration) && decoded.duration > 0
      ? decoded.duration
      : fallback;
  } catch {
    return fallback;
  } finally {
    await context?.close().catch(() => {});
  }
}
export const microphoneError = (error: unknown) =>
  error instanceof DOMException && error.name === "NotAllowedError"
    ? "Microphone permission was denied. Allow microphone access in your browser’s site settings, then try again."
    : error instanceof DOMException && error.name === "OverconstrainedError"
      ? "The selected microphone is unavailable. Refresh the microphone list and choose an available input."
      : error instanceof DOMException && error.name === "NotFoundError"
        ? "No microphone was found. Connect a microphone and try again."
        : error instanceof Error
          ? error.message
          : "The microphone could not start. Please try again.";

/** Labels may be hidden until permission is granted. This probe never records or uploads. */
export async function listMicrophones(
  requestAccess = false,
  signal?: AbortSignal,
): Promise<MediaDeviceInfo[]> {
  if (!window.isSecureContext || !navigator.mediaDevices?.enumerateDevices)
    throw new Error(
      "Microphone selection needs HTTPS (or localhost) and browser device support.",
    );
  let stream: MediaStream | undefined;
  const release = () => stream?.getTracks().forEach((track) => track.stop());
  try {
    signal?.throwIfAborted();
    if (requestAccess)
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    signal?.addEventListener("abort", release, { once: true });
    signal?.throwIfAborted();
    const devices = await navigator.mediaDevices.enumerateDevices();
    signal?.throwIfAborted();
    return devices.filter(
      (d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default",
    );
  } finally {
    signal?.removeEventListener("abort", release);
    release();
  }
}
