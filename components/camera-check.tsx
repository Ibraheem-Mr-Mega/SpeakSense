"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { streamHostedCamera } from "@/lib/camera/hosted-stream";
import type { CameraSnapshot } from "@/lib/camera/metrics";

const LOCAL_BRIDGE = "http://127.0.0.1:8789";
type Health = { available: boolean; message: string };
export function CameraCheck({ speaking }: { speaking: boolean }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const generation = useRef(0), token = useRef(""), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bridge = useRef(LOCAL_BRIDGE), streamStop = useRef<(() => void) | null>(null);
  const [hostedUrl, setHostedUrl] = useState(""), [accessCode, setAccessCode] = useState("");
  const [useHosted, setUseHosted] = useState(false);
  const abort = useRef<AbortController | null>(null), mounted = useRef(true);
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [measuring, setMeasuring] = useState(false);
  const [health, setHealth] = useState<Health | null>(null), [result, setResult] = useState<CameraSnapshot | null>(null);
  const [message, setMessage] = useState("Camera off. A quiet check is optional before or after your pitch.");
  const [error, setError] = useState("");

  const stop = useCallback((notice = "Camera off. No video or readings were saved.") => {
    generation.current++;
    clearTimeout(timer.current);
    streamStop.current?.(); streamStop.current = null;
    abort.current?.abort(); abort.current = null;
    const id = token.current; token.current = "";
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (id) void fetch(`${bridge.current}/session`, { method: "DELETE", headers: { Authorization: `Bearer ${id}` }, signal: AbortSignal.timeout(4000) }).catch(() => {});
    if (mounted.current) { setPreview(false); setBusy(false); setMeasuring(false); setResult(null); setMessage(notice); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.hidden) stop("Camera stopped because this page left the foreground."); };
    const offline = () => stop("Camera stopped because the connection changed.");
    document.addEventListener("visibilitychange", hidden);
    const pageHide = () => stop();
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("offline", offline);
    return () => {
      mounted.current = false; stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("offline", offline);
    };
  }, [stop]);
  useEffect(() => {
    // Quiet measurements must stop before speech changes the breathing signal.
    if (speaking) stop("Camera off while you speak. You can check again after your pitch.");
  }, [speaking, stop]);

  function connection() {
    if (!useHosted) return { url: LOCAL_BRIDGE, headers: {} as Record<string, string> };
    let url: URL;
    try { url = new URL(hostedUrl.trim()); } catch { throw new Error("Enter the HTTPS address of your camera service."); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use the service's HTTPS address without a path or sign-in details.");
    if (accessCode.trim().length < 32) throw new Error("Enter the private camera access code from your hosting settings, not your Presage API key.");
    return { url: url.origin, headers: { Authorization: `Bearer ${accessCode.trim()}` } };
  }
  async function checkService() {
    try {
      const target = connection(); bridge.current = target.url;
      const response = await fetch(`${target.url}/health`, { headers: target.headers, redirect: "error", signal: AbortSignal.timeout(useHosted ? 15000 : 4000) });
      if (!response.ok) throw new Error(response.status === 401 ? "The private camera access code was not accepted." : "The camera service is not ready yet.");
      const data = await response.json() as Health;
      if (mounted.current) setHealth(data);
      return data;
    } catch (e) {
      const data = { available: false, message: e instanceof Error && !(e instanceof TypeError) ? e.message : "Presage measurement service is unavailable. Camera preview still works. Check the service address and allowed app address." };
      if (mounted.current) setHealth(data);
      return data;
    }
  }
  async function openCamera() {
    if (speaking || busy) return;
    stop();
    const n = generation.current;
    setBusy(true); setError(""); setResult(null);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires localhost or a secure HTTPS page.");
      const capture = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, min: 25 } } });
      if (n !== generation.current) { capture.getTracks().forEach(track => track.stop()); return; }
      stream.current = capture;
      capture.getVideoTracks()[0].addEventListener("ended", () => stop("Camera disconnected. Preview and measurement stopped."), { once: true });
      video.current!.srcObject = capture;
      await video.current!.play();
      if (n !== generation.current) return;
      setPreview(true); setMessage("Camera preview only · nothing is being measured or recorded.");
      void checkService();
    } catch (e) {
      if (n !== generation.current) return;
      stop();
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser settings to preview." : e instanceof Error ? e.message : "Could not open the camera.");
    } finally { if (n === generation.current && mounted.current) setBusy(false); }
  }
  async function measure() {
    if (!preview || busy || speaking || measuring) return;
    const n = generation.current;
    setBusy(true); setError(""); setResult(null);
    let ownToken = "";
    try {
      const ready = await checkService();
      if (n !== generation.current) return;
      if (!ready.available) throw new Error(ready.message);
      const element = video.current!;
      const width = element.videoWidth, height = element.videoHeight;
      if (width < 320 || height < 240 || width > 1280 || height > 720) throw new Error("This camera resolution is unsupported. Choose a camera that can capture between 320×240 and 1280×720.");
      const controller = new AbortController(); abort.current = controller;
      const target = connection(); bridge.current = target.url;
      const response = await fetch(`${target.url}/session`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", ...target.headers }, body: JSON.stringify({ width, height }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
      const data = await response.json() as CameraSnapshot & { token?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error ?? "Presage could not start.");
      ownToken = data.token;
      if (n !== generation.current) {
        void fetch(`${target.url}/session`, { method: "DELETE", redirect: "error", headers: { Authorization: `Bearer ${ownToken}` }, signal: AbortSignal.timeout(4000) }).catch(() => {});
        return;
      }
      token.current = ownToken;
      setBusy(false); setMeasuring(true); setResult(data);
      setMessage("Camera on · Presage quiet check · stops after 45 seconds.");
      if (useHosted) {
        streamStop.current = streamHostedCamera({ url: target.url, token: ownToken, video: element, signal: controller.signal,
          onResult: next => { if (n === generation.current) setResult(next); },
          onError: detail => { if (n === generation.current) { stop("Camera stopped. Measurements are unavailable."); setError(detail); } },
          onFinished: () => { if (n === generation.current) stop("Quiet check complete. Camera off; no video or readings saved."); } });
        return;
      }
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Camera frame capture is unavailable.");
      const started = performance.now();
      let lastUi = 0;
      const send = async () => {
        if (n !== generation.current || !stream.current) return;
        if (performance.now() - started >= 45000) { stop("Quiet check complete. Camera off; no video or readings saved."); return; }
        const frameStarted = performance.now();
        try {
          context.drawImage(element, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height).data;
          const reply = await fetch(`${bridge.current}/frame`, { method: "POST", headers: { "Content-Type": "application/octet-stream", Authorization: `Bearer ${ownToken}` }, body: pixels, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]) });
          const next = await reply.json() as CameraSnapshot & { finished?: boolean; error?: string };
          if (n !== generation.current) return;
          if (!reply.ok) throw new Error(next.error ?? "Camera analysis stopped.");
          if (next.finished) { stop("Quiet check complete. Camera off; no video or readings saved."); return; }
          if (next.state === "error") throw new Error(next.guidance);
          if (performance.now() - lastUi >= 200) { setResult(next); lastUi = performance.now(); }
          timer.current = setTimeout(() => void send(), Math.max(0, 1000 / 30 - (performance.now() - frameStarted)));
        } catch (e) {
          if (n !== generation.current) return;
          stop("Camera stopped. Measurements are unavailable.");
          setError(e instanceof Error ? e.message : "Camera connection failed.");
        }
      };
      void send();
    } catch (e) {
      if (n !== generation.current) return;
      if (ownToken) stop();
      setError(e instanceof Error ? e.message : "Presage could not start.");
    } finally { if (n === generation.current && mounted.current) setBusy(false); }
  }
  return <section className="camera-check" aria-label="Optional camera check">
    <div className="section-heading"><div><p className="eyebrow">OPTIONAL / BEFORE OR AFTER YOUR PITCH</p><h2>A quiet camera check.</h2></div><span className="pill">{measuring ? "Measuring" : preview ? "Preview only" : "Camera off"}</span></div>
    <p>See optional pulse and breathing estimates from Presage. Sit still and quietly with your face and upper chest in even light. These readings do not measure confidence or diagnose anxiety.</p>
    <div className="camera-layout">
      <div className="camera-preview"><video ref={video} muted playsInline aria-label="Your camera preview" />{!preview && <span><CameraOff aria-hidden="true" />Camera is off</span>}</div>
      <div className="camera-controls">
        <details className="camera-connection">
          <summary>Camera service connection</summary>
          <fieldset disabled={busy || measuring}>
            <label><input type="checkbox" checked={useHosted} onChange={e => { setUseHosted(e.target.checked); setHealth(null); }} /> Use a hosted camera service</label>
            {useHosted && <>
              <label>Service address<input type="url" placeholder="https://your-camera-service.example" value={hostedUrl} onChange={e => { setHostedUrl(e.target.value); setHealth(null); }} autoComplete="off" spellCheck={false} /></label>
              <label>Private access code<input type="password" value={accessCode} onChange={e => { setAccessCode(e.target.value); setHealth(null); }} autoComplete="off" /></label>
              <p className="small">Use the access code from your hosting settings. These details stay in this tab and clear when you reload.</p>
            </>}
          </fieldset>
        </details>
        <p role="status">{message}</p>
        <div className="button-row">
          {!preview && !busy && <button className="secondary-button" disabled={speaking} onClick={() => void openCamera()}><Camera size={18} />Preview camera</button>}
          {preview && !measuring && <button className="primary-button" disabled={busy || speaking || !health?.available} onClick={() => void measure()}>{busy ? "Starting Presage…" : "Start 45-second Presage check"}</button>}
          {(preview || busy || measuring) && <button className="stop-button" onClick={() => stop()}><CameraOff size={18} />Stop camera</button>}
        </div>
        {preview && !measuring && <button className="text-button" disabled={busy} onClick={() => void checkService()}>Check Presage connection</button>}
        {health && <p className={health.available ? "small" : "notice"}>{health.message}</p>}
        {result && measuring && <>
          <p role="status">{result.guidance} {Math.max(0, Math.ceil(45 - result.seconds))} seconds left.</p>
          <div className="camera-readings">{([["Pulse", result.pulse, "bpm"], ["Breathing", result.breathing, "breaths/min"]] as const).map(([name, reading, unit]) => <div key={name}><h3>{name}</h3><strong>{reading.value === null ? "—" : Math.round(reading.value)}</strong><span>{unit}</span><p>{reading.reason}</p>{reading.confidence !== null && <small>Signal confidence {Math.round(reading.confidence)}%</small>}</div>)}</div>
        </>}
        {error && <p role="alert" className="error">{error}</p>}
        <p className="small">Preview stays in this tab. {useHosted ? `Starting a check sends live camera frames over an encrypted connection to your hosted service${health?.available ? ` at ${hostedUrl.trim()}` : ""}, where Presage processes them. A fast upload connection is required.` : "Starting a check sends camera frames to the measurement service on this computer, where Presage processes them."} SpeakSense does not save video or readings. Stop, leaving this page, or starting a pitch turns the camera off.</p>
      </div>
    </div>
  </section>;
}
