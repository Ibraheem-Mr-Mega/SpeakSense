import type { Cue, Segment } from "./types.ts";
import { normalize } from "../speech/analysis.ts";
import { CUE_CATALOG } from "./cue-catalog.ts";
import { AudioLevelTracker } from "./audio-level.ts";
const filler = /^(u+m+|u+h+|e+r+m*|h+m+|m+m+)$/i;
/** One engine shared by both modes. Only timestamped committed words can trigger speech cues. */
export class CueEngine {
  readonly events: Cue[] = [];
  private lastDelivered = -Infinity;
  private used = new Set<string>();
  private lastFillerEnd = -Infinity;
  private paceWindows = 0;
  private slowerWindows = 0;
  readonly levels = new AudioLevelTracker();
  private lastPaceEnd = 0;
  active = true;
  muted = false;
  constructor(readonly limit: number) {}
  breathe(now: number): Cue | undefined {
    if (!this.active) return;
    return this.emit({ type: "breathe", message: CUE_CATALOG.breathe.message,
      reason: "You requested a breathing reminder. No anxiety or panic was inferred.",
      at: now, evidenceStart: now, evidenceEnd: now, evidenceText: "" }, now, true);
  }
  tick(now: number): Cue | undefined {
    const thresholds: (60 | 20 | 10)[] = this.limit >= 120 ? [60, 20, 10] : [20, 10];
    const threshold = thresholds.find(t => now >= this.limit - t && !this.used.has(`time-${t}`));
    if (
      this.active &&
      threshold !== undefined
    ) {
      this.used.add(`time-${threshold}`);
      // Never replay a missed milestone after a suspended timer catches up.
      if (this.limit - now < threshold - 3) return;
      return this.emit(
        {
          type: "time",
          timeRemaining: threshold,
          message: `${Math.max(0, Math.ceil(this.limit - now))} seconds left`,
          reason: `Your chosen ${this.limit}-second limit is approaching.`,
          at: now,
          evidenceStart: now,
          evidenceEnd: now,
          evidenceText: "",
        },
        now,
      );
    }
  }
  commit(segments: Segment[], now: number): Cue | undefined {
    if (!this.active || !segments.length) return;
    const latest = segments[segments.length - 1];
    if (!["en", "eng"].includes(latest.language)) return;
    const words = segments
      .filter((s) => ["en", "eng"].includes(s.language))
      .flatMap((s) => s.words)
      .filter((w) => w.type === "word" && /[\p{L}\p{N}]/u.test(w.text));
    const end = words.at(-1)?.end ?? 0;
    if (now - end > 5 || end > now + 0.35) return;
    const recent = words.filter(
      (w) => w.end > end - 15 && w.end > this.lastFillerEnd,
    );
    const fillers = recent.filter((w) => filler.test(normalize(w.text)));
    if (
      fillers.length >= 3 &&
      recent.length >= 6 &&
      now - fillers.at(-1)!.end <= 5
    ) {
      this.lastFillerEnd = end;
      return this.emit(
        {
          type: "fillers",
          message: CUE_CATALOG.fillers.message,
          reason: `${fillers.length} recognized filled pauses in the last 15 seconds. Try a brief silent beat at your next transition.`,
          at: now,
          evidenceStart: fillers[0].start,
          evidenceEnd: fillers.at(-1)!.end,
          evidenceText: recent.map((w) => w.text).join(" "),
          receivedAt: latest.receivedAt,
        },
        now,
      );
    }
    const low = this.levels.evaluate(words, now);
    if (low && !this.used.has("volume")) {
      this.used.add("volume");
      return this.emit({ type: "volume", message: CUE_CATALOG.volume.message,
        reason: `Voiced microphone input fell ${low.dropDb.toFixed(1)} dB relative to this take’s first five seconds of recognized speech, sustained over two checks. Mic distance and automatic gain can change this signal; room audibility is unknown.`,
        at: now, evidenceStart: low.start, evidenceEnd: low.end,
        evidenceText: words.filter(w => w.end > low.start).map(w => w.text).join(" "),
        receivedAt: latest.receivedAt }, now);
    }
    // Compare two complete 15-second windows within this take; no universal ideal pace.
    if (end < 30 || end - this.lastPaceEnd < 4) return;
    this.lastPaceEnd = end;
    const before = words.filter((w) => w.end > end - 30 && w.end <= end - 15);
    const after = words.filter((w) => w.end > end - 15 && w.end <= end);
    const drift =
      before.length >= 20 &&
      after.length >= before.length * 1.3 &&
      after.length - before.length >= 8;
    this.paceWindows = drift ? this.paceWindows + 1 : 0;
    const slower = before.length >= 20 && after.length >= 10 && after.length <= before.length * 0.7 && before.length - after.length >= 8;
    this.slowerWindows = slower ? this.slowerWindows + 1 : 0;
    const paceType = this.paceWindows >= 2 ? "pace" : this.slowerWindows >= 2 && now >= this.limit / 2 ? "pace-up" : undefined;
    // At most one pace direction per take; never alternate contradictory prompts.
    if (paceType && !this.used.has("pace")) {
      this.used.add("pace");
      return this.emit(
        {
          type: paceType,
          message: CUE_CATALOG[paceType].message,
          reason: `Pace ${paceType === "pace" ? "rose" : "fell"} from ${before.length * 4} to ${after.length * 4} words/min across adjacent 15-second windows, sustained over two updates. This is an optional delivery cue, not a judgment of confidence or an ideal speaking rate.`,
          at: now,
          evidenceStart: end - 30,
          evidenceEnd: end,
          evidenceText: after.map((w) => w.text).join(" "),
          receivedAt: latest.receivedAt,
        },
        now,
      );
    }
  }
  private emit(value: Omit<Cue, "id" | "delivery">, now: number, requested = false) {
    const remaining = this.limit - now;
    const delivery: Cue["delivery"] = !this.active
      ? "stopped"
      : this.muted
        ? "muted"
        : !requested && remaining < 3
          ? "stale"
          : value.type !== "time" && !requested && now - this.lastDelivered < 6
            ? "cooldown"
            : "pending";
    const cue: Cue = {
      ...value,
      id: `cue-${this.events.length + 1}`,
      delivery,
    };
    this.events.push(cue);
    if (delivery === "pending" && value.type !== "time") this.lastDelivered = now;
    return cue;
  }
  markShown(id: string, now: number) {
    const cue = this.events.find((c) => c.id === id);
    if (!cue || !["pending", "audio-only"].includes(cue.delivery)) return;
    if (!this.active || this.muted) {
      cue.delivery = this.muted ? "muted" : "stopped";
      return;
    }
    cue.delivery = "shown";
    cue.renderedAt = now;
    if (!["time", "breathe"].includes(cue.type))
      cue.latencyMs = Math.max(0, (now - cue.evidenceEnd) * 1000);
  }
  stop() {
    this.active = false;
    for (const c of this.events)
      if (c.delivery === "pending") c.delivery = "stopped";
  }
}
