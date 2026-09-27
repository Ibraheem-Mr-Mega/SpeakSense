# SpeakSense — project context

AI communication coach for students, job seekers, early-career professionals and founders.
Core loop: **Perform → Sense → Understand → Retry → Compare**. People often know what they want
to say; pressure changes how they say it. SpeakSense shows those changes with evidence.

## Architecture

| Layer | What | Where |
|---|---|---|
| Web app | vinext (Next.js App Router on Vite), React 19, served by Cloudflare `workerd` (also in dev) | `app/`, `components/`, `lib/` |
| Speech | Browser mic → AudioWorklet PCM (16 kHz) → ElevenLabs Scribe v2 Realtime over WebSocket (temporary token from `/api/realtime-token`) | `lib/live/pcm-source.ts`, `lib/live/session.ts`, `lib/live/protocol.ts` |
| Live cues | Pace / fillers / volume / time cues from timestamped committed words | `lib/live/cues.ts`, `lib/live/cue-catalog.ts` |
| Review / retry / compare | Per-take transcript, cue timeline, corrections; compare last two practice takes | `components/live-review.tsx`, `components/live-studio.tsx` |
| **Camera physiology (Presage)** | Optional. Browser camera → localhost bridge → SmartSpectra Node SDK → pulse + validation back to the page | `presage-bridge/`, `lib/presage/`, `components/presage-*.tsx` |

State: attempts are `SessionResult[]` held in `LiveStudio` React state (this tab only; nothing
persisted). A take's word timestamps are seconds from the first captured PCM frame
(`LiveSession.started`, on `performance.now()`); the result carries that origin as `clockOrigin`.

## Presage integration

### Why a bridge

`@smartspectra/node-sdk` is a native runtime loaded through koffi FFI. It cannot run in the
browser or in the Cloudflare worker that serves SpeakSense. The official SDK supports a
headless Node path — `useCustomInput()` + `sendFrame()` — and its own Electron renderer ships
MediaStream frames as RGBA with epoch-µs timestamps to a Node process. The bridge does the same
over a localhost WebSocket, so the app did not have to become an Electron app.

```
Browser (SpeakSense page)                         presage-bridge (Node, 127.0.0.1:8790)
 getUserMedia(video) ─► canvas 640px RGBA ─ ws ─►  SmartSpectraSDK.useCustomInput()
 timestamps = (timeOrigin + performance.now())µs   sendFrame(..., kRGBA, timestampUs)
 PresageService ◄── validation / pulse / errors ──  on('validationStatus'|'metrics'|'error')
```

- The API key lives only in the bridge (read from `.dev.vars` or the environment).
- The bridge binds to 127.0.0.1 and only accepts WebSocket origins in `PRESAGE_ALLOWED_ORIGINS`.
- One SDK session at a time (native state is process-global). A new tab preempts the old one.
- The SDK computes metrics on-device and contacts Presage to authorize the key (and aggregate telemetry).

### Files

- `presage-bridge/server.mjs` — bridge process (SDK lifecycle, `/health`, `/presage` WebSocket, mock mode).
- `presage-bridge/protocol.mjs` — frame header, payload normalization, enum names, labelled mock generator (pure; tested).
- `lib/presage/service.ts` — `PresageService`: `start()`, `stop()`, `on('metric'|'validation'|'error'|'change')`,
  `attempt(origin, duration)`, `setBusy()`, `clearTakes()`. Owns camera, frame pump, sample buffer.
- `lib/presage/timeline.ts` — clock conversion, sample validity, per-take baseline, attempt slicing (pure; tested).
- `lib/presage/correlate.ts` — speech moments (pace shifts, filler clusters, long pauses), pulse context,
  summaries, take comparison (pure; tested).
- `components/presage-panel.tsx` — opt-in toggle, preview, signal state, calibration, subtle live BPM.
- `components/presage-review.tsx` — results: baseline, speaking pulse, coverage, pulse chart, correlated moments, comparison table.
- Touch points in existing code: `SessionResult.physiology`/`clockOrigin` (`lib/live/types.ts`, `lib/live/session.ts`),
  `LiveStudio` wiring, `LiveReview`/`LiveComparison` sections, `/api/status` returns `presageBridgeUrl`,
  `next.config.ts` Permissions-Policy now allows `camera=(self)`.

### Synchronization

Every frame is stamped with `round((performance.timeOrigin + performance.now()) * 1000)` µs, ratcheted
strictly monotonic. Presage sample/validation timestamps are converted back to the page clock and
re-based to the take's `clockOrigin`, so pulse samples and ASR word times share one session timeline
(t < 0 = before speech). If an SDK timestamp falls outside the range of sent frames, the sample uses
receipt time instead and the review's diagnostics count it.

### Metrics used

- **Pulse rate only** (`MetricType.PULSE_RATE = 15`). Presage: 12-second rolling average, 40–110 BPM range,
  confidence 0–100 (0 until the window fills).
- A sample counts as **valid** only if: ≥12 s after SDK start, inside 40–110 BPM, confidence ≥ 50,
  `stable`, and validation was `OK` for ≥ 75% of its 12-s window. (50 / 75% are SpeakSense thresholds.)
- **Validation codes** drive the live status ("Improve lighting", "Hold still", "Face the camera", …).
- **Baseline** = median of valid readings in the 45 s before speech starts, needing ≥3 readings over ≥4 s
  (≈17 s after the camera starts). Readings whose window overlaps an earlier take (+12 s) are excluded.
  If a retry starts before a fresh baseline exists, the previous take's baseline is reused and labelled "carried".
- "Above/below baseline" means ≥ 6 BPM difference (SpeakSense threshold).
- **Not used:** breathing rate (Presage: does not work while talking), HRV (needs a 60-s still window),
  expressions/emotion (out of scope; SpeakSense makes no emotional or stress claims).

### Data labelling

Every physiology message carries `source: "presage"` or `"mock"`. The UI shows **Real Presage data**,
**Mock data · not measured**, or **Feature unavailable**. Mock mode is off unless `--mock` /
`SMARTSPECTRA_MOCK=1`; its values are deterministic, not random, and never mixed with real data in comparisons.

## Environment variables

Put secrets in the ignored `.dev.vars` (see `.env.example` for names only).

| Name | Used by | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | worker | required for speech |
| `SMARTSPECTRA_API_KEY` | bridge | Presage key; never sent to the browser |
| `PRESAGE_BRIDGE_URL` | worker → browser | default `ws://127.0.0.1:8790/presage` |
| `PRESAGE_BRIDGE_PORT`, `PRESAGE_ALLOWED_ORIGINS` | bridge | defaults 8790 and `http://localhost:5173,http://127.0.0.1:5173` |
| `SMARTSPECTRA_MOCK` | bridge | `1` = labelled mock values |

## Run

```sh
pnpm install --frozen-lockfile
pnpm presage:install        # one-time: SDK + ws into presage-bridge/ (~400 MB of per-platform runtimes)
pnpm dev                    # terminal 1 → http://localhost:5173
pnpm presage:bridge         # terminal 2 (real Presage)   |  pnpm presage:mock  (labelled mock)
```

Open the page, turn on **Camera context**, allow the camera, sit still and quiet in even front light
until "Good signal · baseline ready" (~17 s), then **Start listening**. After Stop, the review shows the
physiology section; **Retry this pitch** then **Compare last two practices** shows the cross-take table.

Platforms for the SDK: macOS arm64, Windows x64, Linux x64/arm64 (glibc ≥ 2.35), Node ≥ 20.
Headless Linux (no desktop session) needs D-Bus + a Secret Service keyring:
`sudo apt install -y dbus-x11 gnome-keyring && eval "$(dbus-launch --sh-syntax)" && echo "" | gnome-keyring-daemon --unlock --components=secrets`.

## Status

Working (verified in a cloud sandbox with Chromium's fake camera):
- Bridge loads SmartSpectra SDK 3.3.0, reads the key from `.dev.vars`, starts a custom-input session and accepts frames.
- Browser → bridge frame pump at 30 fps (640×480 RGBA); origin check; one-session rule; reload and bridge-crash recovery.
- Error paths: bridge not running, SDK/auth failure, camera ended, page hidden, 3-minute idle auto-pause. Speech coaching continues in all cases.
- Full take → review → retry → compare flow with the labelled mock bridge (ElevenLabs stubbed in that harness only).
- 70 unit tests (13 for Presage), typecheck, lint (only pre-existing warnings).

Not yet verified: **real Presage pulse values**. The sandbox's network policy blocks
`*.physiology.presagetech.com`, so the SDK could not authorize (`Metrics authorization failed. Status code: 0`),
and the sandbox has no webcam. Verify on a laptop with a webcam (steps above).

Remaining issues / risks:
- Confirm on real hardware that SDK sample timestamps echo frame timestamps (diagnostics show a count if not).
- The 50-confidence and 6-BPM thresholds are SpeakSense choices, not Presage calibrations; tune against the model card.
- Talking moves the face; expect lower confidence during speech than during the baseline. The review reports coverage.
- The bridge is a local process: a deployed (HTTPS, remote) SpeakSense would need each user to run it, or a packaged Electron build.

## Recommended next step

Run the real bridge on a laptop with a webcam and do two practice takes. Check that pulse readings
arrive with confidence ≥ 50 during speech and that the diagnostics report zero receipt-timed readings.
Then tune `MIN_CONFIDENCE` / `PULSE_DELTA_BPM` from what you observe.
