import type { CameraSnapshot } from "./metrics";

/** Lossless RGBA over an encrypted, compressed WebSocket. No recordings or frame backlog. */
export function streamHostedCamera({ url, token, video, signal, onResult, onError, onFinished }: {
  url: string; token: string; video: HTMLVideoElement; signal: AbortSignal;
  onResult: (snapshot: CameraSnapshot) => void; onError: (message: string) => void; onFinished: () => void;
}) {
  const endpoint = new URL("/stream", url); endpoint.protocol = "wss:";
  const socket = new WebSocket(endpoint);
  const width = video.videoWidth, height = video.videoHeight, frameBytes = width * height * 4;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let closed = false, callback = 0, lastCapture = -Infinity, lastReply = performance.now();
  const started = performance.now();
  const startupTimeout = setTimeout(() => fail("The hosted camera connection did not open. Check the service and try again."), 8000);
  const durationTimeout = setTimeout(() => { if (!closed) { close(); onFinished(); } }, 45000);
  function close() {
    if (closed) return;
    closed = true; clearTimeout(startupTimeout); clearTimeout(durationTimeout);
    if (callback) video.cancelVideoFrameCallback(callback);
    signal.removeEventListener("abort", close);
    socket.close();
  }
  function fail(message: string) { if (!closed) { close(); onError(message); } }
  function frame(t: number) {
    if (closed) return;
    if (signal.aborted) { close(); return; }
    if (t - lastReply > 3000) { fail("The hosted camera connection stopped responding."); return; }
    if (socket.readyState !== WebSocket.OPEN || !context) { fail("The camera stream is unavailable."); return; }
    // Skip frames instead of building latency. The service withholds readings below 25 fps.
    if (t - lastCapture >= 1000 / 32 && socket.bufferedAmount < frameBytes * 2) {
      try {
        context.drawImage(video, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const packet = new Uint8Array(frameBytes + 8);
        new DataView(packet.buffer).setFloat64(0, (t - started) / 1000, true);
        packet.set(pixels, 8); socket.send(packet); lastCapture = t;
      } catch { fail("Could not capture the next camera frame."); return; }
    }
    callback = video.requestVideoFrameCallback(frame);
  }
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  socket.onopen = () => { if (!closed) socket.send(token); };
  socket.onerror = () => fail("Could not connect securely to the hosted camera service.");
  socket.onclose = () => fail("The hosted camera session ended. Start a new check.");
  let ready = false;
  socket.onmessage = event => {
    if (closed) return;
    try {
      const data = JSON.parse(event.data) as CameraSnapshot & { ready?: boolean; error?: string; finished?: boolean };
      lastReply = performance.now();
      if (data.error) { fail(data.error); return; }
      if (data.finished) { close(); onFinished(); return; }
      if (data.ready && !ready) {
        ready = true; clearTimeout(startupTimeout);
        if (!context || typeof video.requestVideoFrameCallback !== "function") { fail("Update Chrome to use hosted camera checks."); return; }
        callback = video.requestVideoFrameCallback(frame); return;
      }
      if (data.state === "error") { fail(data.guidance); return; }
      if (data.state) onResult(data);
    } catch { fail("The hosted service returned an unreadable response."); }
  };
  return close;
}
