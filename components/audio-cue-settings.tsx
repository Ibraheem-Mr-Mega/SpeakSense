"use client";
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { CueAudioOutput, SYSTEM_OUTPUT, type AudioMode, type AudioDelivery } from "@/lib/live/audio-output";
import { VOICE_PHRASES, type VoiceKey } from "@/lib/live/cue-catalog";
export function AudioCueSettings({ active, onOutput, onEnabled, onDelivery, controlledTest = false }: {
  controlledTest?: boolean;
  active: boolean;
  onOutput: (output: CueAudioOutput | null) => void;
  onEnabled: (enabled: boolean) => void;
  onDelivery: (id: string, result: AudioDelivery) => void;
}) {
  const output = useRef<CueAudioOutput | null>(null);
  const callbacks = useRef({ onOutput, onEnabled, onDelivery });
  useEffect(() => { callbacks.current = { onOutput, onEnabled, onDelivery }; }, [onOutput, onEnabled, onDelivery]);
  const [supported, setSupported] = useState(false), [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState(""), [previewed, setPreviewed] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [enabled, setEnabled] = useState(false), [mode, setMode] = useState<AudioMode>("voice"), [volume, setVolume] = useState(0.5);
  const [error, setError] = useState(""), [status, setStatus] = useState("Loading voice prompts…"), [busy, setBusy] = useState(true);
  const [testPrompt, setTestPrompt] = useState<VoiceKey>("breathe");
  useEffect(() => {
    let mounted = true;
    const channel = new CueAudioOutput();
    channel.setVolume(0.5);
    output.current = channel;
    callbacks.current.onOutput(channel);
    channel.onInvalidated = () => {
      setEnabled(false); setSelected(""); setPreviewed(false); setConfirmed(false);
      callbacks.current.onEnabled(false);
    };
    channel.onStatus = (id, result) => {
      setStatus(`${result.mode === "voice" ? "Voice" : "Tone"}: ${result.status}. ${result.detail}`);
      callbacks.current.onDelivery(id, result);
    };
    void channel.setMode("voice").then(() => {
      if (mounted) { setStatus("Voice ready · audio is off until you test and enable it."); setSupported(channel.supported()); }
    }).catch(e => { if (mounted) { setError((e as Error).message); setStatus("Voice loading failed. Select Tone or reload to retry Voice."); } }).finally(() => { if (mounted) { setBusy(false); setSupported(channel.supported()); } });
    const changed = () => {
      if (channel.devicesChanged()) {
        setError("Audio devices changed. Prompts are off; select and test your output again.");
        setStatus("Audio off · output needs another test.");
      }
    };
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    return () => {
      mounted = false;
      channel.dispose(); output.current = null; callbacks.current.onOutput(null);
      navigator.mediaDevices?.removeEventListener("devicechange", changed);
    };
  }, []);
  async function discover() {
    setBusy(true); setError("");
    try {
      const found = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audiooutput" && d.label && d.deviceId && !["default", "communications"].includes(d.deviceId));
      setDevices(found);
      if (!found.length) setStatus("No named outputs found. Allow microphone access and refresh, or use your system output.");
    } catch { setError("Output names are unavailable. You can still select Use system output and test it."); }
    finally { setBusy(false); }
  }
  async function choose(id: string) {
    setBusy(true); setError("");
    try { await output.current!.choose(id); setSelected(id); setStatus("Output selected. Play a test before enabling cues."); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function style(value: AudioMode) {
    setMode(value); setEnabled(false); setPreviewed(false); setConfirmed(false); setBusy(true); setError("");
    callbacks.current.onEnabled(false);
    try { await output.current!.setMode(value); setStatus("Play the selected sound and confirm your output again."); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function preview() {
    setError(""); setBusy(true); setPreviewed(false); setConfirmed(false); setEnabled(false);
    callbacks.current.onEnabled(false);
    output.current!.setEnabled(false);
    try { await output.current!.preview(testPrompt); setPreviewed(true); setStatus("Test playback started. Check where you hear it before enabling cues."); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function toggle(value: boolean) {
    try { output.current!.setEnabled(value); setEnabled(value); callbacks.current.onEnabled(value); setStatus(value ? `${mode === "voice" ? "Voice" : "Tone"} cues enabled.` : "Audio cues off."); }
    catch(e) { setError((e as Error).message); }
  }
  return <section className="earbud-settings" aria-label="Audio cue settings">
    <div className="section-heading"><h3>Audio cues</h3><span className="pill">{enabled ? (mode === "voice" ? "Voice on" : "Tone on") : "Off"}</span></div>
    <p className="small">Choose spoken guidance or short tones. Visual cues have their own switch.</p>
    <fieldset className="audio-style"><legend>Cue sound</legend>
      {(["voice", "tone"] as const).map(value => <label key={value} className={mode === value ? "chosen" : ""}>
        <input type="radio" name="cue-sound" value={value} checked={mode === value} disabled={active || busy} onChange={() => void style(value)} />
        <span><strong>{value === "voice" ? "Voice" : "Tone"}</strong><small>{value === "voice" ? "Calm, spoken reminders" : "Short musical prompts"}</small></span>
      </label>)}
    </fieldset>
    <label className="field-label" htmlFor="cue-output">Headphones / audio output</label>
    <select id="cue-output" disabled={active || busy} value={selected} onChange={e => void choose(e.target.value)}>
      <option value="" disabled>Choose an output</option>
      <option value={SYSTEM_OUTPUT}>Use system output</option>
      {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
    </select>
    {supported ? <button className="text-button" disabled={active || busy} onClick={() => void discover()}>Refresh audio outputs</button> : <p className="small">Choose your headphones in your device’s sound settings, then select Use system output. This also works when Safari cannot choose speakers inside a webpage.</p>}
    {selected === SYSTEM_OUTPUT && <p className="notice">Your device controls this route. If headphones disconnect, sound may move to speakers. Check the room during the test; private output is not verified by the app.</p>}
    <label className="field-label" htmlFor="cue-volume">Cue volume · {Math.round(volume * 100)}%</label>
    <input id="cue-volume" type="range" min="0.05" max="1" step="0.05" value={volume} onChange={e => { const value = Number(e.target.value); setVolume(value); output.current?.setVolume(value); }} />
    <label className="field-label" htmlFor="test-prompt">Test prompt</label>
    <select id="test-prompt" value={testPrompt} disabled={active || busy} onChange={e => setTestPrompt(e.target.value as VoiceKey)}>{Object.entries(VOICE_PHRASES).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
    <button className="secondary-button" disabled={active || busy || !selected} onClick={() => void preview()}>{busy ? "Preparing audio…" : mode === "voice" ? "Play voice test" : "Play tone test"}</button>
    <label className="switch-label"><Switch disabled={active || !previewed || busy} checked={confirmed} onCheckedChange={value => { setConfirmed(value); output.current?.confirm(value); if (!value) toggle(false); }} />{controlledTest ? "Allow audible playback for this synthetic test" : "I heard the test only in my headphones"}</label>
    {controlledTest && <p className="small">Lab audio may play to the room. This checks software playback; it does not certify a private headphone route.</p>}
    <label className="switch-label"><Switch checked={enabled} disabled={!confirmed || busy} onCheckedChange={toggle} />Enable {mode} cues</label>
    <p className="small" role="status">{status}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="small">{mode === "voice" ? "River voice · prerecorded reminders, ready before you speak." : "One tone: take a beat. Low tone: breathe. Falling / rising: slow down / speed up. Two equal tones: time. Three tones: mic level."} Output confirmation is yours; the app cannot guarantee private audibility.</p>
  </section>;
}
