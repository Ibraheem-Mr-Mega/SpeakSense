import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const origin = process.argv[2] || "http://localhost:5173";
const home = await fetch(origin);
assert.equal(home.status, 200);
assert.equal(home.headers.get("permissions-policy"), "microphone=(self), camera=(self), geolocation=()");
assert.equal(home.headers.get("x-content-type-options"), "nosniff");
assert.match(await home.text(), /Keep your message moving/);
assert.equal((await fetch(origin + "/lab")).status, 200);
assert.equal((await fetch(origin + "/review-demo")).status, 200);
assert.equal((await fetch(origin + "/pcm-worklet.js")).status, 200);
assert.equal((await fetch(origin + "/samples/live-controlled.wav")).status, 200);
const forbiddenToken = await fetch(origin + "/api/realtime-token", {
  method: "POST", headers: { Origin: "https://foreign.example" },
});
assert.equal(forbiddenToken.status, 403);
// Vinext may reject a foreign origin before the handler's no-store headers run.
const status = await fetch(origin + "/api/status");
assert.equal(status.status, 200);
const settings = await status.json();
assert.equal(settings.model, "scribe_v2");
assert.equal(settings.realtimeModel, "scribe_v2_realtime");
assert.equal(typeof settings.transcriptionConfigured, "boolean");
const sample = await fetch(origin + "/samples/attempt-1.json");
assert.equal(sample.status, 200);
const fixture = await sample.json();
assert.equal(fixture.kind, "sample");
const audio = await fetch(origin + fixture.audioUrl);
assert.equal(audio.status, 200);
const wav = Buffer.from(await audio.arrayBuffer());
assert.deepEqual(wav, await readFile("public" + fixture.audioUrl));
const audioRange = await fetch(origin + fixture.audioUrl, {
  headers: { Range: "bytes=1000-1999" },
});
assert.ok([200, 206].includes(audioRange.status));
const returnedAudio = Buffer.from(await audioRange.arrayBuffer());
if (audioRange.status === 206) assert.equal(returnedAudio.byteLength, 1000);
else assert.deepEqual(returnedAudio, wav); // App loads full sample blobs for reliable local seeking.
console.log(`Sample asset response to a range request: ${audioRange.status}; full-blob playback is used in the UI.`);
const form = () => {
  const body = new FormData();
  body.set("audio", new Blob([wav], { type: "audio/wav" }), "attempt.wav");
  body.set("duration", String(fixture.duration));
  return body;
};
const tooLong = form(); tooLong.set("duration", "66");
const invalidDuration = form(); invalidDuration.set("duration", "NaN");
const unauthorized = new FormData(); unauthorized.set("duration", "1");
for (const request of [
  { headers: { Origin: origin }, body: tooLong, status: 400 },
  { headers: { Origin: origin }, body: invalidDuration, status: 400 },
  { headers: { Origin: "https://foreign.example" }, body: unauthorized, status: 403 },
  { headers: { Origin: origin }, body: new FormData(), status: 400 },
  {
    headers: { Origin: origin, "Content-Type": "text/plain" },
    body: "test",
    status: 415,
  },
]) {
  const response = await fetch(origin + "/api/transcribe", {
    method: "POST",
    ...request,
    // Isolate negative POSTs from local Wrangler proxy connection reuse after a rejected body.
    headers: {...request.headers, Connection: "close"},
  });
  assert.equal(response.status, request.status, `Expected ${request.status} for duration=${request.body instanceof FormData ? request.body.get("duration") : "text"}: ${await response.text()}`);
}
if (!settings.transcriptionConfigured) {
  const response = await fetch(origin + "/api/transcribe", {
    method: "POST",
    headers: { Origin: origin },
    body: form(),
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /not configured/);
  assert.equal(body.transcript, undefined);
}
console.log(
  "HTTP smoke passed: page, service status, sample JSON + WAV identity, complete audio buffers, origin/type validation, and honest missing-key response.",
);
