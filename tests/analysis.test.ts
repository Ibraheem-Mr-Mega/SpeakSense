import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze,
  validateTranscript,
  coach,
  compare,
} from "../lib/speech/analysis.ts";
import type { Attempt, Transcript } from "../lib/speech/types.ts";
const samples = [1, 2].map(
  (n) =>
    JSON.parse(
      readFileSync(
        new URL(`../public/samples/attempt-${n}.json`, import.meta.url),
        "utf8",
      ),
    ) as Attempt,
);
function transcript(tokens: string[]): Transcript {
  return {
    text: tokens.join(" "),
    language_code: "en",
    words: tokens.map((text, i) => ({
      text,
      start: i * 0.4,
      end: i * 0.4 + 0.3,
      type: "word",
    })),
  };
}
test("whole-token filler detection preserves original words and excludes lexical ambiguities", () => {
  const t = transcript([
    "Um,",
    "summer",
    "umbrella",
    "UH!",
    "er",
    "Erm,",
    "hmm",
    "mm",
    "like",
    "you",
    "know",
    "uh-huh",
    "human",
    "Um.",
  ]);
  const before = JSON.stringify(t);
  const m = analyze(t, 10);
  assert.equal(m.fillers.length, 7);
  assert.equal(m.candidates.length, 2);
  assert.equal(m.wordCount, 14);
  assert.equal(m.wpm, 84);
  assert.equal(JSON.stringify(t), before);
});
test("synthetic AUDIO fixtures contain the measured fillers at their exact sample offsets", () => {
  for (const [i, a] of samples.entries()) {
    const t = validateTranscript(a.transcript, a.duration);
    const m = analyze(t, a.duration);
    assert.equal(m.fillers.length, i === 0 ? 4 : 1);
    assert.equal(m.wordCount, i === 0 ? 66 : 64);
    const wav = readFileSync(
      new URL(`../public/samples/attempt-${i + 1}.wav`, import.meta.url),
    );
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    const rate = wav.readUInt32LE(24);
    assert.equal(rate, 22050);
    const frames = (wav.length - 44) / 2;
    assert.ok(Math.abs(frames / rate - a.duration) < 1 / rate);
    for (const w of m.fillers) {
      let peak = 0;
      for (let j = Math.ceil(w.start * rate); j < Math.floor(w.end * rate); j++)
        peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + j * 2)));
      assert.ok(peak > 1000, `No audible signal for ${w.text} at ${w.start}`);
    }
  }
});
test("comparison reports raw and duration-normalized differences with no score", () => {
  const diff = compare(samples[0], samples[1]);
  assert.equal(diff.fillerChange, -3);
  assert.equal(diff.wordChange, -2);
  assert.ok(diff.rateChange! < 0);
  assert.ok(diff.paceChange > 0);
  assert.equal("score" in diff, false);
  assert.throws(() => compare(samples[0], { ...samples[1], kind: "live" }));
  assert.throws(() =>
    compare(samples[0], { ...samples[1], audience: "Different audience" }),
  );
  assert.throws(() =>
    compare(samples[0], { ...samples[1], exercise: "keynote" }),
  );
});
test("coaching evidence is a real excerpt and next goal stays specific", () => {
  for (const a of samples) {
    const c = coach(a);
    assert.ok(c.improvements.length >= 2 && c.improvements.length <= 3);
    assert.ok(c.goal.length > 15);
    for (const item of c.improvements) {
      if (item.evidence) {
        const e = item.evidence;
        assert.ok(e.start >= 0 && e.end <= a.duration);
        if (!e.text.includes("between"))
          assert.ok(a.transcript!.text.includes(e.text));
      }
    }
  }
  assert.match(coach(samples[1]).strength, /request language/);
  assert.doesNotMatch(coach(samples[0]).strength, /clear|confident|anxious/i);
});
test("silence and non-English transcripts do not produce invented filler or message conclusions", () => {
  const empty = analyze(transcript([]), 60);
  assert.equal(empty.wpm, 0);
  assert.equal(empty.fillers.length, 0);
  assert.equal(empty.gaps.length, 0);
  const french = { ...transcript(["um", "bonjour"]), language_code: "fr" };
  assert.equal(analyze(french, 3).english, false);
  assert.equal(analyze(french, 3).fillers.length, 0);
  assert.match(
    coach({ ...samples[0], transcript: transcript([]) }).goal,
    /complete point/,
  );
});
test("timestamp validation fails closed for invalid, missing, unordered, or out-of-recording times", () => {
  for (const start of [NaN, -1, 100])
    assert.throws(() =>
      validateTranscript(
        {
          ...transcript(["test"]),
          words: [{ text: "test", start, end: start + 0.2, type: "word" }],
        },
        4,
      ),
    );
  assert.throws(() =>
    validateTranscript({ text: "test", words: [], language_code: "en" }, 4),
  );
  assert.throws(() =>
    validateTranscript(
      {
        ...transcript(["one", "two"]),
        words: [
          { text: "one", start: 2, end: 3, type: "word" },
          { text: "two", start: 1, end: 2, type: "word" },
        ],
      },
      4,
    ),
  );
  assert.throws(() => analyze(transcript(["test"]), 0));
});
test("gaps exclude tagged non-speech sounds and ignore leading/trailing time", () => {
  const t = transcript(["hello", "world"]);
  t.words[1].start = 2;
  t.words[1].end = 2.3;
  assert.equal(analyze(t, 10).gaps.length, 1);
  t.words.splice(1, 0, {
    text: "(laughter)",
    start: 0.5,
    end: 1.5,
    type: "audio_event",
  });
  assert.equal(analyze(t, 10).gaps.length, 0);
  assert.equal(analyze(t, 10).wordCount, 2);
});
