import { readFile, writeFile, mkdir, access } from "node:fs/promises";
await access("dist/server/index.js");
await access("dist/client/samples/attempt-1.wav");
await access("dist/client/samples/live-controlled.wav");
await access("dist/client/samples/live-countdown.wav");
await access("dist/client/pcm-worklet.js");
for (const cue of ["breathe", "fillers", "pace", "pace-up", "volume", "time-60", "time-20", "time-10"])
  await access(`dist/client/cues/${cue}.mp3`);
const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
// Keep generated framework module rules and relative asset paths. Avoid source maps or credentials.
config.name = "speaksense";
config.workers_dev = true;
config.preview_urls = false;
config.observability = { enabled: false };
await writeFile(
  "dist/server/wrangler.json",
  JSON.stringify(config, null, 2) + "\n",
);
await mkdir("artifacts", { recursive: true });
console.log(
  "Prepared dist/server/wrangler.json and dist/client for Cloudflare HTTPS deployment. No upload performed.",
);
