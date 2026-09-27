# Voice cues and read-aloud test

Use the main app (`/`) for your microphone. `/lab` and `/lab/countdown` use synthetic audio; talking into a microphone there does not affect their cues.

## Enable spoken cues

1. Connect headphones and choose your microphone in the setup panel.
2. In **Audio cues**, keep **Voice** selected. Choose your named headphones or **Use system output** after choosing headphones in your device settings.
3. Choose a test prompt, adjust the volume, and click **Play voice test**.
4. Confirm that you heard the test only in your headphones, then turn on **Enable voice cues**. The badge should say **Voice on**.
5. Start Practice or Live presentation. Visual cues are controlled independently. **Mute cues** silences both channels while recording continues.

Voice is available but is not automatically enabled. Eight prerecorded phrases are bundled; playback during a take does not generate new speech through an API. Changing sound style or output requires another test. The browser cannot guarantee private audibility; system output can switch to speakers if headphones disconnect.

## Read aloud

Start a fresh take for each row. Enable review saving for Live presentation so you can inspect the transcript and cue timeline. Recognition can omit fillers; pace and volume cues require sustained evidence.

| Cue | Duration | Action |
|---|---:|---|
| Take a beat | 60 seconds | Within about 12 seconds, say: “Um, we help founders prepare their pitches. Uh, our coach offers a reminder while they speak. Um, they can adjust before the presentation ends.” Leave brief sentence breaks, then keep talking. Three recognized fillers must reach the committed transcript. |
| Breathe | 60 seconds | Say “I am starting my pitch now,” then press **Breathe · give me a moment** while listening. Capture and the countdown should continue. This is a requested cue, not panic detection. |
| Slow down a little | 90 seconds | Speak steadily for 15 seconds, then substantially faster for another 25 seconds, with short sentence breaks. Use the passage below. Two sustained window comparisons are needed. |
| Pick up the pace a little | 90 seconds | Reverse that pattern: speak briskly for 20–25 seconds, then slowly through at least 50 seconds. This cue requires the second half of the take and sufficient recognized words. |
| Speak up a little | 60 seconds | Speak clearly near the mic for 8–10 seconds. Keep speaking while moving farther from it or speaking more softly for 15–20 seconds. Automatic gain may prevent a measurable drop. It measures microphone level, not room audibility. |
| Time reminders | 60 seconds | Speak steadily. Expect “Twenty seconds left” at about 40 seconds and “Ten seconds left” at about 50 seconds. In a take of at least 120 seconds, there is also a one-minute reminder. |

Pace passage: “The founder explains the problem, names the customer, shows the product, describes the first results, explains the business model, and asks for the next meeting. Each point has a clear purpose. The audience can follow the story and decide what to discuss afterward.” Repeat as needed.

## Speech after a time reminder

Use a 60-second take. Speak steadily until the 20-second reminder appears at about 40 seconds. Immediately read the three-filler passage within roughly 8 seconds, pausing briefly at sentence boundaries, then continue. If recognition commits all three fillers promptly and no recent speech cue consumes the six-second cooldown, **Take a beat** should appear and play before the take ends. The countdown reminder stays in its own area. Repeat in both modes.

For repeatable synthetic input, use `/lab/countdown`, which defaults to 45 seconds. It repeats filler audio around 27–36 seconds, after the 20-second reminder at about 25 seconds. Enable Voice and the explicitly labeled synthetic-test playback permission. Inspect the transcript, cue delivery, audio status and timestamps afterward. This check uses the real transcription provider and may consume credits.

## Inspect the result

The timeline distinguishes shown, audio-only, muted, cooldown and stale cues. Audio diagnostics distinguish queued, started, failed, expired, cancelled and off. “Started” confirms a browser playback result, not sound reaching your ears. A time reminder never consumes the speech cooldown. Mute or Stop must interrupt current and queued prompts; unmuting must not replay old cues.

Automated session tests verify countdown/speech delivery in both modes. The final visual and physical-headphone checks remain manual: browser access was blocked by an unavailable policy check during the September 27 completion pass.
