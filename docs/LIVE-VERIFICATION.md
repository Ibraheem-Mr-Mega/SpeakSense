# Live verification — September 27, 2026

Tests used localhost and the saved server-side ElevenLabs key. A labeled synthetic audio fixture was clocked through the browser AudioWorklet in real time. Actual Scribe Realtime responses drove cues; no batch transcript or prerecorded cue animation was substituted.

## Voice/countdown completion pass — September 27, 2026

- **57 automated tests pass**, including new session-level checks that both Practice and Live presentation dispatch speech guidance after the 20-second reminder and continue streaming.
- TypeScript passes. Full-project ESLint passes with four existing warnings (effect cleanup references and a test expression), zero errors. Generated build output is excluded from linting.
- Production build and deployment preparation pass, including eight voice clips, the countdown sample, and the audio worklet. No website deployment was requested or performed.
- `/lab/countdown` now defaults to the fixture’s 45-second duration. The fixture generator reproduces the repeated filler segment.
- The previous interrupted session recorded successful browser playback starts for “Take a breath” and “Slow down a little.” This completion pass could not independently repeat the browser flow: the browser’s admin policy check was unavailable and denied localhost access. No alternate browser route was used to bypass it. Final browser countdown/voice integration, updated responsive layout, and physical headphones remain unverified.
- [Read-aloud and output test](VOICE-CUE-TEST.md) supplies exact checks for both modes. Automated audio tests use a simulated audio element; they do not establish physical audibility or provider recognition quality.

The records below belong to the earlier tone-only milestone. Its 12-second spacing and time-cue schedule were subsequently replaced by six-second speech spacing and independent 60/20/10-second milestones. Its measurements do not verify the new iteration.

## Earlier browser results (before the voice/countdown iteration)

| Check | Result |
|---|---|
| Practice, 45 seconds | Filler cue at about 9 seconds, time cue at 30 seconds, 45 seconds captured, 92 recognized words, 3 fillers. Measured speech-cue latency **2.79 s**. |
| Live presentation, saved review, 390 × 844 viewport | Both cues appeared while listening. 45 seconds captured; measured speech-cue latency **2.90 s**. |
| Earlier complete runs | Practice **2.78 s**, Live presentation **2.84 s**. Presentation stayed connected through mute/unmute and stopped on demand. |
| Incremental processing | Practice diagnostics: **9.30 s** audio sent at filler trigger, **30.10 s** at time trigger, preceding final **45.00 s** capture. |
| Correction | Removing first “Um” changed 92→91 words, 3→2 fillers. Original cue evidence and segment bounds persisted. |
| Replay | Cue playback began near 29 s for the 30 s cue. Browser reported active playback and 45 s recording duration. |
| Retry / compare | Second 15 s practice retained pitch/time setup. Comparison displayed both recordings, openings, closings, durations and counts. |
| Mute | Streaming continued; filler timeline said “Not shown · muted.” Unmute did not replay it. Stop immediately displayed microphone off/finalizing. |
| Real connection loss | Lab closed its WebSocket. UI showed “Live coaching unavailable.” Local capture continued only with explicit opt-in; review showed incomplete transcript and persistent interruption notice. |
| No-save presentation | Short take ended with discard notice and no retained recording/review. |
| Breathing request | “Breathe” appeared during connected capture. Nearby filler cue was logged as cooldown-suppressed; time cue still appeared at 30 s. No fabricated speech latency for the requested cue. |
| Earbud gate | Audio remained disabled pending output selection/test/confirmation. No physical privacy confirmation was made. |
| Responsive | Desktop 1440 px, phone-sized 390 px, narrow 320 px: document fit viewport. Phone presentation exposed cue, mute and stop. |

Latency measures the last triggering word’s provider timestamp to browser render callback, not physical microphone-to-photon delay. Four small synthetic runs do not establish production latency or human speech accuracy.

## Automated checks

**52 tests pass**, covering existing recording/batch behavior plus the live microphone adapter, permission denial, late cancellation, immediate stop, no-save, transcript timing/corrections, mute/cooldown, both pace directions, breathing, sustained voiced-level drop, audio routing gates and PCM generation at 16/44.1/48 kHz. TypeScript and ESLint for the live implementation/tests pass. Production build and deployment preparation pass, including required worklet/audio assets.

HTTP smoke passes for current pages/assets, both model identifiers, foreign-origin rejection and legacy negative cases. It made no transcription request to the provider. The network sandbox initially blocked localhost; the authorized rerun passed. Vinext can reject foreign origins before handler headers execute.

Deployment dry-run passes: 42 client assets, 56 additional modules, 949.55 KiB total / 280.71 KiB gzip. No upload or deployment occurred. The initial dry-run encountered a sandbox log-path warning; rerunning with `WRANGLER_WRITE_LOGS=false WRANGLER_SEND_METRICS=false` completed without errors. Output: `artifacts/live-dry-run.log`.

Local evidence lives in ignored `artifacts/live-qa/`: `final-practice.json`, `phone-presentation.json`, `corrected-review.txt`, `comparison.txt`, `connection-loss.txt`, `no-save.txt`, `supportive-cues.json`, `breathe-live.png`, and phone screenshots. Speech is synthetic.

An early run stalled near 22 seconds and reported capture failure. Another development run was discarded following a reload/hydration mismatch during edits. Fresh navigation cleared it; complete runs followed. Neither interrupted run counts as successful acceptance.

Physical microphones, device permission dialogs, real phone browsers, private earbud routing/audibility, distraction, accents, and sustained 10-minute use remain unverified. New pace/volume rules have automated coverage but no human helpfulness validation. No anxiety/panic detection or anxiety-reduction efficacy is claimed.
