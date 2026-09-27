// Run manually after adding a server-side credential. Never prints the key or raw account data.
import { existsSync } from "node:fs";
if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error(
    "Missing ELEVENLABS_API_KEY. Add it to ignored .dev.vars or the server environment.",
  );
  process.exit(1);
}
const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
  headers: { "xi-api-key": key },
  signal: AbortSignal.timeout(15000),
});
if (response.ok) {
  const data = await response.json();
  console.log(
    JSON.stringify({
      subscriptionReadable: true,
      tier: data.tier,
      usedCredits: data.character_count,
      creditLimit: data.character_limit,
    }),
  );
} else
  console.log(
    `Subscription lookup returned ${response.status}; a restricted speech-to-text key may lack this read permission. This does not prove transcription is unavailable.`,
  );
console.log(
  "Credits or subscription visibility alone do not prove Scribe API access. A successful transcription is the decisive check.",
);
if (process.argv.includes("--transcribe-sample")) {
  const { readFile } = await import("node:fs/promises");
  const { transcribeAudio } = await import("../lib/speech/transcription.ts");
  const { analyze } = await import("../lib/speech/analysis.ts");
  const fixture = JSON.parse(
    await readFile("public/samples/attempt-1.json", "utf8"),
  );
  const wav = await readFile("public/samples/attempt-1.wav");
  const result = await transcribeAudio(
    new Blob([wav], { type: "audio/wav" }),
    fixture.duration,
    {
      ELEVENLABS_API_KEY: key,
      ELEVENLABS_ZERO_RETENTION: process.env.ELEVENLABS_ZERO_RETENTION,
    },
  );
  const metrics = analyze(result, fixture.duration);
  console.log(
    JSON.stringify({
      scribeV2AccessVerified: true,
      expectedAudibleFillers: 4,
      recognizedFillers: metrics.fillers.length,
      wordCount: metrics.wordCount,
      timestampedFillers: metrics.fillers,
    }),
  );
  if (metrics.fillers.length !== 4) {
    console.error(
      "Filler recall differs from the synthetic reference. Listen and review recognition errors; do not treat transcript counts as ground truth.",
    );
    process.exitCode = 2;
  }
}
