import { fileURLToPath } from "node:url";
import { createPresageService } from "./service.mjs";
try { process.loadEnvFile(fileURLToPath(new URL("../../.dev.vars", import.meta.url))); }
catch (e) { if (e.code !== "ENOENT") throw new Error("Could not load local camera settings."); }
const service = createPresageService({ apiKey: process.env.PRESAGE_API_KEY,
  loadSdk: async () => { const sdkModule = await import("@smartspectra/node-sdk"); return sdkModule.default ?? sdkModule; } });
if (process.argv.includes("--check")) {
  const result = await service.health();
  console.log(JSON.stringify(result));
  await service.close();
  process.exitCode = result.available ? 0 : 2;
} else {
  service.server.listen(8789, "127.0.0.1", () => console.log("SpeakSense camera service listening on 127.0.0.1:8789. No camera is opened automatically."));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
}
