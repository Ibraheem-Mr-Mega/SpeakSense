import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BrowserPcmSource } from "../lib/live/pcm-source.ts";

const originals = new Map<string, PropertyDescriptor | undefined>();
function stub(name: string, value: unknown) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});
function fixture(delay = false) {
  let stops = 0, closed = 0, requested = 0;
  let constraints: MediaStreamConstraints | undefined;
  let release = () => {};
  const track = { label: "USB test input", onended: null as null | (() => void), stop() { stops++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const port = { onmessage: null as null | ((event: { data: { pcm: Int16Array } }) => void) };
  class Context {
    state = "running";
    destination = {};
    onstatechange = null;
    audioWorklet = { async addModule(path: string) { assert.equal(path, "/pcm-worklet.js"); } };
    async resume() {}
    async close() { closed++; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  }
  stub("AudioContext", Context);
  stub("AudioWorkletNode", class { port = port; connect() {} disconnect() {} });
  stub("window", { isSecureContext: true });
  stub("navigator", { mediaDevices: { getUserMedia(input: MediaStreamConstraints) {
    requested++;
    constraints = input;
    return delay ? new Promise(resolve => { release = () => resolve(stream); }) : Promise.resolve(stream);
  } } });
  return { track, port, release: () => release(), stops: () => stops, closed: () => closed, requested: () => requested, constraints: () => constraints };
}
test("live microphone requests the selected input, streams PCM, and releases tracks immediately", async () => {
  const f = fixture(), source = new BrowserPcmSource("usb-input");
  await source.prepare(new AbortController().signal);
  assert.deepEqual(f.constraints(), { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, deviceId: { exact: "usb-input" } }, video: false });
  let frames = 0;
  source.begin(() => frames++, () => assert.fail("Unexpected capture failure"));
  f.port.onmessage?.({ data: { pcm: new Int16Array(1600) } });
  assert.equal(frames, 1);
  source.stop();
  assert.equal(f.stops(), 1);
  assert.equal(f.closed(), 1);
  assert.equal(f.port.onmessage, null);
  assert.equal(f.track.onended, null);
});
test("live microphone stops a late permission grant after cancellation", async () => {
  const f = fixture(true), source = new BrowserPcmSource(), abort = new AbortController();
  const pending = source.prepare(abort.signal);
  abort.abort();
  source.stop();
  f.release();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(f.stops(), 1);
});
test("live microphone rejects insecure origins before requesting a device", async () => {
  const f = fixture(), source = new BrowserPcmSource();
  Object.assign(window, { isSecureContext: false });
  await assert.rejects(source.prepare(new AbortController().signal), /HTTPS/);
  assert.equal(f.requested(), 0);
  source.stop();
});
test("live microphone reports a disconnected input", async () => {
  const f = fixture(), source = new BrowserPcmSource();
  await source.prepare(new AbortController().signal);
  let failure = "";
  source.begin(() => {}, message => { failure = message; });
  f.track.onended?.();
  assert.match(failure, /microphone disconnected/);
  source.stop();
});
