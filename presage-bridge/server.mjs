#!/usr/bin/env node
// SpeakSense ↔ Presage SmartSpectra bridge.
//
// The SmartSpectra Node SDK is a native (koffi FFI) runtime, so it cannot run in
// the browser or in the Cloudflare worker that serves SpeakSense. This process
// runs next to the dev server on the same machine: the browser owns the camera,
// streams RGBA frames here over a localhost WebSocket, and this process feeds them
// to the SDK via useCustomInput()/sendFrame() — the SDK's documented headless path.
// The API key never leaves this process.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  ERROR_NAMES,
  PROCESSING_NAMES,
  PULSE_RATE,
  VALIDATION_NAMES,
  mockPulse,
  normalizeMetrics,
  parseFrame,
} from "./protocol.mjs";

/** Reads KEY=value lines from the project's ignored .dev.vars (same file wrangler uses). */
function devVars() {
  try {
    const text = readFileSync(fileURLToPath(new URL("../.dev.vars", import.meta.url)), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
    );
  } catch {
    return {};
  }
}
const vars = { ...devVars(), ...process.env };
const mock = process.argv.includes("--mock") || vars.SMARTSPECTRA_MOCK === "1";
const port = Number(vars.PRESAGE_BRIDGE_PORT || 8790);
const allowedOrigins = new Set(
  (vars.PRESAGE_ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);
const apiKey = vars.SMARTSPECTRA_API_KEY || "";
const log = (...args) => console.log(`[presage-bridge]`, ...args);

let sdkModule = null;
let messages = null;
let loadError = "";
if (!mock) {
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    sdkModule = require("@smartspectra/node-sdk");
    messages = require("@smartspectra/node-sdk/messages");
  } catch (e) {
    loadError = `SmartSpectra SDK failed to load: ${e.message}`;
  }
}

function health() {
  return {
    ok: mock || (!!sdkModule && !!apiKey),
    source: mock ? "mock" : "presage",
    sdkVersion: sdkModule?.SmartSpectraSDK.version ?? null,
    sdkLoaded: !!sdkModule,
    keyConfigured: !!apiKey,
    error: mock
      ? ""
      : loadError ||
        (apiKey ? "" : "SMARTSPECTRA_API_KEY is not set in .dev.vars or the environment."),
  };
}

// Native SDK state is process-global: only one session runs at a time, and a new
// start waits for the previous session's teardown (same rule as the SDK's Electron glue).
let active = null;
let teardown = Promise.resolve();

class BridgeSession {
  constructor(ws) {
    this.ws = ws;
    this.sdk = null;
    this.running = false;
    this.frames = 0;
    this.rejected = 0;
    this.lastTs = 0;
    this.firstTs = 0;
    this.sendErrorReported = false;
    this.statsTimer = setInterval(() => this.stats(), 2000);
    this.statsFrames = 0;
    this.statsAt = Date.now();
  }
  send(message) {
    if (this.ws.readyState === 1)
      this.ws.send(JSON.stringify({ ...message, source: mock ? "mock" : "presage" }));
  }
  stats() {
    const now = Date.now();
    if (this.running)
      this.send({
        type: "stats",
        fps: Math.round((this.statsFrames * 10000) / Math.max(1, now - this.statsAt)) / 10,
        frames: this.frames,
        rejected: this.rejected,
      });
    this.statsFrames = 0;
    this.statsAt = now;
  }
  fail(code, message, retryable = false) {
    this.send({ type: "error", code, name: ERROR_NAMES[code] ?? "UNKNOWN", message, retryable });
  }
  async start() {
    if (this.running || this.starting) return;
    this.starting = true;
    try {
      await this.begin();
    } finally {
      this.starting = false;
    }
  }
  async begin() {
    if (active && active !== this) {
      active.send({ type: "preempted", message: "Another SpeakSense tab started the camera signal." });
      await active.stop();
    }
    // Module-level registry of the one session allowed to own the native SDK.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    active = this;
    await teardown;
    if (active !== this || this.ws.readyState !== 1) return;
    this.frames = 0;
    this.firstTs = 0;
    this.lastTs = 0;
    this.sendErrorReported = false;
    if (mock) {
      this.running = true;
      this.send({ type: "started", sdkVersion: null });
      this.send({ type: "processing", status: 3, name: "RUNNING" });
      return;
    }
    const status = health();
    if (!status.ok) {
      this.fail(status.sdkLoaded ? 2 : 3, status.error);
      return;
    }
    const { SmartSpectraSDK, FrameTransform, SmartSpectraLogLevel } = sdkModule;
    const sdk = new SmartSpectraSDK({
      apiKey,
      requestedMetrics: [PULSE_RATE],
      logLevel: SmartSpectraLogLevel.kWarning,
    });
    this.sdk = sdk;
    sdk.on("processingStatus", (s) => {
      this.send({ type: "processing", status: s, name: PROCESSING_NAMES[s] ?? "UNKNOWN" });
      if (s === 5) this.running = false;
    });
    sdk.on("validationStatus", (code, timestampUs, hint) =>
      this.send({
        type: "validation",
        code,
        name: VALIDATION_NAMES[code] ?? "UNKNOWN",
        hint,
        timestampUs,
      }),
    );
    sdk.on("metrics", (buf, timestampUs) => {
      try {
        const decoded = messages.Metrics.toObject(messages.Metrics.decode(buf), {
          longs: Number,
        });
        const { pulse, hrv } = normalizeMetrics(decoded);
        if (pulse.length || hrv.length)
          this.send({ type: "metrics", timestampUs, pulse, hrv });
      } catch (e) {
        log("could not decode metrics:", e.message);
      }
    });
    sdk.on("error", (code, message, retryable) => {
      this.running = false;
      this.fail(code, message, retryable);
    });
    try {
      sdk.useCustomInput(FrameTransform.kNone);
      sdk.start();
      this.running = true;
      this.send({ type: "started", sdkVersion: SmartSpectraSDK.version });
    } catch (e) {
      this.fail(typeof e.code === "number" ? e.code : 3, e.message, !!e.retryable);
      this.retire();
    }
  }
  frame(data) {
    if (!this.running) return;
    const frame = parseFrame(data);
    if (typeof frame === "string" || frame.timestampUs <= this.lastTs) {
      this.rejected++;
      return;
    }
    this.lastTs = frame.timestampUs;
    if (!this.firstTs) this.firstTs = frame.timestampUs;
    this.frames++;
    this.statsFrames++;
    if (mock) return this.mockFrame(frame.timestampUs);
    try {
      this.sdk.sendFrame(
        frame.pixels,
        frame.width,
        frame.height,
        frame.width * 4,
        sdkModule.PixelFormat.kRGBA,
        frame.timestampUs,
      );
    } catch (e) {
      this.running = false;
      if (!this.sendErrorReported) {
        this.sendErrorReported = true;
        this.fail(typeof e.code === "number" ? e.code : 8, e.message, !!e.retryable);
      }
    }
  }
  mockFrame(timestampUs) {
    const elapsed = (timestampUs - this.firstTs) / 1e6;
    if (this.frames === 1)
      this.send({ type: "validation", code: 10, name: "CAMERA_TUNING", hint: "Mock: camera tuning", timestampUs });
    if (this.frames === 45)
      this.send({ type: "validation", code: 0, name: "OK", hint: "Mock: OK", timestampUs });
    // One sample per second, stamped with the frame time like the real graph output.
    if (this.frames % 30 === 0) {
      const p = mockPulse(elapsed);
      this.send({ type: "metrics", timestampUs, pulse: [{ ...p, timestampUs }], hrv: [] });
    }
  }
  async stop() {
    this.running = false;
    if (this.sdk) {
      const sdk = this.sdk;
      await sdk.stopAsync().catch((e) => log("stop failed:", e.message));
      this.retire();
    }
    if (active === this) active = null;
    this.send({ type: "stopped" });
  }
  retire() {
    const sdk = this.sdk;
    this.sdk = null;
    if (!sdk) return;
    let done;
    try {
      done = sdk.destroy();
    } catch (e) {
      done = Promise.reject(e);
    }
    teardown = Promise.allSettled([teardown, Promise.resolve(done)]).then(() => {});
  }
  close() {
    clearInterval(this.statsTimer);
    this.running = false;
    this.retire();
    if (active === this) active = null;
  }
}

const cors = (req) => {
  const origin = req.headers.origin;
  return origin && allowedOrigins.has(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
};
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) });
    res.end(JSON.stringify(health()));
    return;
  }
  res.writeHead(404).end();
});
const wss = new WebSocketServer({
  server,
  path: "/presage",
  maxPayload: 16 * 1024 * 1024,
  // Only SpeakSense pages may drive this bridge (and spend Presage credits).
  verifyClient: ({ origin }) => allowedOrigins.has(origin),
});
wss.on("connection", (ws) => {
  const session = new BridgeSession(ws);
  session.send({ type: "hello", ...health() });
  ws.on("message", (data, isBinary) => {
    if (isBinary) return session.frame(data);
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message.type === "start") void session.start();
    if (message.type === "stop") void session.stop();
  });
  ws.on("close", () => session.close());
});
server.listen(port, "127.0.0.1", () => {
  const h = health();
  log(`listening on ws://127.0.0.1:${port}/presage`);
  log(
    mock
      ? "MOCK MODE — deterministic stand-in values, labelled 'mock' in every message. Not measured data."
      : `SmartSpectra SDK ${h.sdkVersion ?? "(not loaded)"} · API key ${h.keyConfigured ? "configured" : "MISSING"}`,
  );
  if (h.error) log(h.error);
  log(`accepting origins: ${[...allowedOrigins].join(", ")}`);
});
const shutdown = async () => {
  await active?.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
