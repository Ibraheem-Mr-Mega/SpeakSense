import { mkdir, access, writeFile } from "node:fs/promises";
import { VOICE_PHRASES } from "../lib/live/cue-catalog.ts";
process.loadEnvFile(".dev.vars");
const voice = "SAz9YHcvj6GT2YYXdXww"; // River: provider's premade calm conversational voice.
const model = "eleven_flash_v2_5";
await mkdir("public/cues", { recursive: true });
for (const [name, text] of Object.entries(VOICE_PHRASES)) {
  const path = `public/cues/${name}.mp3`;
  try { await access(path); console.log(`${name}: cached`); continue; } catch {}
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.7, similarity_boost: 0.75, style: 0, speed: 0.9, use_speaker_boost: true } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Voice generation HTTP ${r.status}; no provider body or key logged.`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!r.headers.get("content-type")?.includes("audio") || bytes.length < 1000) throw new Error("Invalid speech asset");
  await writeFile(path, bytes);
  console.log(`${name}: ${bytes.length} bytes; ${text.length} characters`);
}
await writeFile("public/cues/manifest.json", JSON.stringify({ voice: "River", voiceId: voice, model, speed: 0.9, phrases: VOICE_PHRASES, generated: new Date().toISOString() }, null, 2) + "\n");
