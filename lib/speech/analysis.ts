import type { Attempt, Evidence, Transcript, Word } from "./types.ts";
export const normalize = (text: string) =>
  text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const filledPause = /^(u+m+|u+h+|e+r+m*|h+m+|m+m+)$/i;
export function validateTranscript(
  input: unknown,
  duration: number,
): Transcript {
  const t = input as Transcript;
  if (
    !t ||
    typeof t.text !== "string" ||
    !Array.isArray(t.words) ||
    typeof t.language_code !== "string"
  )
    throw new Error(
      "The service returned an incomplete transcript. Please try again.",
    );
  let previous = -1;
  for (const w of t.words) {
    if (
      typeof w.text !== "string" ||
      typeof w.type !== "string" ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.start < 0 ||
      w.end < w.start ||
      w.start < previous ||
      w.end > duration + 0.35
    )
      throw new Error(
        "Word timing could not be verified against this recording. Please retry transcription.",
      );
    previous = w.start;
  }
  if (t.text.trim() && !t.words.some((w) => w.type === "word"))
    throw new Error(
      "The transcript has no word timestamps. Please retry transcription.",
    );
  return {
    text: t.text,
    words: t.words.map((w) => ({ ...w })),
    language_code: t.language_code,
  };
}
export function analyze(transcript: Transcript, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("A positive recording duration is required.");
  const words = transcript.words.filter(
    (w) => w.type === "word" && /[\p{L}\p{N}]/u.test(w.text),
  );
  const english = ["en", "eng"].includes(transcript.language_code);
  const fillers = english
    ? words.filter((w) => filledPause.test(normalize(w.text)))
    : [];
  // Context-dependent phrases are review candidates, never added to the measured filler count.
  const candidates: Evidence[] = [];
  if (english)
    words.forEach((w, i) => {
      if (normalize(w.text) === "like") candidates.push(w);
      if (
        normalize(w.text) === "you" &&
        normalize(words[i + 1]?.text || "") === "know" &&
        words[i + 1].start - w.end < 0.8
      )
        candidates.push({
          text: w.text + " " + words[i + 1].text,
          start: w.start,
          end: words[i + 1].end,
        });
    });
  const gaps: Evidence[] = [];
  words.slice(1).forEach((w, i) => {
    const before = words[i];
    const gap = w.start - before.end;
    if (
      gap >= 1 &&
      !transcript.words.some(
        (e) =>
          e.type === "audio_event" && e.start < w.start && e.end > before.end,
      )
    )
      gaps.push({
        text: `${gap.toFixed(1)}s between “${before.text}” and “${w.text}”`,
        start: before.end,
        end: w.start,
      });
  });
  return {
    words,
    wordCount: words.length,
    duration,
    wpm: (words.length / duration) * 60,
    english,
    fillers,
    fillerRate: (fillers.length / duration) * 60,
    candidates,
    gaps,
  };
}
export function excerpt(
  words: Word[],
  from = 0,
  count = 16,
): Evidence | undefined {
  const part = words.slice(from, from + count);
  if (!part.length) return;
  return {
    text: part.map((w) => w.text).join(" "),
    start: part[0].start,
    end: part[part.length - 1].end,
  };
}
export function coach(attempt: Attempt) {
  if (!attempt.transcript) throw new Error("Coaching requires a transcript.");
  const m = analyze(attempt.transcript, attempt.duration);
  const opening = excerpt(m.words);
  const closing = excerpt(m.words, Math.max(0, m.words.length - 18), 18);
  if (m.wordCount < 8)
    return {
      strength: "You captured a starting point.",
      strengthEvidence: opening,
      improvements: [
        {
          title: "Give yourself more to work with",
          body: "Record at least a few complete sentences before interpreting pace or message structure.",
          evidence: opening,
        },
        {
          title: "Build one simple thought",
          body: "Name your point, give one reason it matters, and say what you want the audience to do.",
          evidence: closing,
        },
      ],
      goal: "Deliver one complete point and a next step in your next recording.",
      goalKind: "message" as const,
    };
  const explicitAsk =
    m.english &&
    /\b(we (?:are asking|ask|need)|i (?:am asking|ask|need)|please|join us|schedule|book a|would you|will you)\b/i.test(
      closing?.text || "",
    );
  const introducesWork = m.english && /\bwe help\b/i.test(opening?.text || "");
  const strength = explicitAsk
    ? "Your closing includes request language you can build a next step around."
    : introducesWork
      ? "Your opening introduces what you do with “we help …”. That gives the audience a starting point."
      : `You put ${m.wordCount} words into a recorded draft you can now refine.`;
  const improvements: { title: string; body: string; evidence?: Evidence }[] =
    [];
  if (m.fillers.length)
    improvements.push({
      title: "Make room for a deliberate pause",
      body: `The transcript contains ${m.fillers.length} filled ${m.fillers.length === 1 ? "pause" : "pauses"}. Listen to this moment; try a short silent beat before your next phrase. Fillers are a natural part of speech.`,
      evidence: m.fillers[0],
    });
  else
    improvements.push({
      title: "Listen to the opening as your audience",
      body: `For “${attempt.audience}”, check whether your opening names the idea and why it matters. This is a listening prompt, not a judgment of clarity.`,
      evidence: opening,
    });
  const closingAdvice =
    attempt.exercise === "keynote"
      ? "Use your final line to connect the opening to the idea your audience will hear next."
      : "Make the action, who should take it, and the next step concrete.";
  improvements.push({
    title: explicitAsk
      ? "Make the request easy to act on"
      : "Review the closing",
    body: explicitAsk
      ? `There is need or request language here. ${closingAdvice}`
      : `Listen for an explicit next step in this closing. ${closingAdvice}`,
    evidence: closing,
  });
  if (m.gaps.length)
    improvements.push({
      title: "Check the space between ideas",
      body: "This gap between recognized words lasts at least one second. It may be intentional or a transcription omission; keep it if it helps the point land.",
      evidence: m.gaps[0],
    });
  return {
    strength,
    strengthEvidence: explicitAsk ? closing : opening,
    improvements,
    goal: m.fillers.length
      ? "Replace one filled pause with a short silent beat. Keep the same audience and message."
      : attempt.exercise === "keynote"
        ? "End your opening with one sentence that previews the central idea."
        : "End with one specific action you want this audience to take.",
    goalKind: m.fillers.length ? ("fillers" as const) : ("message" as const),
  };
}
export function compare(a: Attempt, b: Attempt) {
  if (
    a.kind !== b.kind ||
    a.exercise !== b.exercise ||
    a.audience !== b.audience ||
    !a.transcript ||
    !b.transcript
  )
    throw new Error(
      "Only analyzed attempts from the same source category, exercise, and audience can be compared.",
    );
  const first = analyze(a.transcript, a.duration),
    second = analyze(b.transcript, b.duration);
  return {
    first,
    second,
    wordChange: second.wordCount - first.wordCount,
    paceChange: second.wpm - first.wpm,
    fillerChange:
      first.english && second.english
        ? second.fillers.length - first.fillers.length
        : null,
    rateChange:
      first.english && second.english
        ? second.fillerRate - first.fillerRate
        : null,
  };
}
