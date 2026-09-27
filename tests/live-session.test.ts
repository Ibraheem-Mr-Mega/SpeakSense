import test from "node:test";
import assert from "node:assert/strict";
import { LiveSession } from "../lib/live/session.ts";
import type { PcmSource } from "../lib/live/pcm-source.ts";
import type { Cue, SessionResult, Setup } from "../lib/live/types.ts";
const setup: Setup = {
  mode: "practice",
  audience: "Investors",
  takeaway: "Try our app",
  points: [],
  limit: 60,
  save: true,
  continueOnFailure: false,
};
function harness(options: Partial<Setup> = {}, denied = false) {
  let now = 0,
    feed: (p: Int16Array) => void = () => {},
    stops = 0,
    result: SessionResult | undefined;
  const delivered: Cue[] = [];
  const source: PcmSource = {
    label: "test",
    kind: "controlled",
    async prepare() {
      if (denied)
        throw new DOMException("Permission denied", "NotAllowedError");
    },
    begin(fn) {
      feed = fn;
    },
    stop() {
      stops++;
    },
  };
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    onmessage: null as null | ((e: { data: string }) => void),
    onclose: null as null | (() => void),
    onerror: null as null | (() => void),
    sent: [] as string[],
    send(s: string) {
      this.sent.push(s);
    },
    close() {
      this.readyState = 3;
    },
  };
  const session = new LiveSession(
    { ...setup, ...options },
    source,
    {
      change() {},
      cue(cue) { delivered.push(cue); },
      done(r) {
        result = r;
      },
    },
    {
      now: () => now,
      token: async () => "temporary",
      socket: () => {
        queueMicrotask(() =>
          socket.onmessage?.({
            data: JSON.stringify({ message_type: "session_started" }),
          }),
        );
        return socket as unknown as WebSocket;
      },
    },
  );
  return {
    session,
    socket,
    delivered,
    advance(seconds: number) {
      now = seconds * 1000;
    },
    feed: (p = new Int16Array(1600)) => feed(p),
    stops: () => stops,
    result: () => result,
  };
}
test("permission denial releases capture and sends no audio", async () => {
  const h = harness({}, true);
  await h.session.start();
  assert.equal(h.session.snapshot().state, "idle");
  assert.match(h.session.snapshot().error, /permission was denied/);
  assert.equal(h.socket.sent.length, 0);
  assert.ok(h.stops() > 0);
  h.session.cancel();
});
test("muting leaves streaming active and capture stop is immediate", async (t) => {
  const h = harness();
  await h.session.start();
  h.feed();
  h.session.mute(true);
  h.feed();
  assert.equal(h.socket.sent.length, 2);
  assert.equal(h.session.snapshot().state, "listening");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = h.session.stop();
  assert.ok(h.stops() > 0);
  const sent = h.socket.sent.length;
  h.feed();
  assert.equal(h.socket.sent.length, sent);
  t.mock.timers.tick(2200);
  await pending;
  assert.equal(h.session.snapshot().state, "done");
  if (h.result()?.audioUrl) URL.revokeObjectURL(h.result()!.audioUrl!);
});
test("connection loss is explicit and preserves local capture only with opt-in", async () => {
  const h = harness({ continueOnFailure: true });
  await h.session.start();
  h.feed();
  h.socket.onclose?.();
  assert.equal(h.session.snapshot().state, "unavailable");
  assert.match(h.session.snapshot().error, /connection lost/);
  assert.equal(h.stops(), 0);
  h.feed();
  assert.equal(h.socket.sent.length, 1);
  h.session.cancel();
  assert.ok(h.stops() > 0);
});
test("no-save presentation releases transcript and recording on stop", async (t) => {
  const h = harness({ mode: "presentation", save: false });
  await h.session.start();
  h.feed();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = h.session.stop();
  t.mock.timers.tick(2200);
  await pending;
  assert.equal(h.result()?.audioUrl, undefined);
  assert.deepEqual(h.result()?.segments, []);
  assert.deepEqual(h.result()?.cues, []);
  assert.deepEqual(h.result()?.events, []);
});
test("late permission resolves after cancellation without starting transport", async () => {
  let release = () => {};
  let connected = false;
  let stopped = false;
  const source: PcmSource = {
    label: "pending",
    kind: "microphone",
    prepare: () =>
      new Promise<void>((r) => {
        release = r;
      }),
    begin() {
      throw new Error("Should not capture");
    },
    stop() {
      stopped = true;
    },
  };
  const s = new LiveSession(
    setup,
    source,
    { change() {}, cue() {}, done() {} },
    {
      token: async () => {
        connected = true;
        return "token";
      },
    },
  );
  const pending = s.start();
  s.cancel();
  release();
  await pending;
  assert.ok(stopped);
  assert.equal(connected, false);
});

for (const mode of ["practice", "presentation"] as const) {
  test(`${mode}: session dispatches speech during the countdown and keeps streaming`, async (t) => {
    t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
    const h = harness({ mode, limit: 45, save: true });
    t.after(() => h.session.cancel());
    await h.session.start();
    for (let frame = 1; frame <= 300; frame++) {
      h.advance(frame / 10);
      h.feed();
      t.mock.timers.tick(100);
    }
    assert.equal(h.delivered.length, 1);
    assert.equal(h.delivered[0].type, "time");
    assert.equal(h.delivered[0].timeRemaining, 20);
    const words = "Um we uh help um small teams".split(" ").map((text, i) => ({
      text, type: "word", start: 27 + i * 0.3, end: 27.2 + i * 0.3,
    }));
    h.socket.onmessage?.({ data: JSON.stringify({
      message_type: "committed_transcript_with_timestamps",
      text: words.map(w => w.text).join(" "), language_code: "en", words,
    }) });
    assert.equal(h.delivered[1]?.type, "fillers");
    assert.equal(h.delivered[1]?.delivery, "pending");
    assert.equal(h.delivered[1]?.audioSentAt, 30);
    assert.equal(h.session.snapshot().state, "listening");
    h.session.markShown(h.delivered[1].id);
    assert.equal(h.session.snapshot().cues[1].delivery, "shown");
    const sent = h.socket.sent.length;
    h.advance(30.1);
    h.feed();
    assert.equal(h.socket.sent.length, sent + 1);
    const pending = h.session.stop();
    assert.ok(h.stops() > 0);
    t.mock.timers.tick(2200);
    await pending;
    assert.deepEqual(h.result()?.cues.map(c => c.type), ["time", "fillers"]);
    if (h.result()?.audioUrl) URL.revokeObjectURL(h.result()!.audioUrl!);
  });
}
