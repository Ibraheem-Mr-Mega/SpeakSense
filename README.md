# SpeakSense · live speaking coach

SpeakSense gives sparse cues **during** a pitch in Practice and Live presentation, then explains the evidence in a correctable transcript, cue timeline and optional retry comparison.

## Start

Requires Node 22.13+ and the existing pnpm lockfile.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:5173. Add `ELEVENLABS_API_KEY` to ignored `.dev.vars` if not already configured, then restart. Credentials are not included in this repository. The browser receives a temporary single-use token, never the API key.

- `/`: microphone input, streaming Scribe v2 Realtime, Practice/Live presentation, live screen cues, optional spoken cues or tones, review/correction/retry/compare.
- `/lab`: explicitly labeled controlled synthetic audio, streamed in real time through the same browser audio processor and real provider. Uses credits; this is not a physical microphone test.
- `/lab/countdown`: 45-second synthetic stream with a repeated filler cluster during the final countdown; used to check that speech coaching continues after time reminders.
- `/review-demo`: preserved earlier after-speech recording and labeled sample review. This is not evidence of live processing.

Default duration: 60 seconds. Configurable range: 30–600 seconds. Two-hour sessions, camera, wearable pin and sensor integrations remain planned.

Supportive cues include Breathe, Take a beat, Slow down a little, Speed up a little and Speak up a little. Breathing can be requested; automatic cues require observable evidence. They do not diagnose anxiety or claim to treat panic. Input adapters feed a shared session/cue engine; `lib/live/cue-catalog.ts` supplies shared copy, tones, and prerecorded voice phrases for both modes. Audio is off until you select an output, play a test, confirm where you heard it, and enable cues. Time reminders at 20 and 10 seconds remaining have a separate visual area and do not consume the six-second speech cooldown; sessions of at least two minutes also get a one-minute reminder.

**[Voice setup and read-aloud test](docs/VOICE-CUE-TEST.md)** · **[Complete handoff and exact browser steps](docs/LIVE-HANDOFF.md)** · **[Current verification record](docs/LIVE-VERIFICATION.md)** · [Deployment](docs/DEPLOYMENT.md) · [Roadmap](docs/ROADMAP.md) · [Customer research](docs/SPEAKSENSE_CUSTOMER_AVATAR_RESEARCH.md)

Live speech and time cues have been observed in both modes with controlled streaming audio. Tests cover cue gating, streaming lifecycle, transcript validation/correction and audio-output safeguards. Actual microphones, natural-speech accuracy across accents, physical phone browsers and private earbud audibility need device testing. The app does not claim physiological, emotional, persuasion or funding outcomes.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm deploy:prepare
pnpm deploy:dry-run
```

The former Stage 1 verification is retained in `docs/VERIFICATION.md`; the latest live milestone supersedes its statements that live coaching is unimplemented. No cloud deployment or hosted key configuration is implied by local checks.
