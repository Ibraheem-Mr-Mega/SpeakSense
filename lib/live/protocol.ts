import type { Segment } from "./types.ts";
import type { Word } from "../speech/types.ts";
export function realtimeUrl(token: string) {
  return (
    "wss://api.elevenlabs.io/v1/speech-to-text/realtime?" +
    new URLSearchParams({
      token,
      model_id: "scribe_v2_realtime",
      audio_format: "pcm_16000",
      commit_strategy: "vad",
      vad_silence_threshold_secs: "0.5",
      include_timestamps: "true",
      include_language_detection: "true",
      no_verbatim: "false",
    })
  );
}
export function audioMessage(pcm: Int16Array, commit = false) {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  pcm.forEach((v, i) => view.setInt16(i * 2, v, true));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: btoa(binary),
    sample_rate: 16000,
    commit,
  });
}
export function parseSegment(
  data: Record<string, unknown>,
  receivedAt: number,
  audioSent: number,
  previous?: Segment,
): Segment | undefined {
  if (data.message_type !== "committed_transcript_with_timestamps") return;
  if (typeof data.text !== "string" || !data.text.trim()) return;
  if (!Array.isArray(data.words))
    throw new Error("Live word timing is missing.");
  const words: Word[] = [];
  let last = -1;
  for (const item of data.words) {
    const w = item as Word;
    if (
      typeof w.text !== "string" ||
      typeof w.type !== "string" ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.start < 0 ||
      w.end < w.start ||
      w.start < last ||
      w.end > audioSent + 0.35
    )
      throw new Error("Live word timing does not match captured audio.");
    words.push({ text: w.text, start: w.start, end: w.end, type: w.type });
    last = w.start;
  }
  if (!words.some((w) => w.type === "word"))
    throw new Error("Live transcript has no timed words.");
  const start = words[0].start,
    end = words.at(-1)!.end;
  if (previous && start < previous.end - 0.05) {
    if (
      data.text === previous.originalText &&
      Math.abs(end - previous.end) < 0.05
    )
      return;
    throw new Error(
      "Live segments overlap; speech cues paused to avoid incorrect evidence.",
    );
  }
  return {
    id: `segment-${start}-${end}`,
    text: data.text,
    originalText: data.text,
    words,
    start,
    end,
    receivedAt,
    language:
      typeof data.language_code === "string" ? data.language_code : "unknown",
  };
}
export function correctedSegment(segment: Segment, text: string): Segment {
  if (text.length > 4000)
    throw new Error("Keep each correction under 4,000 characters.");
  return {
    ...segment,
    text: text.trim(),
    corrected: text.trim() !== segment.originalText,
  };
}
export function segmentMetrics(segments: Segment[], duration: number) {
  const tokens = segments.flatMap((s) =>
    (s.corrected
      ? s.text.split(/\s+/).filter(Boolean)
      : s.words.filter((w) => w.type === "word").map((w) => w.text)
    )
      .filter((t) => /[\p{L}\p{N}]/u.test(t))
      .map((text) => ({ text, english: ["en", "eng"].includes(s.language) })),
  );
  const english =
    segments.length > 0 &&
    segments.every((s) => ["en", "eng"].includes(s.language));
  const filled = tokens.filter(
    (t) =>
      t.english &&
      /^(u+m+|u+h+|e+r+m*|h+m+|m+m+)$/i.test(
        t.text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""),
      ),
  ).length;
  return {
    words: tokens.length,
    wpm: duration > 0 ? (tokens.length / duration) * 60 : 0,
    fillers: english ? filled : null,
    corrected: segments.some((s) => s.corrected),
  };
}
