import { issueToken } from "../lib/live/token.ts";
process.loadEnvFile(".dev.vars");
const result = await issueToken(process.env.ELEVENLABS_API_KEY);
console.log(
  JSON.stringify({
    tokenAvailable: !!result.token,
    status: result.status,
    error: result.error,
  }),
);
if (!result.token) process.exit(1);
const ws = new WebSocket(
  "wss://api.elevenlabs.io/v1/speech-to-text/realtime?" +
    new URLSearchParams({
      token: result.token,
      model_id: "scribe_v2_realtime",
      audio_format: "pcm_16000",
      include_timestamps: "true",
      include_language_detection: "true",
      commit_strategy: "vad",
      vad_silence_threshold_secs: "0.5",
      no_verbatim: "false",
    }),
);
const timer = setTimeout(() => {
  console.log("Handshake timed out");
  ws.close();
  process.exitCode = 1;
}, 15000);
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  console.log(
    JSON.stringify({ type: d.message_type, config: d.config, error: d.error }),
  );
  clearTimeout(timer);
  ws.close();
};
ws.onerror = () => {
  console.log("WebSocket connection failed");
  clearTimeout(timer);
  process.exitCode = 1;
};
