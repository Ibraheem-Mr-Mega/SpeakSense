import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  CueAudioOutput,
  cueTone,
  type RoutedAudio,
  SYSTEM_OUTPUT,
} from "../lib/live/audio-output.ts";
import type { Cue } from "../lib/live/types.ts";
const cue: Cue = {
  id: "1",
  type: "fillers",
  message: "Take a beat",
  reason: "test",
  at: 9,
  evidenceStart: 1,
  evidenceEnd: 8,
  evidenceText: "um",
  delivery: "pending",
};
function fakeAudio() {
  let plays = 0,
    pauses = 0;
  const audio = {
    sinkId: "",
    volume: 0.2,
    src: "",
    currentTime: 0,
    onended: null as null | (() => void),
    onerror: null as null | (() => void),
    async setSinkId(id: string) {
      this.sinkId = id;
    },
    async play() {
      plays++;
    },
    pause() {
      pauses++;
    },
    removeAttribute() {},
  };
  return {
    audio: audio as unknown as RoutedAudio,
    plays: () => plays,
    pauses: () => pauses,
    end: () => audio.onended?.(),
  };
}
test("audio cannot play by default or enable before an output test confirmation", async () => {
  const f = fakeAudio(),
    o = new CueAudioOutput(f.audio);
  assert.equal(await o.deliver(cue), false);
  assert.throws(() => o.setEnabled(true), /Test/);
  await assert.rejects(() => o.choose("default"));
  await o.choose("headphones");
  assert.throws(() => o.setEnabled(true), /Test/);
  await o.preview();
  assert.equal(f.plays(), 1);
  o.confirm();
  o.setEnabled(true);
  assert.equal(await o.deliver(cue), true);
  o.dispose();
});
test("mute, invalidated output, and routing change fail closed", async () => {
  const f = fakeAudio(),
    o = new CueAudioOutput(f.audio);
  await o.choose("earbud");
  await o.preview();
  o.confirm();
  o.setEnabled(true);
  o.disable();
  assert.equal(await o.deliver(cue), false);
  o.setEnabled(true);
  Object.assign(f.audio, { sinkId: "speakers" });
  assert.equal(await o.deliver(cue), false);
  o.invalidate();
  assert.throws(() => o.setEnabled(true), /Test/);
  assert.ok(f.pauses() > 0);
  o.dispose();
});
test("generated cue prompts are short PCM tones, not speech or microphone data", async () => {
  for (const type of ["time", "pace", "fillers", "pace-up", "volume", "breathe"] as const) {
    const b = await cueTone(type).arrayBuffer();
    const v = new DataView(b);
    assert.equal(v.getUint32(24, true), 16000);
    const duration = v.getUint32(40, true) / 32000;
    assert.ok(duration <= 0.7);
  }
});
test("audio worklet emits continuous 100ms PCM frames at 16kHz for supported input rates", async () => {
  const code = await readFile("public/pcm-worklet.js", "utf8");
  for (const rate of [16000, 44100, 48000]) {
    type ProcessorConstructor = new () => { process(input: Float32Array[][]): boolean };
    let Processor: ProcessorConstructor | undefined;
    const frames: { pcm: Int16Array; total: number }[] = [];
    const context = {
      sampleRate: rate,
      AudioWorkletProcessor: class {
        port = { postMessage: (v: { pcm: Int16Array; total: number }) => frames.push(v) };
      },
      registerProcessor(_name: string, p: ProcessorConstructor) {
        Processor = p;
      },
      Int16Array,
      Math,
    };
    vm.runInNewContext(code, context);
    assert.ok(Processor);
    const p = new Processor();
    for (let i = 0; i < rate; i += 128)
      p.process([[new Float32Array(Math.min(128, rate - i)).fill(0.5)]]);
    assert.ok(frames.length >= 9 && frames.length <= 10);
    assert.equal(frames[0].pcm.length, 1600);
    assert.equal(frames[0].pcm[0], 16384);
    assert.equal(frames[0].total, 1600);
  }
});

test("voice loads real clips, uses system output without setSinkId, and serializes prompts", async () => {
  const f = fakeAudio();
  Reflect.deleteProperty(f.audio, "setSinkId");
  const o = new CueAudioOutput(f.audio, async (path) => new Response(await readFile("public" + String(path)), { headers: { "Content-Type": "audio/mpeg" } }));
  assert.equal(o.supported(), false);
  assert.equal(o.devicesChanged(), false);
  await o.setMode("voice");
  await o.choose(SYSTEM_OUTPUT);
  await o.preview();
  const clip = await fetch(f.audio.src);
  assert.equal(clip.headers.get("content-type"), "audio/mpeg");
  assert.ok((await clip.arrayBuffer()).byteLength > 1000);
  o.confirm(); o.setEnabled(true);
  assert.equal(await o.deliver(cue), true);
  const pending = o.deliver({ ...cue, id: "second", type: "time", timeRemaining: 10 });
  assert.equal(f.plays(), 2); // Preview + first cue; second cue must wait.
  f.end();
  assert.equal(await pending, true);
  assert.equal(f.plays(), 3);
  assert.equal(o.devicesChanged(), true);
  assert.equal(await o.deliver(cue), false);
  o.dispose();
});
test("mute cancels queued prompts and playback failures report failure and disable output", async () => {
  const f = fakeAudio(), o = new CueAudioOutput(f.audio);
  const states: string[] = [];
  o.onStatus = (_id, r) => states.push(r.status);
  await o.choose("earbud"); await o.preview(); o.confirm(); o.setEnabled(true);
  await o.deliver(cue);
  const queued = o.deliver({ ...cue, id: "queued" });
  o.silence();
  assert.equal(await queued, false);
  assert.ok(states.includes("cancelled"));
  Object.assign(f.audio, { play: async () => { throw new Error("Autoplay blocked"); } });
  assert.equal(await o.deliver(cue), false);
  assert.ok(states.includes("failed"));
  assert.throws(() => o.setEnabled(true), /Test/);
  o.dispose();
});
