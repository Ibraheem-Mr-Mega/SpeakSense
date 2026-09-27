import test from "node:test";
import assert from "node:assert/strict";
import { createPresageService } from "./service.mjs";

async function harness(t, options = {}) {
  let clock = 0;
  class FakeSDK {
    static latest;
    listeners = {}; stopped = false; destroyed = false; frames = 0;
    constructor(config) { this.config = config; FakeSDK.latest = this; }
    on(name, fn) { this.listeners[name] = fn; }
    useCustomInput() {}
    start() { this.listeners.processingStatus(3); this.listeners.validationStatus(0); }
    sendFrame(bytes, w, h, stride, format, ts) {
      assert.equal(bytes.length, w * h * 4); assert.equal(stride, w * 4); assert.equal(format, 2);
      assert.ok(ts > (this.lastTimestamp ?? 0)); this.lastTimestamp = ts; this.frames++;
      this.listeners.metrics({ cardio: { pulseRate: [{ value: 72, confidence: 95, stable: true, timestamp: ts }] }, breathing: { rate: [{ value: 14, confidence: 95, stable: true, timestamp: ts }] }, face: { talking: [{ detected: false, stable: true, timestamp: ts }] } });
      return true;
    }
    async stopAsync() { this.stopped = true; }
    async destroy() { this.destroyed = true; }
  }
  const sdk = { SmartSpectraSDK: FakeSDK, SmartSpectraLogLevel: { kNone: 4 }, PixelFormat: { kRGBA: 2 }, FrameTransform: { kNone: 0 }, decodeMetrics: b => b };
  const service = createPresageService({ apiKey: "test-only-not-a-credential", loadSdk: async () => sdk, platform: "linux", arch: "x64", now: () => clock, ...options });
  await new Promise((resolve, reject) => { service.server.once("error", reject); service.server.listen(0, "127.0.0.1", resolve); });
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.server.address().port}`;
  return { service, instance: () => FakeSDK.latest, advance: value => { clock = value; },
    call: (path, method = "GET", body, token, origin = "http://localhost:5173") => fetch(base + path, { method, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body }),
    frame: Buffer.alloc(320 * 240 * 4) };
}

test("camera service rejects other origins and exposes no key", async t => {
  const h = await harness(t);
  assert.equal((await h.call("/health", "GET", undefined, undefined, "https://untrusted.example")).status, 403);
  const health = await (await h.call("/health")).json();
  assert.equal(health.available, true);
  assert.ok(!JSON.stringify(health).includes("test-only-not-a-credential"));
});
test("unsupported runtime stays unavailable without importing native code", async t => {
  const h = await harness(t, { platform: "darwin", arch: "x64", loadSdk: () => { throw new Error("must not load"); } });
  const health = await (await h.call("/health")).json();
  assert.equal(health.available, false);
  assert.equal((await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }))).status, 503);
});
test("frame transport is bounded, session-scoped, and releases the native pipeline", async t => {
  const h = await harness(t);
  assert.equal((await h.call("/session", "POST", JSON.stringify({ width: 99999, height: 240 }))).status, 400);
  const response = await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }));
  assert.equal(response.status, 201);
  const { token } = await response.json();
  assert.equal(h.instance().config.enableTelemetry, false);
  assert.deepEqual(h.instance().config.requestedMetrics, [2, 13, 15]);
  assert.equal((await h.call("/frame", "POST", h.frame, "wrong-session")).status, 401);
  assert.equal((await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }))).status, 409);
  const data = await (await h.call("/frame", "POST", h.frame, token)).json();
  assert.equal(data.pulse.value, null);
  assert.equal(data.breathing.value, null);
  assert.equal((await h.call("/session", "DELETE", undefined, token)).status, 200);
  assert.equal(h.instance().stopped, true); assert.equal(h.instance().destroyed, true);
  assert.equal((await h.call("/frame", "POST", h.frame, token)).status, 401);
});
test("oversized frames stop the session", async t => {
  const h = await harness(t);
  const { token } = await (await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }))).json();
  assert.equal((await h.call("/frame", "POST", Buffer.alloc(h.frame.length + 1), token)).status, 413);
  assert.equal(h.instance().destroyed, true);
});
test("camera session expires at the quiet-check limit", async t => {
  const h = await harness(t);
  const { token } = await (await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }))).json();
  h.advance(45);
  assert.deepEqual(await (await h.call("/frame", "POST", h.frame, token)).json(), { finished: true });
  assert.equal(h.instance().destroyed, true);
});

test("service quality windows reset when talking or validation changes", async t => {
  const h = await harness(t);
  const { token } = await (await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }))).json();
  let result;
  for (let frame = 1; frame <= 950; frame++) {
    h.advance(frame / 30);
    result = await (await h.call("/frame", "POST", h.frame, token)).json();
  }
  assert.equal(result.pulse.value, 72);
  assert.equal(result.breathing.value, 14);
  h.instance().listeners.validationStatus(12);
  h.advance(951 / 30);
  result = await (await h.call("/frame", "POST", h.frame, token)).json();
  assert.equal(result.pulse.value, null);
  assert.equal(result.breathing.value, null);
  h.instance().listeners.validationStatus(0);
  h.instance().sendFrame = () => {
    h.instance().listeners.metrics({ face: { talking: [{ detected: true, stable: true, timestamp: 999999999 }] } });
    return true;
  };
  h.advance(952 / 30);
  result = await (await h.call("/frame", "POST", h.frame, token)).json();
  assert.equal(result.pulse.value, null);
  assert.match(result.guidance, /quiet/);
});

test("native errors are sanitized and abandoned sessions release resources", async t => {
  const h = await harness(t);
  const { token } = await (await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }))).json();
  h.instance().sendFrame = () => { throw new Error("provider message contains test-only-not-a-credential"); };
  const reply = await h.call("/frame", "POST", h.frame, token);
  const text = await reply.text();
  assert.ok(!text.includes("test-only-not-a-credential"));
  assert.equal(h.instance().destroyed, true);
  await h.call("/session", "POST", JSON.stringify({ width: 320, height: 240 }));
  h.advance(4);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(h.instance().destroyed, true);
});
