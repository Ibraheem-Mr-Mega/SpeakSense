import { fileURLToPath } from "node:url";
import { createPresageService } from "./service.mjs";
const hosted = process.env.CAMERA_HOSTED === "true";
if (!hosted) {
  try { process.loadEnvFile(fileURLToPath(new URL("../../.dev.vars", import.meta.url))); }
  catch (e) { if (e.code !== "ENOENT") throw new Error("Could not load local camera settings."); }
}
const origins = (process.env.CAMERA_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map(s => s.trim()).filter(Boolean);
for (const origin of origins) {
  const url = new URL(origin);
  if (url.origin !== origin || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Camera origins must be exact HTTPS origins or local development origins.");
}
const maxSessionsPerHour = Number(process.env.CAMERA_MAX_SESSIONS_PER_HOUR ?? 20);
if (!Number.isInteger(maxSessionsPerHour) || maxSessionsPerHour < 1 || maxSessionsPerHour > 100) throw new Error("Invalid camera session limit.");
const service = createPresageService({ apiKey: process.env.PRESAGE_API_KEY, hosted, origins,
  accessKey: process.env.CAMERA_ACCESS_KEY, maxSessionsPerHour,
  loadSdk: async () => { const sdkModule = await import("@smartspectra/node-sdk"); return sdkModule.default ?? sdkModule; } });
if (process.argv.includes("--check")) {
  const result = await service.health();
  console.log(JSON.stringify(result));
  await service.close();
  process.exitCode = result.available ? 0 : 2;
} else {
  if (hosted) {
    const { WebSocketServer } = await import("ws");
    service.attachStreaming(WebSocketServer);
  }
  const port = Number(process.env.PORT ?? 8789);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid service port.");
  const host = hosted ? "0.0.0.0" : "127.0.0.1";
  service.server.listen(port, host, () => console.log(`SpeakSense camera service listening on ${host}:${port}. No camera is opened automatically.`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 8000); deadline.unref();
    void service.close().then(() => process.exit(0));
  });
}
