"use client";
import { useEffect, useRef } from "react";
import { Camera, CameraOff, HeartPulse } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { PresageSnapshot } from "@/lib/presage/service";
import type { PhysioSource } from "@/lib/presage/types";

export function SourceBadge({ source, unavailable }: { source: PhysioSource | null; unavailable?: boolean }) {
  if (unavailable || !source)
    return <span className="physio-badge is-unavailable">Feature unavailable</span>;
  return source === "mock" ? (
    <span className="physio-badge is-mock">Mock data · not measured</span>
  ) : (
    <span className="physio-badge is-real">Real Presage data</span>
  );
}

/** Opt-in camera physiology: status, preview, calibration and a subtle live pulse readout. */
export function PresagePanel({
  snapshot,
  stream,
  enabled,
  capturing,
  bridgeStatus,
  onToggle,
  onRetry,
}: {
  snapshot: PresageSnapshot;
  stream: MediaStream | null;
  enabled: boolean;
  capturing: boolean;
  bridgeStatus: string;
  onToggle: (value: boolean) => void;
  onRetry: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  const live = snapshot.state === "calibrating" || snapshot.state === "ready";
  const pulse = snapshot.pulse;
  const showPulse = live && pulse?.valid && snapshot.quality === "good";
  return (
    <section className="presage-panel" aria-label="Camera physiology context">
      <div className="presage-head">
        <label className="switch-label">
          <Switch checked={enabled} onCheckedChange={onToggle} disabled={capturing && !enabled} />
          <span>
            <strong>Camera context</strong>
            <small>Pulse via Presage SmartSpectra · optional</small>
          </span>
        </label>
        {enabled && (snapshot.source || snapshot.state === "unavailable") && (
          <SourceBadge source={snapshot.source} unavailable={snapshot.state === "unavailable"} />
        )}
      </div>
      {!enabled && (
        <p className="small">
          Adds measured pulse context to your review, compared with your own pre-speech
          baseline. Wellness information only, not a diagnosis or emotion reading. {bridgeStatus}
        </p>
      )}
      {!enabled && snapshot.message !== "Camera context off" && (
        <p className="small" role="status">{snapshot.message}</p>
      )}
      {enabled && (
        <div className="presage-body">
          <div className={`presage-preview quality-${snapshot.quality}`}>
            {stream ? (
              <video ref={video} autoPlay muted playsInline aria-label="Camera preview" />
            ) : (
              <CameraOff aria-hidden="true" />
            )}
          </div>
          <div className="presage-status" role="status" aria-live="polite">
            <p className="presage-message">
              {snapshot.state === "unavailable" ? <CameraOff size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
              {snapshot.message}
            </p>
            {snapshot.state === "calibrating" && (
              <div className="presage-progress" aria-label="Calibration progress">
                <span style={{ width: `${Math.round(snapshot.calibration * 100)}%` }} />
              </div>
            )}
            {live && (
              <p className="small presage-readout">
                <HeartPulse size={14} aria-hidden="true" />
                {showPulse
                  ? `${Math.round(pulse!.bpm)} BPM · confidence ${Math.round(pulse!.confidence)}`
                  : pulse?.reason === "warmup" || !pulse
                    ? "Pulse appears after ~12 s of steady video"
                    : "Pulse held back: signal confidence too low"}
                {snapshot.fps > 0 && ` · ${snapshot.fps} fps`}
              </p>
            )}
            {live && !capturing && snapshot.state === "calibrating" && (
              <p className="small">You can start speaking any time; comparisons need the baseline to finish first.</p>
            )}
            {snapshot.state === "unavailable" && (
              <p className="small">
                Speech coaching still works without it.{" "}
                <button className="text-button" onClick={onRetry}>
                  Retry camera
                </button>
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
