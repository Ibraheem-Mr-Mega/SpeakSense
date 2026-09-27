import { test } from "node:test";
import assert from "node:assert/strict";
import { transcribeAudio, ServiceError } from "../lib/speech/transcription.ts";
const file = new Blob(["audio"], { type: "audio/webm" });
const result = {
  text: "Um, hello.",
  language_code: "en",
  words: [
    { text: "Um,", start: 0.1, end: 0.3, type: "word" },
    { text: "hello.", start: 0.4, end: 0.8, type: "word" },
  ],
};
test("missing credential never calls the provider or creates sample feedback", async () => {
  let called = false;
  await assert.rejects(
    () =>
      transcribeAudio(file, 1, {}, async () => {
        called = true;
        return new Response();
      }),
    (e) => e instanceof ServiceError && e.status === 503,
  );
  assert.equal(called, false);
});
test("Scribe request preserves fillers and word timestamps and keeps the API key in a server header", async () => {
  const actual = await transcribeAudio(
    file,
    1,
    { ELEVENLABS_API_KEY: "test-only" },
    async (url, options) => {
      assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
      assert.equal(
        (options!.headers as Record<string, string>)["xi-api-key"],
        "test-only",
      );
      const body = options!.body as FormData;
      assert.equal(body.get("model_id"), "scribe_v2");
      assert.equal(body.get("no_verbatim"), "false");
      assert.equal(body.get("timestamps_granularity"), "word");
      assert.equal(body.get("transcript_edit"), null);
      assert.ok(body.get("file") instanceof Blob);
      return Response.json(result);
    },
  );
  assert.deepEqual(actual, result);
});
test("zero retention is explicitly opt-in, never falsely claimed for normal credits", async () => {
  await transcribeAudio(
    file,
    1,
    { ELEVENLABS_API_KEY: "test", ELEVENLABS_ZERO_RETENTION: "true" },
    async (url) => {
      assert.match(String(url), /enable_logging=false/);
      return Response.json(result);
    },
  );
});
test("upstream 401, 403, 402, 429, 500 and invalid timestamps fail without invented coaching", async () => {
  for (const status of [401, 403, 402, 429, 500])
    await assert.rejects(
      () =>
        transcribeAudio(
          file,
          1,
          { ELEVENLABS_API_KEY: "test" },
          async () => new Response("secret internal error", { status }),
        ),
      (e) => e instanceof ServiceError && !e.message.includes("secret"),
    );
  await assert.rejects(
    () =>
      transcribeAudio(file, 1, { ELEVENLABS_API_KEY: "test" }, async () =>
        Response.json({
          ...result,
          words: [{ text: "um", start: 99, end: 100, type: "word" }],
        }),
      ),
    /timing/,
  );
});
test("network timeout is actionable and does not leak upstream data", async () => {
  await assert.rejects(
    () =>
      transcribeAudio(file, 1, { ELEVENLABS_API_KEY: "test" }, async () => {
        throw new Error("secret");
      }),
    (e) =>
      e instanceof ServiceError &&
      e.status === 504 &&
      !e.message.includes("secret"),
  );
});
