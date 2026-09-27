import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  MicrophoneSource,
  recordingDuration,
  microphoneError,
  listMicrophones,
} from "../lib/speech/audio-source.ts";
const originals = new Map<string, PropertyDescriptor | undefined>();
function stub(name: string, value: unknown) {
  if (!originals.has(name))
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
afterEach(() => {
  for (const [key, value] of originals)
    value
      ? Object.defineProperty(globalThis, key, value)
      : Reflect.deleteProperty(globalThis, key);
  originals.clear();
});
function setup({
  allow = true,
  delay = false,
}: { allow?: boolean; delay?: boolean } = {}) {
  let stopped = 0,
    resolveStream: (v: unknown) => void = () => {},
    stops = 0;
  let constraints: MediaStreamConstraints | undefined;
  const track = {
    label: "USB test microphone",
    stop: () => {
      stopped++;
    },
    onended: null as null | (() => void),
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  stub("window", { isSecureContext: true });
  stub("navigator", {
    mediaDevices: {
      getUserMedia: (input: MediaStreamConstraints) => {
        constraints = input;
        return !allow
          ? Promise.reject(new DOMException("denied", "NotAllowedError"))
          : delay
            ? new Promise((r) => {
                resolveStream = r;
              })
            : Promise.resolve(stream);
      },
    },
  });
  class Recorder {
    static isTypeSupported(m: string) {
      return m === "audio/mp4";
    }
    state = "inactive";
    mimeType = "audio/mp4";
    ondataavailable?: (e: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    constructor(_stream: unknown, options: { mimeType: string }) {
      assert.equal(options.mimeType, "audio/mp4");
    }
    start() {
      this.state = "recording";
    }
    stop() {
      stops++;
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(["captured frames"]) });
        this.onstop?.();
      });
    }
  }
  stub("MediaRecorder", Recorder);
  stub(
    "AudioContext",
    class {
      constructor() {
        throw new Error("Meter unavailable");
      }
    },
  );
  return {
    track,
    stream,
    constraints: () => constraints,
    release: () => resolveStream(stream),
    stopped: () => stopped,
    stops: () => stops,
  };
}
test("records with negotiated Safari MIME, releases tracks, stop is idempotent", async () => {
  const s = setup();
  const source = new MicrophoneSource();
  let completed = 0;
  await source.start({
    onTick: () => {},
    onLevel: () => {},
    onError: () => assert.fail(),
    onComplete: (r) => {
      completed++;
      assert.equal(r.microphoneLabel, "USB test microphone");
      assert.equal(r.blob.type, "audio/mp4");
      assert.equal(r.blob.size, 15);
      assert.ok(r.duration >= 0);
    },
  });
  assert.equal(
    (s.constraints()?.audio as MediaTrackConstraints).deviceId,
    undefined,
  );
  source.stop();
  source.stop();
  await Promise.resolve();
  assert.equal(completed, 1);
  assert.equal(s.stops(), 1);
  assert.ok(s.stopped() > 0);
});
test("cancelled permission request releases a late stream without recording", async () => {
  const s = setup({ delay: true });
  const source = new MicrophoneSource();
  let completed = 0;
  const pending = source.start({
    onTick: () => {},
    onLevel: () => {},
    onError: () => {},
    onComplete: () => completed++,
  });
  source.cancel();
  s.release();
  await pending;
  assert.ok(s.stopped() > 0);
  assert.equal(s.stops(), 0);
  assert.equal(completed, 0);
});
test("discard prevents completion and closes the microphone", async () => {
  const s = setup();
  const source = new MicrophoneSource();
  let completed = 0;
  await source.start({
    onTick: () => {},
    onLevel: () => {},
    onError: () => {},
    onComplete: () => completed++,
  });
  source.cancel();
  await Promise.resolve();
  assert.equal(completed, 0);
  assert.ok(s.stopped() > 0);
});
test("track disconnection preserves a marked interrupted recording", async () => {
  const s = setup();
  const source = new MicrophoneSource();
  let interrupted = false;
  await source.start({
    onTick: () => {},
    onLevel: () => {},
    onError: () => {},
    onComplete: (r) => {
      interrupted = !!r.interrupted;
    },
  });
  s.track.onended!();
  await Promise.resolve();
  assert.equal(interrupted, true);
});
test("permission denial is actionable", async () => {
  setup({ allow: false });
  const source = new MicrophoneSource();
  await assert.rejects(
    () =>
      source.start({
        onTick: () => {},
        onLevel: () => {},
        onError: () => {},
        onComplete: () => {},
      }),
    /denied/,
  );
  assert.match(
    microphoneError(new DOMException("denied", "NotAllowedError")),
    /site settings/,
  );
});
test("insecure origins fail before requesting permission", async () => {
  setup();
  stub("window", { isSecureContext: false });
  await assert.rejects(
    () =>
      new MicrophoneSource().start({
        onTick: () => {},
        onLevel: () => {},
        onError: () => {},
        onComplete: () => {},
      }),
    /HTTPS/,
  );
});
test("decoding unavailable falls back to capture-clock duration", async () => {
  stub(
    "AudioContext",
    class {
      constructor() {
        throw new Error("unsupported");
      }
    },
  );
  assert.equal(await recordingDuration(new Blob(), 12.3), 12.3);
});
test("60-second deadline stops capture and releases microphone without a UI click", async () => {
  const s = setup();
  let deadline: () => void = () => {};
  stub("setTimeout", (cb: () => void, ms: number) => {
    if (ms === 60000) deadline = cb;
    return 1;
  });
  stub("clearTimeout", () => {});
  const source = new MicrophoneSource();
  let completed = 0;
  await source.start({
    onTick: () => {},
    onLevel: () => {},
    onError: () => {},
    onComplete: () => completed++,
  });
  deadline();
  await Promise.resolve();
  assert.equal(s.stops(), 1);
  assert.equal(completed, 1);
  assert.ok(s.stopped() > 0);
});

test("chosen microphone uses exact device ID without changing the capture contract", async () => {
  const s = setup();
  const source = new MicrophoneSource("usb-mic-123");
  await source.start({
    onTick() {},
    onLevel() {},
    onError() {},
    onComplete() {},
  });
  assert.deepEqual((s.constraints()?.audio as MediaTrackConstraints).deviceId, {
    exact: "usb-mic-123",
  });
  source.cancel();
});
test("unavailable chosen microphone fails without falling back to another input", async () => {
  setup();
  let calls = 0;
  navigator.mediaDevices.getUserMedia = async () => {
    calls++;
    throw new DOMException("missing", "OverconstrainedError");
  };
  await assert.rejects(
    () =>
      new MicrophoneSource("missing").start({
        onTick() {},
        onLevel() {},
        onError() {},
        onComplete() {},
      }),
    { name: "OverconstrainedError" },
  );
  assert.equal(calls, 1);
  assert.match(
    microphoneError(new DOMException("missing", "OverconstrainedError")),
    /choose an available input/,
  );
});
test("device discovery lists inputs only and stops the permission probe", async () => {
  const s = setup();
  navigator.mediaDevices.enumerateDevices = async () =>
    [
      { kind: "audioinput", deviceId: "usb", label: "USB" },
      { kind: "audioinput", deviceId: "default" },
      { kind: "audioinput", deviceId: "" },
      { kind: "audiooutput", deviceId: "speaker" },
      { kind: "videoinput", deviceId: "camera" },
    ] as MediaDeviceInfo[];
  assert.deepEqual(
    (await listMicrophones()).map((d) => d.deviceId),
    ["usb"],
  );
  assert.equal(s.constraints(), undefined, "listing alone must not prompt");
  await listMicrophones(true);
  assert.deepEqual(s.constraints(), { audio: true, video: false });
  assert.equal(s.stopped(), 1);
  assert.equal(s.stops(), 0, "discovery must not record");
});
test("device enumeration failure releases the temporary microphone", async () => {
  const s = setup();
  navigator.mediaDevices.enumerateDevices = async () => {
    throw new Error("enumeration failed");
  };
  await assert.rejects(() => listMicrophones(true), /enumeration failed/);
  assert.equal(s.stopped(), 1);
});
test("cancelled discovery releases a permission grant arriving later", async () => {
  const s = setup({ delay: true });
  let enumerated = false;
  navigator.mediaDevices.enumerateDevices = async () => {
    enumerated = true;
    return [];
  };
  const controller = new AbortController();
  const pending = listMicrophones(true, controller.signal);
  controller.abort();
  s.release();
  await assert.rejects(() => pending, { name: "AbortError" });
  assert.equal(s.stopped(), 1);
  assert.equal(enumerated, false);
});

test("cancelling during slow enumeration releases microphone immediately", async () => {
  const s = setup();
  let finish: (devices: MediaDeviceInfo[]) => void = () => {};
  navigator.mediaDevices.enumerateDevices = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const controller = new AbortController();
  const pending = listMicrophones(true, controller.signal);
  await Promise.resolve();
  controller.abort();
  assert.ok(s.stopped() > 0, "release without waiting for enumeration");
  finish([]);
  await assert.rejects(() => pending, { name: "AbortError" });
});
