import type { Cue } from "./types.ts";

/** Shared copy and audio vocabulary for every delivery channel and speaking mode. */
export const CUE_CATALOG: Record<Cue["type"], { message: string; help: string; tones: number[] }> = {
  time: { message: "Time remaining", help: "Bring your next point toward the close.", tones: [660, 660] },
  fillers: { message: "Take a beat", help: "Take a comfortable breath, then continue when you’re ready.", tones: [520] },
  pace: { message: "Slow down a little", help: "Let your next sentence settle. There’s no need to rush.", tones: [660, 440] },
  "pace-up": { message: "Speed up a little", help: "If it feels comfortable, move toward your next point.", tones: [440, 660] },
  volume: { message: "Speak up a little", help: "Your mic signal fell. Check your distance or project gently.", tones: [440, 440, 660] },
  breathe: { message: "Breathe", help: "Take a comfortable breath. Continue when you’re ready.", tones: [330] },
};

export const VOICE_PHRASES = {
  breathe: "Take a breath.", fillers: "Take a beat.", pace: "Slow down a little.",
  "pace-up": "Pick up the pace a little.", volume: "Speak up a little.",
  "time-60": "One minute left.", "time-20": "Twenty seconds left.", "time-10": "Ten seconds left.",
} as const;
export type VoiceKey = keyof typeof VOICE_PHRASES;
export const voiceKey = (cue: Pick<Cue, "type" | "timeRemaining">): VoiceKey =>
  cue.type === "time" ? `time-${cue.timeRemaining ?? 20}` : cue.type;
