import test from "node:test";
import assert from "node:assert/strict";
import { CueEngine } from "../lib/live/cues.ts";
import {
  parseSegment,
  correctedSegment,
  segmentMetrics,
} from "../lib/live/protocol.ts";
import { issueToken } from "../lib/live/token.ts";
import { AudioLevelTracker } from "../lib/live/audio-level.ts";
import type { Segment } from "../lib/live/types.ts";
const segment = (
  text: string,
  start = 0,
  end = 8,
  language = "en",
): Segment => ({
  id: "s",
  text,
  originalText: text,
  start,
  end,
  receivedAt: end + 0.8,
  language,
  words: text
    .split(" ")
    .map((text, i, a) => ({
      text,
      start: start + ((end - start) * i) / a.length,
      end: start + ((end - start) * (i + 1)) / a.length,
      type: "word",
    })),
});
test("same engine yields timed and speech cues while take is ongoing", () => {
  for (const mode of ["practice", "presentation"]) {
    const e = new CueEngine(60);
    const c = e.commit([segment("Um we help uh small teams um today")], 9)!;
    assert.equal(c.type, "fillers", mode);
    assert.equal(c.delivery, "pending");
    e.markShown(c.id, 9.2);
    assert.equal(c.delivery, "shown");
    assert.ok(c.latencyMs! > 0);
    assert.equal(e.tick(40)!.type, "time");
    assert.equal(e.tick(41), undefined);
  }
});
test("one filler and uncertain languages never trigger", () => {
  assert.equal(
    new CueEngine(60).commit(
      [segment("Um we help our customers every day")],
      9,
    ),
    undefined,
  );
  assert.equal(
    new CueEngine(60).commit(
      [segment("Um we uh help um people now", 0, 8, "unknown")],
      9,
    ),
    undefined,
  );
});
test("stale speech is not coached", () => {
  assert.equal(
    new CueEngine(60).commit([segment("Um we uh help um people now")], 20),
    undefined,
  );
});
test("muted cue is logged, never delivered or replayed", () => {
  const e = new CueEngine(60);
  e.muted = true;
  const c = e.commit([segment("Um we uh help um people now")], 9)!;
  assert.equal(c.delivery, "muted");
  e.muted = false;
  assert.equal(
    e.commit([segment("Um we uh help um people now")], 10),
    undefined,
  );
  e.markShown(c.id, 10);
  assert.equal(c.delivery, "muted");
});
test("time reminders do not block speech cues and speech retains its own cooldown", () => {
  const e = new CueEngine(60);
  const first = e.commit([segment("Um we uh help um people now", 30, 38)], 39)!;
  assert.equal(first.delivery, "pending");
  assert.equal(e.tick(40)!.delivery, "pending");
  assert.equal(e.tick(40.5), undefined);
  const next = e.commit([segment("Um we uh help um people now", 39, 43)], 44)!;
  assert.equal(next.delivery, "cooldown");
  const third = e.commit([segment("Um we uh help um people now", 44, 48)], 49)!;
  assert.equal(third.delivery, "pending");
  assert.equal(e.tick(50)!.timeRemaining, 10);
  e.stop();
  e.markShown(third.id, 51);
  assert.equal(third.delivery, "stopped");
  assert.equal(e.tick(52), undefined);
});
test("one-minute reminder is reserved for longer takes and missed milestones do not replay", () => {
  const e = new CueEngine(120);
  assert.equal(e.tick(60)?.timeRemaining, 60);
  assert.equal(e.tick(61), undefined);
  assert.equal(e.tick(100)?.timeRemaining, 20);
  assert.equal(e.tick(110)?.timeRemaining, 10);
  const late = new CueEngine(60);
  assert.equal(late.tick(55), undefined);
  assert.equal(late.tick(56), undefined);
});
test("pace needs two sustained windows and has no absolute speed score", () => {
  const e = new CueEngine(90);
  const s = segment("word ".repeat(20).trim(), 0, 15);
  const a = segment("word ".repeat(35).trim(), 15, 30);
  assert.equal(e.commit([s, a], 31), undefined);
  const b = segment("word ".repeat(15).trim(), 30, 35);
  assert.equal(e.commit([s, a, b], 36)?.type, "pace");
});
test("partial and untimed transcripts cannot produce cue evidence", () => {
  assert.equal(
    parseSegment(
      { message_type: "partial_transcript", text: "um uh um" },
      5,
      5,
    ),
    undefined,
  );
  assert.equal(
    parseSegment(
      { message_type: "committed_transcript", text: "um uh um" },
      5,
      5,
    ),
    undefined,
  );
});
test("requested breathing cue is immediate but respects mute and stop without a fabricated speech latency", () => {
  const e = new CueEngine(60);
  e.commit([segment("Um we uh help um people now")], 9);
  const c = e.breathe(10)!;
  assert.equal(c.delivery, "pending");
  e.markShown(c.id, 10.1);
  assert.equal(c.latencyMs, undefined);
  assert.match(c.reason, /You requested/);
  e.muted = true;
  assert.equal(e.breathe(11)?.delivery, "muted");
  e.stop();
  assert.equal(e.breathe(12), undefined);
});
test("speed-up needs sustained relative slowing, enough speech and the second half of a take", () => {
  const e = new CueEngine(60);
  const a = segment("word ".repeat(40).trim(), 0, 15);
  const b = segment("word ".repeat(20).trim(), 15, 30);
  const c = segment("word ".repeat(5).trim(), 30, 35);
  assert.equal(e.commit([a, b], 31), undefined);
  assert.equal(e.commit([a, b, c], 36)?.type, "pace-up");
  const quiet = new CueEngine(60);
  assert.equal(quiet.commit([a, segment("word", 15, 30)], 31), undefined);
  assert.equal(quiet.commit([a, segment("word", 15, 35)], 36), undefined);
});
test("speak-up uses a sustained relative drop during timed speech and suppresses silence", () => {
  const e = new CueEngine(60);
  const a = segment("word ".repeat(12).trim(), 0, 6);
  for (let t = 0.1; t <= 6; t += 0.1) e.levels.observe(0.08, t);
  e.commit([a], 7);
  for (let t = 6.1; t <= 18; t += 0.1) e.levels.observe(0.01, t);
  const b = segment("word ".repeat(16).trim(), 6, 14);
  assert.equal(e.commit([a, b], 15), undefined);
  const c = segment("word ".repeat(8).trim(), 14, 18);
  assert.equal(e.commit([a, b, c], 19)?.type, "volume");
  const silence = new AudioLevelTracker();
  for (let t = 0.1; t <= 20; t += 0.1) silence.observe(0, t);
  assert.equal(silence.evaluate([], 20), undefined);
  assert.equal(silence.evaluate(a.words, 20), undefined);
});
test("timestamps are validated and duplicate segments are ignored", () => {
  const s = segment("hello team");
  const d = {
    message_type: "committed_transcript_with_timestamps",
    text: s.text,
    words: s.words,
    language_code: "en",
  };
  const p = parseSegment(d, 9, 9)!;
  assert.equal(parseSegment(d, 9, 9, p), undefined);
  assert.throws(() => parseSegment(d, 4, 4), /timing/);
  assert.throws(
    () => parseSegment({ ...d, text: "different" }, 9, 9, p),
    /overlap/,
  );
});
test("correction changes metrics but preserves source timing and original words", () => {
  const s = segment("Um we help teams");
  const c = correctedSegment(s, "We help teams");
  assert.equal(c.start, s.start);
  assert.equal(c.end, s.end);
  assert.deepEqual(c.words, s.words);
  assert.equal(c.originalText, s.text);
  assert.equal(segmentMetrics([c], 8).fillers, 0);
  assert.equal(segmentMetrics([c], 8).words, 3);
});
test("token helper never exposes upstream body or API key in errors", async () => {
  const result = await issueToken(
    "secret",
    async () => new Response('{"error":"secret"}', { status: 401 }),
  );
  assert.equal(result.status, 502);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.equal((await issueToken(undefined)).status, 503);
  const success = await issueToken("secret", async () =>
    Response.json({ token: "one-use" }),
  );
  assert.equal(success.token, "one-use");
});
