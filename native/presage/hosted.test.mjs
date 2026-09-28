import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket, { WebSocketServer } from "ws";
import { createPresageService } from "./service.mjs";

const accessKey = "test-only-camera-access-code-32-characters";
const origin = "http://localhost:5173";
const providerKey = "fake-provider-key-never-use-for-real";
async function harness(t, extra = {}) {
  let clock = 0;
  const clients = [];
  class FakeSDK {
    static latest;
    handlers = {}; frames = []; stopped = false; destroyed = false;
    constructor(config) { FakeSDK.latest = this; this.config = config; }
    on(name, callback) { this.handlers[name] = callback; }
    useCustomInput() {}
    start() { this.handlers.processingStatus(3); this.handlers.validationStatus(0); }
    sendFrame(bytes, width, height, stride, format, timestamp) {
      this.frames.push({ bytes: Buffer.from(bytes), width, height, stride, format, timestamp });
      return true;
    }
    async stopAsync() { this.stopped = true; }
    async destroy() { this.destroyed = true; }
  }
  const runtime = { SmartSpectraSDK: FakeSDK, SmartSpectraLogLevel: { kNone: 4 }, FrameTransform: { kNone: 0 }, PixelFormat: { kRGBA: 2 }, decodeMetrics: x => x };
  const service = createPresageService({ apiKey: providerKey, loadSdk: async () => runtime, hosted: true, accessKey,
    platform: "linux", arch: "x64", now: () => clock, origins: [origin], ...extra });
  service.attachStreaming(WebSocketServer);
  t.after(async () => { clients.forEach(ws => ws.terminate()); await service.close(); });
  await new Promise((resolve, reject) => { service.server.once("error", reject); service.server.listen(0, "127.0.0.1", resolve); });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const call = (path, method = "GET", key, data, requestOrigin = origin) => fetch(base + path, {
    method, headers: { ...(requestOrigin ? { Origin: requestOrigin } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const start = () => call("/session", "POST", accessKey, { width: 320, height: 240 });
  async function socket(token, requestOrigin = origin) {
    const ws = new WebSocket(base.replace("http:", "ws:") + "/stream", { origin: requestOrigin });
    clients.push(ws); await once(ws, "open");
    if (token !== undefined) {
      const ready = once(ws, "message"); ws.send(token);
      const [data] = await ready; assert.equal(JSON.parse(data).ready, true);
    }
    return ws;
  }
  return { service, call, start, socket, instance: () => FakeSDK.latest, advance: time => { clock = time; } };
}
function packet(time, fill = 19, length = 320 * 240 * 4) {
  const bytes = Buffer.alloc(length + 8, fill); bytes.writeDoubleLE(time, 0); return bytes;
}
async function reply(ws, bytes) { const pending = once(ws, "message"); ws.send(bytes); return JSON.parse((await pending)[0]); }
async function settled(condition) {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(condition(), "cleanup completed");
}

test("hosted service refuses missing access controls", () => {
  assert.throws(() => createPresageService({ hosted: true, accessKey: "short", loadSdk: async () => ({}) }), /private access code/);
  assert.throws(() => createPresageService({ hosted: true, accessKey, origins: [], loadSdk: async () => ({}) }), /allowed origins/);
});
test("hosted readiness is public but health and paid session creation require the access code", { timeout: 5000 }, async t => {
  const h = await harness(t);
  assert.deepEqual(await (await h.call("/readyz", "GET", undefined, undefined, "")).json(), { ready: true });
  assert.equal((await h.call("/health")).status, 401);
  assert.equal((await h.call("/session", "POST", "wrong", { width: 320, height: 240 })).status, 401);
  const status = await h.call("/health", "GET", accessKey);
  assert.equal(status.status, 200); const text = await status.text();
  assert.ok(!text.includes(accessKey) && !text.includes(providerKey));
  assert.equal((await h.call("/session", "POST", accessKey, { width: 320, height: 240 }, "https://attacker.example")).status, 403);
});
test("hosted starts are limited per hour and active sessions are exclusive", { timeout: 5000 }, async t => {
  const h = await harness(t, { maxSessionsPerHour: 1 });
  const first = await h.start(); assert.equal(first.status, 201); const { token } = await first.json();
  assert.equal((await h.start()).status, 409);
  assert.equal((await h.call("/session", "DELETE", token)).status, 200);
  assert.equal((await h.start()).status, 429);
  h.advance(3601); assert.equal((await h.start()).status, 201);
});
test("WebSocket origin and first-message token are enforced", { timeout: 5000 }, async t => {
  const h = await harness(t); const { token } = await (await h.start()).json();
  await assert.rejects(h.socket(undefined, "https://attacker.example"), /403/);
  const bad = await h.socket(); const closed = once(bad, "close"); bad.send("wrong-token");
  assert.equal((await closed)[0], 1008); assert.equal(h.instance().frames.length, 0);
  const good = await h.socket(token); assert.match(good.extensions, /permessage-deflate/);
});
test("lossless hosted frames retain bytes and capture timing; HTTP fallback is rejected", { timeout: 5000 }, async t => {
  const h = await harness(t); const { token } = await (await h.start()).json(); const ws = await h.socket(token);
  h.advance(0.21); const first = await reply(ws, packet(0.1)); assert.equal(first.state, "running");
  h.advance(0.5); await reply(ws, packet(0.3));
  const frames = h.instance().frames; assert.equal(frames.length, 2);
  assert.deepEqual(frames[0].bytes, Buffer.alloc(320 * 240 * 4, 19));
  assert.equal(frames[1].timestamp - frames[0].timestamp, 200000);
  assert.equal(h.instance().config.enableTelemetry, false);
  assert.equal((await h.call("/frame", "POST", token, "not-a-frame")).status, 400);
  const instance = h.instance(); ws.close(); await settled(() => instance.destroyed);
  assert.equal(instance.stopped, true);
});
test("nonmonotonic timestamps stop the hosted native session", { timeout: 5000 }, async t => {
  const h = await harness(t); const { token } = await (await h.start()).json(); const ws = await h.socket(token);
  h.advance(0.21); await reply(ws, packet(0.1));
  h.advance(0.5); assert.match((await reply(ws, packet(0.1))).error, /stream/);
  await settled(() => h.instance().destroyed); assert.equal(h.instance().frames.length, 1);
});
test("stale hosted frames and invalid sizes stop before SDK submission", { timeout: 5000 }, async t => {
  const h = await harness(t); let { token } = await (await h.start()).json(); let ws = await h.socket(token);
  h.advance(0.21); await reply(ws, packet(0.1));
  h.advance(1.2); assert.ok((await reply(ws, packet(0.2))).error);
  await settled(() => h.instance().destroyed); assert.equal(h.instance().frames.length, 1);
  ({ token } = await (await h.start()).json()); ws = await h.socket(token);
  h.advance(1.5); assert.ok((await reply(ws, packet(0.1, 19, 20))).error);
  await settled(() => h.instance().destroyed); assert.equal(h.instance().frames.length, 0);
});
test("hosted measurement expires at 45 seconds and releases the pipeline", { timeout: 5000 }, async t => {
  const h = await harness(t); const { token } = await (await h.start()).json(); const ws = await h.socket(token);
  h.advance(45); assert.equal((await reply(ws, packet(44))).finished, true);
  await settled(() => h.instance().destroyed);
});
