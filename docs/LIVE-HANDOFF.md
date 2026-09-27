# SpeakSense live microphone milestone

Updated September 27, 2026. The current direction is **guidance while speaking**, in Practice and Live presentation. The previous after-speech prototype is preserved at `/review-demo`; its samples are not proof of live coaching.

## Run locally

From the `speaksense` directory, using Node 22.13+ (verified runtime: 24.19):

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:5173. Configure your own server-side key before starting a new checkout.

Required server variable in ignored `.dev.vars`:

```dotenv
ELEVENLABS_API_KEY=your_existing_key
```

No `NEXT_PUBLIC_` or `VITE_` secret, no Meta key, and no provider key in browser JavaScript. Restart after changing the secret. `POST /api/realtime-token` exchanges the server key for a single-use Realtime token. It is same-origin and uncached. The browser receives only that temporary token and streams directly to ElevenLabs. A token expires after 15 minutes if unused and is consumed on use; it is still a credential, so do not copy WebSocket URLs into public logs. [Token API](https://elevenlabs.io/docs/api-reference/tokens/create).

## What works

- Practice and Live presentation share the same capture, transcript and cue engine.
- Short, skippable audience/takeaway setup and two optional message points. Default 60 seconds; configurable **30–600 seconds**. This is not the planned two-hour recorder.
- Microphone choice, real 16 kHz PCM streaming in 100 ms frames, visible listening/connection state, instant cue mute, and immediate capture stop.
- On-screen cues: time remaining; a cluster of at least three recognized English filled pauses in 15 seconds; sustained pace increase relative to an earlier window within this take.
- Supportive cues reuse one catalog and engine: **Breathe** on request; a breath reminder with **Take a beat**; **Slow down a little** after sustained pace increase; **Speed up a little** after sustained relative slowing in the second half of a take; **Speak up a little** after a sustained voiced-microphone-level drop. No anxiety or panic is inferred. One pace direction per take prevents contradictory prompts. Mic gain/distance can affect level; room audibility is unknown.
- Partial text is displayed only as provisional. Speech cues use timestamped committed segments. Unsupported language, invalid timing, old evidence and stale cues suppress speech guidance. At least six seconds between eligible automatic speech cues; time reminders use independent milestones, no queue of stale cues on unmute.
- Post-take recording playback, timestamped words, segment corrections, cue history and at most two suggestions. Corrected text updates counts, but preserves the original segment boundaries; it does not receive invented per-word timings. Original cue evidence remains immutable.
- Practice retry retains audience, takeaway, message points and time limit. Comparison shows source text, recording playback, counts and pace without an overall grade.
- Live presentation does not keep a recording by default. It buffers transcript/cue information for the active session and discards it on stop; choose “Keep audio and transcript for review in this tab” before starting if a review is wanted.
- A separate optional **Voice / Tone** channel consumes the same cue events. Eight prerecorded River voice clips are bundled and loaded before a take. Audio is off until an output is selected, a test plays, the user confirms where it was heard, and audio is enabled. Named outputs and an explicitly selected system output are supported. Voice prompts play one at a time; stale queued prompts expire. Visual/audio channels are independent; Mute cues silences both. Device changes invalidate the output. The app cannot independently verify privacy or prevent every OS routing change. **Physical earbud routing, private audibility and distraction are not verified.**

## Exact microphone test

1. Open the app on desktop localhost, or a trusted HTTPS deployment on a phone. Keep it visible throughout the take; switching tabs, minimizing or locking may stop capture.
2. Choose **Practice**, optionally name the audience and takeaway, and keep the 60-second limit.
3. Click **Allow access & refresh microphones**, grant access, then choose the intended microphone. No capture starts merely by loading the page or refreshing the list.
4. Click **Start listening**. Expect permission/connecting, then **Listening · stream connected**. Audio is sent to ElevenLabs from that point onward. If denied, expect an actionable error and no recording; re-enable access in site settings before retrying.
5. To exercise the filler pattern deliberately, say the following with a brief pause at each period, within roughly 12 seconds: “Um, we help small teams. Uh, our product turns meeting notes into decisions. Um, each decision has a clear owner.” Continue speaking afterward. A **Take a beat** cue should appear only if Scribe retains the three fillers and commits them promptly. ASR may omit fillers; no cue is preferable to invented evidence.
6. At about 40 and 50 seconds in a 60-second take, expect 20- and 10-second reminders if not muted. They appear beside the countdown and never replace the speech-cue area or consume its cooldown. A one-minute reminder also applies to takes of at least 120 seconds.
7. Click **Mute cues**. Confirm the countdown and listening state continue. Click **Unmute cues**; old cues must not reappear. Use **Stop listening** to stop capture immediately. The page may spend up to 2.2 seconds settling already-sent transcript; it does not continue capturing during that wait.
8. Replay the audio and click word/segment timestamps. Compare the recognized fillers with the sound. Open **Correct text**, edit a segment, and save. Counts should update; original cue evidence and segment boundaries remain visible.
9. Click **Retry this pitch** and deliver the same message with one deliberate silent beat. Stop, then **Compare last two practices**. Verify the openings, closings, durations and metrics against both recordings. A lower filler count or faster pace is not labeled universally better.
10. Repeat in **Live presentation**. Turn review saving on for this test. The speech and time cues must still arrive while listening. Turn saving off for a separate short take: after Stop, that take should have no review/audio retained by this app.
11. **Clear sessions** removes the tab’s attempts and revokes its recording URLs. Refresh also discards them. This does not delete provider-held copies.
12. During a connected take, click **Breathe · give me a moment**. The reminder respects master mute. It replaces the current cue and restarts automatic cooldown, so a nearby automatic cue may be suppressed. It does not stop recording or diagnose panic. Pace/volume cues require sustained evidence and need not appear in every take.

## Reproducible controlled live check

Open http://localhost:5173/lab. This page is clearly labeled **controlled synthetic input**. It passes synthesized speech through the same browser AudioWorklet, clocks out 100 ms PCM frames, and uses a real Scribe Realtime connection. The local test audio is a fixture; cue events and transcripts are **not** fixtures and are produced by the actual stream. Loading a file or displaying the older sample review is not accepted as live evidence.

- Use a 45-second time limit. Start the controlled stream and keep the tab visible.
- Expect a filler-pattern cue around 9–10 seconds and time reminders at 25 and 35 seconds, while the countdown and real stream continue. Provider results can vary.
- The cue diagnostic records how many seconds of audio had been sent at the trigger. The cue must precede capture completion; future audio has not yet been sent when it triggers.
- Repeat in both modes. Enable review saving for Live presentation.
- For a real connection-loss check, enable **Keep local recording if live coaching fails**, start the controlled stream, and click **Disconnect stream (test)**. This closes the active WebSocket. Expect **Live coaching unavailable**, no further cues, and local recording only because you opted in. Stop afterward and verify the incomplete-transcript notice. With the option off, a connection failure stops capture.
- To test mute suppression, mute before the filler cluster, unmute after 15 seconds, and check the timeline. The filler event should be labeled muted; it must not be delivered late.

## Countdown regression check

Open `/lab/countdown`. It defaults to 45 seconds and repeats actual synthetic filler audio around 27–36 seconds. Choose Voice, select system output or a named device, play a test, allow audible playback for this synthetic test, and enable voice cues. Expect a 20-second reminder at about 25 seconds, possible recognized filler guidance during the remaining countdown, and a 10-second reminder at about 35 seconds. Recognition may omit fillers, so inspect committed text and the cue timeline rather than assuming a cue must occur.

Repeat in Practice and Live presentation, with review saving enabled for the presentation test. Both modes must keep streaming until Stop or the time limit. Audio status records queued, started, cancelled, expired, failed or off; “started” reports browser playback, not confirmed physical audibility. This browser check remains outstanding for the voice/countdown iteration because the browser policy check blocked localhost access on September 27.

## Optional earbud voice and tone test

1. Connect headphones. In **Audio cues**, select **Voice** or **Tone**. Choose a named output after refreshing devices, or **Use system output** after selecting headphones in the device’s sound settings.
2. Set the volume, choose a test phrase, and select **Play voice test** or **Play tone test**. Check where the sound is audible yourself. Confirm the headphone test only when it was private, then enable audio cues.
3. Voice plays short prerecorded phrases including “Take a beat,” “Take a breath,” and the time reminders. Tones remain available. Changing style or output requires another test and confirmation. Live voice cues do not make text-to-speech API requests.
4. Check visual-only, audio-only, both, master mute, Stop, and unplug/reconnect. A detected device change switches audio off. System output can move to speakers if the OS changes routing; the browser cannot guarantee privacy. Spoken audio leaking into the microphone can be transcribed as speech.
5. The app supports explicit system output when the browser cannot select a named device. Successful playback is not proof of private physical audibility. [Audio output routing](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId).

## Provider choice, cost and latency

The existing key successfully generated a Realtime token and opened a Scribe v2 Realtime session with `include_timestamps`, language detection and `no_verbatim=false`. Actual browser audio generated partial and committed transcript segments and live cues. No Meta calls are required or made; deterministic cue decisions avoid a generative model in the critical path. [Realtime API](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime) · [Event semantics](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/event-reference).

The public API pricing page lists **$0.39/hour** for Scribe v2 Realtime at this check. This is a public price, not a verified effective rate for your account. The restricted key’s earlier subscription lookup returned 401, so account tier, balance and billed cost are not known. Successful streaming confirms current access. Several minutes of controlled audio were sent during testing and may consume credits. [ElevenLabs API pricing](https://elevenlabs.io/pricing/api).

Latency is measured from the provider timestamp of the last triggering word to the browser’s cue-render callback. It includes capture, transport, recognition/commit, cue scheduling and UI work. It is timestamp-based measurement, not a physical microphone-to-photon measurement. The cue timeline exposes it for every shown speech cue. Initial complete controlled runs measured **2.78 s in Practice** and **2.84 s in Live presentation**. Additional final-run measurements are in `docs/LIVE-VERIFICATION.md`. These small synthetic runs do not estimate production tail latency or natural-speech recognition quality.

## Data handling and limits

- Recording is local tab memory when enabled, encoded as a 16 kHz WAV for replay. No durable database, recovery after refresh, or automatic server recording storage is implemented.
- Audio streams directly to ElevenLabs. Provider retention applies. This live integration does not request enterprise zero-retention mode; the existing `ELEVENLABS_ZERO_RETENTION` variable applies only to the older batch route.
- Standard English filler rules do not assess accent, emotion, health or confidence. Stable recognition is not guaranteed correct recognition.
- Required message points are a review checklist. Automatic content-absence cues are suppressed; deeper message reasoning and Meta drafting remain planned.
- Foreground use is required. Physical microphones, actual iPhone/Android browsers, system interruptions and earbud routing require device checks. Phone-sized desktop viewports are layout tests, not mobile-device certification.
- Two-hour sessions need durable/chunked storage, resumable processing, stream rollover and interruption testing. The current 10-minute input maximum is a bounded prototype; a full 10-minute physical-device run has not been certified.
- Camera/Presage, live-streaming wearable pin and connected biometrics are later stages. No camera or sensor is accessed.

## HTTPS demo preparation

```sh
pnpm test
pnpm typecheck
pnpm deploy:prepare
pnpm deploy:dry-run
```

The prepared target is the existing Cloudflare Worker plus client assets. See `docs/DEPLOYMENT.md`. No public deployment is implied. Before configuring a paid live key on a hosted origin, protect **both** `/api/realtime-token` and the older `/api/transcribe` with the documented access control. Same-origin checks are not authentication or a credit budget. Preserve the worklet and controlled sample assets in the build.

For your own Cloudflare account, the documented next commands are `pnpm exec wrangler login`, `pnpm deploy`, and then setting `ELEVENLABS_API_KEY` with Wrangler’s secret prompt after access protection. Use the actual HTTPS URL returned by deployment and repeat the microphone/device checklist there.
