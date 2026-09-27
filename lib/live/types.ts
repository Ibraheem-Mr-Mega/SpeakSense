import type { Word } from "../speech/types.ts";
import type { AttemptPhysiology } from "../presage/types.ts";
export type Mode = "practice" | "presentation";
export type Setup = {
  mode: Mode;
  audience: string;
  takeaway: string;
  points: string[];
  limit: number;
  save: boolean;
  continueOnFailure: boolean;
};
export type Segment = {
  id: string;
  text: string;
  originalText: string;
  words: Word[];
  start: number;
  end: number;
  receivedAt: number;
  language: string;
  corrected?: boolean;
};
export type Cue = {
  id: string;
  type: "time" | "fillers" | "pace" | "pace-up" | "volume" | "breathe";
  message: string;
  reason: string;
  at: number;
  evidenceStart: number;
  evidenceEnd: number;
  evidenceText: string;
  receivedAt?: number;
  renderedAt?: number;
  latencyMs?: number;
  delivery:
    | "pending"
    | "shown"
    | "audio-only"
    | "muted"
    | "cooldown"
    | "stale"
    | "stopped";
  audioAt?: number;
  audioSentAt?: number;
  timeRemaining?: 60 | 20 | 10;
  audioStatus?: "off" | "queued" | "started" | "cancelled" | "expired" | "failed";
  audioMode?: "tone" | "voice";
  audioDetail?: string;
  audioQueueMs?: number;
};
export type Diagnostic = { at: number; type: string; detail: string };
export type SessionResult = {
  id: string;
  setup: Setup;
  duration: number;
  audioUrl?: string;
  segments: Segment[];
  cues: Cue[];
  events: Diagnostic[];
  complete: boolean;
  microphone: string;
  source: "microphone" | "controlled";
  /** Speech time zero on the page's performance clock (seconds); word times are relative to it. */
  clockOrigin?: number;
  /** Optional camera physiology (Presage), on the same timeline as the words. */
  physiology?: AttemptPhysiology;
};
export type SessionState =
  | "idle"
  | "permission"
  | "connecting"
  | "listening"
  | "unavailable"
  | "stopping"
  | "done";
export const LIMIT_MAX = 600;
