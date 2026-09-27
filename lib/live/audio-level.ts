import type { Word } from "../speech/types.ts";

/** Compare voiced input levels within this take; never estimate room audibility or anxiety. */
export class AudioLevelTracker {
  private frames: { at: number; rms: number }[] = [];
  private baseline?: number;
  private lastCheck = 0;
  private lowWindows = 0;
  observe(rms: number, at: number) {
    if (!Number.isFinite(rms) || rms < 0 || rms > 1) return;
    this.frames.push({ at, rms });
    this.frames = this.frames.filter(f => f.at >= at - 30);
  }
  evaluate(words: Word[], now: number) {
    const end = words.at(-1)?.end ?? 0;
    if (end - this.lastCheck < 3 || now - end > 5) return;
    this.lastCheck = end;
    const voiced = this.frames.filter(f => f.at <= end && words.some(w => f.at >= w.start && f.at <= w.end));
    const median = (frames: typeof voiced) => frames.map(f => f.rms).sort((a, b) => a - b)[Math.floor(frames.length / 2)];
    if (this.baseline === undefined) {
      if (voiced.length >= 50) this.baseline = median(voiced.slice(0, 50));
      return;
    }
    const recent = voiced.filter(f => f.at > end - 8);
    if (recent.length < 40) { this.lowWindows = 0; return; }
    const level = median(recent);
    const low = this.baseline >= 0.02 && level > 0 && level < 0.02 && level < this.baseline * 0.4;
    this.lowWindows = low ? this.lowWindows + 1 : 0;
    if (this.lowWindows >= 2)
      return { start: end - 8, end, dropDb: 20 * Math.log10(this.baseline / level) };
  }
}
