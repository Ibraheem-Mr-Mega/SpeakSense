/* Mono capture, continuous fractional downsampling, 100 ms PCM16 frames. No output audio. */
class SpeakSensePCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Int16Array(1600);
    this.index = 0;
    this.total = 0;
  }
  process(inputs) {
    const data = inputs[0]?.[0];
    if (!data) return true;
    for (const sample of data) {
      this.sum += sample;
      this.count++;
      this.phase++;
      if (this.phase >= this.ratio) {
        const value = Math.max(-1, Math.min(1, this.sum / this.count));
        this.frame[this.index++] = Math.round(
          value * (value < 0 ? 32768 : 32767),
        );
        this.phase -= this.ratio;
        this.sum = 0;
        this.count = 0;
        if (this.index === 1600) {
          this.total += 1600;
          this.port.postMessage({ pcm: this.frame, total: this.total }, [
            this.frame.buffer,
          ]);
          this.frame = new Int16Array(1600);
          this.index = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("speaksense-pcm", SpeakSensePCM);
