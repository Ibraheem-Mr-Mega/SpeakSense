import test from "node:test";
import assert from "node:assert/strict";
import { gateReading, supportedPresageHost } from "../lib/camera/metrics.ts";
const sample = { value: 72, confidence: 90, stable: true };
test("camera readings require complete quiet windows and current stable data", () => {
  assert.equal(gateReading({ sample, received: 10 }, 10, 0, 12).value, null);
  assert.equal(gateReading({ sample, received: 15 }, 15, 0, 12).value, 72);
  assert.equal(gateReading({ sample, received: 29 }, 29, 0, 30).value, null);
  assert.equal(gateReading({ sample, received: 31 }, 31, 0, 30).value, 72);
  assert.equal(gateReading({ sample, received: 31 }, 31, null, 12).value, null);
  assert.equal(gateReading({ sample, received: 20 }, 31, 0, 12).value, null);
  for (const change of [{ confidence: 0 }, { confidence: 69 }, { confidence: 101 }, { stable: false }, { value: NaN }, { value: -1 }])
    assert.equal(gateReading({ sample: { ...sample, ...change }, received: 31 }, 31, 0, 12).value, null);
});
test("Presage platform capability never implies Intel macOS support", () => {
  assert.equal(supportedPresageHost("darwin", "x64"), false);
  assert.equal(supportedPresageHost("darwin", "arm64"), true);
  assert.equal(supportedPresageHost("linux", "x64"), true);
  assert.equal(supportedPresageHost("win32", "x64"), true);
  assert.equal(supportedPresageHost("browser", "wasm"), false);
});
