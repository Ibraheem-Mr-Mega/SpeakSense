import type { PcmSource } from "./pcm-source.ts";
/** Explicit lab input: synthesized speech clocks through the same worklet, never a batch upload. */
export class ControlledPcmSource implements PcmSource {
  readonly kind = "controlled" as const;
  readonly label = "Controlled synthetic speech streamed in real time";
  private context = new AudioContext();
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private node?: AudioWorkletNode;
  private stopped = false;
  constructor(private fixture = "/samples/live-controlled.wav") {
    void this.context.resume();
  }
  async prepare(signal: AbortSignal) {
    const response = await fetch(this.fixture, { signal });
    if (!response.ok) throw new Error("Controlled audio could not load.");
    this.buffer = await this.context.decodeAudioData(
      await response.arrayBuffer(),
    );
    await this.context.audioWorklet.addModule("/pcm-worklet.js");
    if (signal.aborted || this.stopped)
      throw new DOMException("Cancelled", "AbortError");
    await this.context.resume();
  }
  begin(
    onFrame: (pcm: Int16Array) => void,
    onFailure: (message: string) => void,
  ) {
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer!;
    this.node = new AudioWorkletNode(this.context, "speaksense-pcm");
    this.node.port.onmessage = (e) => {
      if (!this.stopped) onFrame(e.data.pcm);
    };
    this.node.onprocessorerror = () =>
      onFailure("Controlled audio processing failed.");
    this.source.connect(this.node);
    this.node.connect(this.context.destination);
    this.source.start();
  }
  stop() {
    this.stopped = true;
    if (this.node) this.node.port.onmessage = null;
    this.node?.disconnect();
    try {
      this.source?.stop();
    } catch {}
    void this.context.close().catch(() => {});
  }
}
