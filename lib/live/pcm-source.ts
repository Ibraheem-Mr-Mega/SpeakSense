export interface PcmSource {
  readonly label: string;
  readonly kind: "microphone" | "controlled";
  prepare(signal: AbortSignal): Promise<void>;
  begin(
    onFrame: (pcm: Int16Array) => void,
    onFailure: (message: string) => void,
  ): void;
  stop(): void;
}
/** Context is constructed in the Start click so mobile activation is preserved. */
export class BrowserPcmSource implements PcmSource {
  readonly kind = "microphone" as const;
  label = "Device microphone";
  private context: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private input?: MediaStreamAudioSourceNode;
  private stopped = false;
  constructor(private deviceId = "") {
    this.context = new AudioContext();
    void this.context.resume().catch(() => {});
  }
  async prepare(signal: AbortSignal) {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !this.context.audioWorklet
    )
      throw new Error(
        "Live capture needs HTTPS or localhost and AudioWorklet support. Try a current Chrome, Edge, or Safari browser.",
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
      },
      video: false,
    });
    if (signal.aborted || this.stopped) {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException("Cancelled", "AbortError");
    }
    this.stream = stream;
    this.label = stream.getAudioTracks()[0]?.label || this.label;
    await this.context.audioWorklet.addModule("/pcm-worklet.js");
    if (signal.aborted || this.stopped)
      throw new DOMException("Cancelled", "AbortError");
    if (this.context.state !== "running") await this.context.resume();
    if (this.context.state !== "running")
      throw new Error(
        "Audio capture is suspended. Tap Start again with this page visible.",
      );
  }
  begin(
    onFrame: (pcm: Int16Array) => void,
    onFailure: (message: string) => void,
  ) {
    if (!this.stream || this.stopped)
      throw new Error("Microphone is not ready.");
    this.node = new AudioWorkletNode(this.context, "speaksense-pcm");
    this.node.port.onmessage = (e) => {
      if (!this.stopped) onFrame(e.data.pcm);
    };
    this.node.onprocessorerror = () => onFailure("Audio capture failed.");
    this.stream.getTracks().forEach((t) => {
      t.onended = () => onFailure("The microphone disconnected.");
    });
    this.context.onstatechange = () => {
      if (!this.stopped && this.context.state !== "running")
        onFailure("The browser suspended audio capture.");
    };
    this.input = this.context.createMediaStreamSource(this.stream);
    this.input.connect(this.node);
    this.node.connect(this.context.destination);
  }
  stop() {
    this.stopped = true;
    this.node?.disconnect();
    this.input?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.context.onstatechange = null;
    void this.context.close().catch(() => {});
  }
}
export function pcmWav(frames: Int16Array[]): Blob {
  const length = frames.reduce((sum, frame) => sum + frame.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2),
    v = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      v.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, length * 2, true);
  let offset = 44;
  for (const frame of frames)
    for (const value of frame) {
      v.setInt16(offset, value, true);
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}
