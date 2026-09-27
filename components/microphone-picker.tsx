"use client";
import { useEffect, useRef, useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { listMicrophones, microphoneError } from "@/lib/speech/audio-source";

export function MicrophonePicker({
  value,
  onChange,
  disabled,
  onBusyChange,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [listed, setListed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (request.current) return;
      const token = ++sequence.current;
      try {
        const inputs = await listMicrophones();
        if (active && token === sequence.current) {
          setDevices(inputs);
          setListed(true);
        }
      } catch {
        /* The explicit refresh reports permission/support errors. */
      }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      active = false;
      sequence.current++;
      request.current?.abort();
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);

  async function discover() {
    if (disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    sequence.current++;
    setLoading(true);
    onBusyChange(true);
    setError("");
    setMessage("");
    try {
      const inputs = await listMicrophones(true, controller.signal);
      setDevices(inputs);
      setListed(true);
      setMessage(
        "Microphone list refreshed. The access check is finished; nothing was recorded.",
      );
    } catch (e) {
      if (!controller.signal.aborted) setError(microphoneError(e));
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setLoading(false);
        onBusyChange(false);
      }
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    onBusyChange(false);
    setMessage(
      "Access check cancelled. Dismiss any remaining browser prompt. Any late permission grant will be released without recording.",
    );
  }
  const missing =
    !!value && listed && !devices.some((d) => d.deviceId === value);
  return (
    <div className="microphone-picker">
      <label className="field-label" htmlFor="microphone">
        Microphone input
      </label>
      <NativeSelect
        id="microphone"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        aria-describedby="microphone-help"
      >
        <NativeSelectOption value="">
          System default microphone
        </NativeSelectOption>
        {missing && (
          <NativeSelectOption value={value}>
            Selected microphone unavailable
          </NativeSelectOption>
        )}
        {devices.map((device, i) => (
          <NativeSelectOption key={device.deviceId} value={device.deviceId}>
            {device.label || `Microphone ${i + 1} (name hidden)`}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p id="microphone-help" className="small">
        Choose an input before each take. Allow access & refresh briefly opens
        your microphone to reveal device names; it does not record or send
        audio.
      </p>
      {loading ? (
        <button className="text-button" onClick={cancel}>
          Cancel microphone access check
        </button>
      ) : (
        <button className="text-button" disabled={disabled} onClick={discover}>
          Allow access & refresh microphones
        </button>
      )}
      {missing && (
        <p role="status" className="small">
          Reconnect your selected microphone or choose another input. Recording
          will not silently switch inputs.
        </p>
      )}
      {loading && (
        <p role="status" className="small">
          Waiting for microphone access…
        </p>
      )}
      {message && (
        <p role="status" className="small">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
