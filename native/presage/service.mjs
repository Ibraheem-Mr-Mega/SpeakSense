import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { gateReading, VALIDATION_HINTS, supportedPresageHost } from "../../lib/camera/metrics.ts";

const mono = () => Number(process.hrtime.bigint()) / 1e9;
const errorText = code => ({ 2: "Presage did not accept the API key.", 3: "Presage could not configure the requested measurements.", 4: "Presage credits are exhausted.", 5: "Presage could not connect. Check your connection.", 6: "Presage is temporarily unavailable." }[code] ?? "Presage processing stopped. Stop the camera and try again.");
const validSize = (w, h) => Number.isInteger(w) && Number.isInteger(h) && w >= 320 && h >= 240 && w <= 1280 && h <= 720;
async function body(req, max) {
  if (Number(req.headers["content-length"]) > max) {
    req.resume();
    throw Object.assign(new Error("Request too large"), { status: 413 });
  }
  return new Promise((resolve, reject) => {
    const chunks = []; let length = 0;
    const cleanup = () => { req.off("data", data); req.off("end", end); req.off("error", fail); req.off("aborted", aborted); };
    const fail = error => { cleanup(); reject(error); };
    const aborted = () => fail(new Error("Request aborted"));
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const data = chunk => {
      length += chunk.length;
      if (length > max) { cleanup(); req.resume(); reject(Object.assign(new Error("Request too large"), { status: 413 })); }
      else chunks.push(chunk);
    };
    req.on("data", data); req.on("end", end); req.on("error", fail); req.on("aborted", aborted);
  });
}
function equal(a, b) {
  const x = Buffer.from(a ?? ""), y = Buffer.from(b ?? "");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createPresageService({ apiKey, loadSdk, platform = process.platform, arch = process.arch, now = mono, origins = ["http://localhost:5173", "http://127.0.0.1:5173"], accessKey = "", hosted = false, maxSessionsPerHour = 20 }) {
  let current = null, closing = null, loading = false;
  let starts = [];
  if (hosted && (accessKey.length < 32 || origins.length === 0)) throw new Error("Hosted camera service requires a private access code and allowed origins.");
  const supported = supportedPresageHost(platform, arch);
  let runtime = null, runtimeIssue = "";
  async function health() {
    if (supported && apiKey && !runtime) {
      try { runtime = await loadSdk(); runtimeIssue = ""; }
      catch { runtimeIssue = "Presage runtime is not installed or could not load. Install the camera service on a supported computer."; }
    }
    return { available: supported && !!apiKey && !!runtime,
      platform: `${platform}-${arch}`, configured: !!apiKey,
      message: !supported ? "Presage does not support this Intel Mac. Use an Apple Silicon Mac, supported Linux runtime, or Windows computer."
        : !apiKey ? "The camera service needs its Presage key." : runtimeIssue || "Presage service ready. Your key and account access are checked when a measurement starts." };
  }
  async function stop() {
    if (closing) return closing;
    const s = current;
    if (!s) return;
    current = null;
    if (s.socket) s.socket.close(1000, "Camera check ended");
    closing = (async () => {
      try { await s.sdk.stopAsync(); } catch { /* Teardown still required. */ }
      try { await s.sdk.destroy(); } catch { /* Never send provider error text. */ }
    })();
    try { await closing; } finally { closing = null; }
  }
  function snapshot(s) {
    const t = now();
    if (s.state !== "running" || t - s.talkingAt > 3 || s.talking || !s.talkingStable || s.validation !== 0 || t - s.lastFrame > 0.5 || s.frameTimes.length < 25) s.goodSince = null;
    else if (s.goodSince === null) s.goodSince = t;
    return { state: s.state, seconds: Math.max(0, t - s.started),
      guidance: s.error || (s.frameTimes.length < 25 && t - s.started > 3 ? "Camera frames are arriving too slowly. Close other apps or improve lighting." : s.talking || !s.talkingStable || t - s.talkingAt > 3 ? "Stay quiet while the camera measures; speech can disrupt these readings." : VALIDATION_HINTS[s.validation] ?? "Waiting for camera validation."),
      pulse: gateReading(s.pulse, t, s.goodSince, 12), breathing: gateReading(s.breathing, t, s.goodSince, 30) };
  }
  function remember(s, key, sample) {
    if (!sample || sample.timestamp === undefined) return;
    const stamp = String(sample.timestamp);
    if (stamp === s[`${key}Stamp`]) return;
    s[`${key}Stamp`] = stamp;
    s[key] = { sample: { value: sample.value, confidence: sample.confidence, stable: sample.stable }, received: now() };
  }
  function processFrame(s, bytes, captureSeconds) {
    if (bytes.length !== s.width * s.height * 4) throw new Error("Invalid frame size");
    let timestamp;
    if (captureSeconds !== undefined) {
      const t = now();
      if (!Number.isFinite(captureSeconds) || captureSeconds < 0 || captureSeconds > 46 || captureSeconds <= (s.lastCapture ?? -1)) throw new Error("Invalid capture time");
      if (s.captureOrigin === undefined) s.captureOrigin = t - captureSeconds;
      // Reject stale/burst-replayed frames instead of assigning misleading arrival timestamps.
      const drift = t - s.captureOrigin - captureSeconds;
      if (drift > 0.75 || drift < -0.25) throw new Error("Camera stream delayed");
      if (s.lastCapture !== undefined && captureSeconds - s.lastCapture < 1 / 65) throw new Error("Camera frame rate exceeded");
      if (s.lastCapture !== undefined && captureSeconds - s.lastCapture > 0.5) s.goodSince = null;
      s.lastCapture = captureSeconds;
      timestamp = Math.floor((s.captureOrigin + captureSeconds) * 1e6);
    } else timestamp = Math.floor(now() * 1e6);
    timestamp = Math.max(timestamp, s.lastTimestamp + 1);
    s.lastTimestamp = timestamp;
    const accepted = s.sdk.sendFrame(bytes, s.width, s.height, s.width * 4, runtime.PixelFormat.kRGBA, timestamp);
    if (!accepted || now() - s.lastFrame > 0.5) s.goodSince = null;
    if (accepted) { s.lastFrame = now(); s.frameTimes.push(s.lastFrame); }
    s.frameTimes = s.frameTimes.filter(t => t > now() - 1);
    return snapshot(s);
  }
  // WebSocketServer is supplied by the native entry point; the Worker never imports it.
  function attachStreaming(WebSocketServer) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1280 * 720 * 4 + 8,
      perMessageDeflate: { serverNoContextTakeover: true, clientNoContextTakeover: true, concurrencyLimit: 2 } });
    let pending = null;
    server.on("upgrade", (req, socket, head) => {
      const s = current;
      if (req.url !== "/stream" || !origins.includes(req.headers.origin) || !s || s.socket || pending) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return;
      }
      const lease = Symbol("camera handshake"); pending = lease;
      const release = () => { if (pending === lease) pending = null; };
      socket.once("close", release);
      wss.handleUpgrade(req, socket, head, ws => {
        let authorized = false;
        const timeout = setTimeout(() => ws.terminate(), 2000);
        ws.on("error", () => ws.terminate());
        ws.on("close", () => { clearTimeout(timeout); release(); if (authorized && current === s) void stop(); });
        ws.on("message", (data, binary) => {
          if (!authorized) {
            if (binary || data.length > 128 || !equal(data.toString(), s.token) || current !== s || s.socket) { ws.close(1008, "Session required"); return; }
            clearTimeout(timeout); release(); authorized = true; s.socket = ws;
            ws.send(JSON.stringify({ ready: true })); return;
          }
          if (current !== s) { ws.close(1000); return; }
          if (now() - s.started >= 45) { ws.send(JSON.stringify({ finished: true })); void stop(); return; }
          try {
            if (!binary || data.length !== s.width * s.height * 4 + 8) throw new Error("Invalid frame");
            const result = processFrame(s, data.subarray(8), data.readDoubleLE(0));
            if (ws.bufferedAmount > 65536) throw new Error("Slow connection");
            if (now() - (s.lastReply ?? 0) >= 0.2 || result.state === "error") {
              ws.send(JSON.stringify(result)); s.lastReply = now();
            }
            if (result.state === "error") void stop();
          } catch {
            ws.send(JSON.stringify({ error: "Camera stream could not keep up. Improve your connection and try again." }));
            void stop();
          }
        });
      });
    });
  }
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        ...(origins.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}) });
      res.end(JSON.stringify(data));
    };
    // Readiness is safe for the hosting platform: no origin, account state, or secret is returned.
    if (req.method === "GET" && req.url === "/readyz") {
      const ready = await health(); return send(ready.available ? 200 : 503, { ready: ready.available });
    }
    // Exact origin checks also prevent cross-site localhost camera control and DNS rebinding.
    if (!origins.includes(origin)) return send(403, { error: "Origin is not allowed." });
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" });
      return res.end();
    }
    try {
      if (hosted && (req.url === "/health" || (req.url === "/session" && req.method === "POST")) && !equal(req.headers.authorization, `Bearer ${accessKey}`)) return send(401, { error: "Enter the private camera access code." });
      if (req.method === "GET" && req.url === "/health") return send(200, await health());
      if (req.method === "POST" && req.url === "/session") {
        if (current || closing || loading) return send(409, { error: "Another camera check is active. Stop it first." });
        starts = starts.filter(t => t > now() - 3600);
        if (hosted && starts.length >= maxSessionsPerHour) return send(429, { error: "Camera check limit reached. Try again later." });
        loading = true;
        try {
          const ready = await health();
          if (!ready.available) return send(503, { error: ready.message });
          const data = JSON.parse((await body(req, 512)).toString());
          if (!validSize(data.width, data.height)) return send(400, { error: "Unsupported camera dimensions." });
          if (hosted) starts.push(now());
          const sdk = new runtime.SmartSpectraSDK({ apiKey, requestedMetrics: [2, 13, 15], enableTelemetry: false, enableAccumulatedOutput: false, logLevel: runtime.SmartSpectraLogLevel.kNone });
          const s = { sdk, token: randomUUID(), width: data.width, height: data.height, started: now(), lastFrame: now(), state: "starting", validation: -1, goodSince: null, talking: true, talkingStable: false, talkingAt: -Infinity, inFrame: false, lastTimestamp: 0, frameTimes: [] };
          current = s;
          sdk.on("processingStatus", code => { if (current === s) s.state = ({ 0: "starting", 1: "idle", 2: "starting", 3: "running", 4: "stopping", 5: "error" })[code] ?? "error"; });
          sdk.on("validationStatus", code => { if (current === s) { s.validation = code; if (code !== 0) s.goodSince = null; } });
          sdk.on("error", code => { if (current === s) { s.state = "error"; s.error = errorText(code); s.goodSince = null; } });
          sdk.on("metrics", bytes => {
            if (current !== s) return;
            try {
              const metrics = runtime.decodeMetrics(bytes);
              remember(s, "pulse", metrics.cardio?.pulseRate?.at(-1));
              remember(s, "breathing", metrics.breathing?.rate?.at(-1));
              const talking = metrics.face?.talking?.at(-1);
              if (talking && talking.timestamp !== undefined && String(talking.timestamp) !== s.talkingStamp) {
                s.talkingStamp = String(talking.timestamp); s.talking = talking.detected !== false;
                s.talkingStable = talking.stable === true; s.talkingAt = now();
                if (s.talking || !s.talkingStable) s.goodSince = null;
              }
            } catch { s.state = "error"; s.error = "Presage returned unreadable measurements."; s.goodSince = null; }
          });
          try { sdk.useCustomInput(runtime.FrameTransform.kNone); sdk.start(); }
          catch (e) { await stop(); return send(502, { error: errorText(e.code) }); }
          if (s.state === "error") { const message = s.error; await stop(); return send(502, { error: message }); }
          send(201, { token: s.token, ...snapshot(s) });
        } finally { loading = false; }
        return;
      }
      const s = current;
      if (!s || !equal(req.headers.authorization, `Bearer ${s.token}`)) return send(401, { error: "Camera session ended. Start a new check." });
      if (req.method === "DELETE" && req.url === "/session") { await stop(); return send(200, { stopped: true }); }
      if (req.method === "POST" && req.url === "/frame") {
        if (hosted || s.socket) return send(400, { error: "Use the camera stream for this session." });
        if (s.inFrame) return send(429, { error: "A camera frame is already processing." });
        if (now() - s.started >= 45) { await stop(); return send(200, { finished: true }); }
        s.inFrame = true;
        try {
          const bytes = await body(req, s.width * s.height * 4);
          if (current !== s) return send(410, { error: "Camera session ended." });
          if (bytes.length !== s.width * s.height * 4) return send(400, { error: "Invalid camera frame size." });
          const result = processFrame(s, bytes);
          if (result.state === "error") await stop();
          send(200, result);
        } finally { s.inFrame = false; }
        return;
      }
      send(404, { error: "Unknown camera endpoint." });
    } catch (e) {
      if (req.url === "/frame" || (req.url === "/session" && req.method === "POST")) await stop();
      send(e.status ?? 400, { error: e.status === 413 ? "Camera frame is too large." : "Camera request failed. Start a new check." });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  const watchdog = setInterval(() => {
    if (current && (now() - current.lastFrame > 3 || now() - current.started >= 46 || current.state === "error")) void stop();
  }, 500);
  watchdog.unref();
  return { server, health, attachStreaming, async close() { clearInterval(watchdog); await stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
