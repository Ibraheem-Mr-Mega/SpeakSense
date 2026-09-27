# Verification record — September 26, 2026

## Completed

| Check                     | Result                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source/context inspection | Empty workspace mirror and AGENTS.md read before coding. `sources/` left untouched. No prior SpeakSense files or credentials were present.                                                                                                       |
| TypeScript                | `tsc --noEmit` passed.                                                                                                                                                                                                                           |
| Automated tests           | 26 passing Node tests across metrics, evidence, comparison isolation, recording lifecycle, and transcription adapter.                                                                                                                            |
| Production build          | Vinext/Vite Cloudflare Worker and client build passed. The framework emits an informational unknown route-classification marker for `/`; actual runtime returned HTTP 200.                                                                       |
| Production runtime        | Packaged Worker started under local workerd on `http://127.0.0.1:8787`. The page, `/api/status`, sample JSON, and WAVs returned expected content.                                                                                                |
| HTTP checks               | Same-origin missing-key upload → 503 with actionable error and no transcript; invalid duration/empty file → 400; wrong content type → 415; foreign origin → 403. Root privacy headers and API `Cache-Control: no-store` verified.                |
| Audio evidence            | Both WAV lengths agree with fixture timestamps at sample precision. Each marked filler interval contains voiced PCM data. Fixtures were generated from scripts that actually speak the fillers. This checks synthetic fixtures, not natural ASR. |
| Comparison                | 66→64 words, 4→1 filled pauses; exact duration-normalized rates and pace changes verified. Excerpts stay inside each recording. No sample/live or mismatched-context comparison is allowed.                                                      |
| HTTPS packaging           | `wrangler deploy --dry-run` passed: approximately 811 KiB Worker modules, 243 KiB compressed, plus client/sample assets. No cloud upload or deployment performed.                                                                                |
| Credential handling       | User supplied a server-only key in ignored `.dev.vars`; local service status confirms it is configured. No key value was printed or committed. `.dev.vars` and `.env.local` ignored by Git; blank `.env.example` included. API key stays inside the server provider adapter.                                                                 |

Capture tests use mocked browser media objects. They cover negotiated MP4, start/stop, idempotent stop, cancellation before permission resolves, discard, disconnected tracks, denial, insecure-origin rejection, decoding fallback, and the 60-second deadline. **They are not physical-microphone or browser UI tests.** Provider tests inspect the exact Scribe form/header and inject success, malformed timestamps, 401/403/402/429/500, and network failures. **They are not successful live ElevenLabs calls.**

## Issues found and fixed

- The framework's default multipart preflight limit was 1 MB and rejected the 1.56 MB fixture. Configured 10 MB and kept an independent streamed 10 MB check in the API route.
- The production asset service returns full WAV responses (HTTP 200) rather than byte ranges, while development supports ranges. Samples are now fetched completely and played through local Blob URLs, so timestamp seeks do not rely on server range support.
- The framework wildcard response-header rule did not cover `/`. Added an explicit root rule and verified microphone/camera, no-referrer, nosniff, and frame headers.
- The local Wrangler proxy returned a transient 503 when a malformed POST immediately reused a connection following a rejected-origin upload. The HTTP harness gives each negative POST its own connection (`Connection: close`); the individual application status checks passed. Hosted connection behavior still needs browser acceptance testing.

## Not verified / remaining gates

1. **Natural speech and physical microphone:** live API entitlement and synthetic-fixture recognition are now verified (see below). A real microphone recording, including selected-device routing, accent diversity, filler omissions, and timestamp accuracy on natural speech, still needs the browser checklist.
2. **Browser interactions and visuals:** the in-app Browser tool repeatedly refused inspection because its admin-enforced policy could not be verified. No alternate driver or security bypass was used. The user-facing localhost app can still be opened independently. UI clicks, playback seeking in an actual browser, physical recording, keyboard/screen-reader behavior, and responsive screenshots were not observed by the agent.
3. **Phone/OS behavior:** iPhone Safari and Android Chrome permission flows, device codecs, audio routing, background/lock interruption, and 200% zoom need the manual checklist.
4. **Cloud deployment:** prepared and dry-run packaged only. Cloudflare account authentication and the actual HTTPS deployment/Access setup remain host steps.
5. **Presage/hardware/Meta:** documentation-based roadmap only; no SDK/device/sensor/API integration has been represented as functioning. The production coach is deterministic.
6. **Optional WebMCP:** a feature-detected, read-only session-summary tool is implemented; validation in a supported browser context was unavailable. It never initiates recording or upload.

See [BROWSER-TESTING.md](BROWSER-TESTING.md) for precise browser steps, [DEPLOYMENT.md](DEPLOYMENT.md) for commands and credentials, and [ROADMAP.md](ROADMAP.md) for later stages. No pending gate is counted as a passed check.

## Microphone selection follow-up

Added input enumeration, a permission probe that never records/uploads, exact selected-device constraints, cleanup on cancellation/error/late grant, actual input label on the saved take, and independent device selection between retries. Six additional mocked tests cover selected input, no fallback, filtered discovery, enumeration failure cleanup, and a cancelled late permission grant, and immediate release during slow enumeration. Two-hour sessions and live screen/audio toggles are documented requirements for the next audio milestone, not implemented features.

## Live ElevenLabs verification after local key setup

Restarted the local app with the user-supplied ignored `.dev.vars` secret. `/api/status` returned HTTP 200 with `transcriptionConfigured: true` and `model: scribe_v2`; it returned no credential.

| Real API request | Result |
| --- | --- |
| 35.447-second synthetic starting fixture through the provider adapter | Scribe v2 succeeded; 66 recognized words and all 4 audible reference fillers retained. Word timestamps passed validation. Fillers began at 0.52, 12.02, 19.60, and 30.40 seconds. |
| 26.969-second synthetic retry through the running app's `/api/transcribe` route | HTTP 200, `Cache-Control: no-store`, provider ElevenLabs Scribe v2; 64 recognized words and the single audible reference filler retained at 12.32 seconds. Word timestamps passed validation. |

The subscription lookup returned 401, so account balance/tier were not verified; successful STT calls establish transcription access without requiring broader account-read permission. Two synthetic audio requests (about 62.4 seconds total) were sent and may consume credits. No natural human recording was sent, no browser UI/physical microphone success is implied, and no sample result was added to a user's live session. The prebuilt demo remains labeled synthetic and uses its original construction timestamps. The saved key is local only; a hosted deployment still requires its own server secret and access controls.
