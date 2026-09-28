# Presage camera integration

## Current status

The optional camera UI and native SmartSpectra adapter are implemented. The API key is configured only in ignored local `.dev.vars`. **Real measurement is not activated or verified on the development computer:** it is an Intel Mac (`darwin-x64`), which SmartSpectra Node SDK 3.3.0 does not support. Saving a key does not prove authentication, account entitlement, available credits, camera access, or valid measurements.

The main web app exposes a local camera preview and a 45-second quiet-check flow. It never requests the camera on page load. A separate native service must run on a supported computer or hosted Linux service to produce Presage readings. The hosted transport and DigitalOcean deployment configuration are prepared; no cloud service is active yet. See [HOSTED-CAMERA.md](HOSTED-CAMERA.md). The Cloudflare Worker cannot load the native SDK. An ordinary browser alone cannot produce Presage results.

## Run on a supported computer

Supported SDK targets: Apple Silicon macOS, Linux x64/ARM64 with glibc 2.35+, and Windows x64. Use Node 24 or later for the camera service. Intel macOS requires a supported Linux environment or another supported computer; no container runtime was available on the development machine and none was installed automatically.

1. Clone this repository and install the main app with `pnpm install --frozen-lockfile`.
2. Add your `PRESAGE_API_KEY` and the microphone's `ELEVENLABS_API_KEY` to ignored `.dev.vars` at the repository root. Never put a key in a `NEXT_PUBLIC_`/`VITE_` variable or tracked file.
3. Install the separately pinned native service:

   ```sh
   cd native/presage
   pnpm install --frozen-lockfile
   cd ../..
   pnpm camera:check
   ```

4. In one terminal, run `pnpm camera:service`. In another, run `pnpm dev`. Open `http://localhost:5173` or `http://127.0.0.1:5173` on that same computer.
5. In **A quiet camera check**, click **Preview camera** and allow camera access. Preview alone does not start Presage or transmit frames to the service.
6. Select **Start 45-second Presage check**. This starts the real SDK using the configured key and passes RGBA camera frames to its documented `useCustomInput` / `sendFrame` interface. If the key, subscription, runtime, or connection fails, the app shows an error and omits estimates.
7. Remain still and quiet, with one centered face and upper chest in even light. Use a stationary camera. Pulse needs at least 12 consecutive good seconds; breathing needs 30. The 45-second check allows time for initialization, but poor signal may mean no result.
8. Verify actual readings on supported hardware before describing this integration as activated. Empty metrics may indicate missing subscription access. `camera:check` checks configuration and SDK loading; only a successful measurement session checks Presage authentication and metrics access.

Local mode allows only the two local development origins. Hosted mode uses a separate access code, exact allowed origins, HTTPS/WebSockets, and one instance with one active measurement. Follow [HOSTED-CAMERA.md](HOSTED-CAMERA.md) before hosting; the configuration defaults do not permit arbitrary public origins.

## Data and lifecycle

- The browser requests video only, without microphone access. Capture requests 640×480 at 30 fps; accepted dimensions are bounded to 320×240–1280×720.
- Preview remains in the browser. Opting into measurement sends raw frames to a service bound to `127.0.0.1:8789` on the same machine. The native SDK computes metrics there and contacts Presage for authentication/account validation. In hosted mode, live frames are instead transmitted over an encrypted WebSocket to the configured Linux server. No LLM insight request is implemented.
- SDK telemetry and accumulated output are disabled. Frame buffers and readings are transient; the service does not write them to disk or log them. The UI clears values at Stop/completion and does not include camera data in saved pitch reviews.
- Each measurement has a random session token. The service requires an exact allowed Origin and session token, rejects oversized frames, permits one active measurement, and waits for native teardown before reuse. The provider key never appears in browser responses.
- Stop, tab hiding, navigation/unmount, camera disconnection, network failure, a pitch starting, or the 45-second limit closes capture. The service also tears down a session after three seconds without accepted frames. A delayed permission grant is stopped if its initiating operation was cancelled.

## Measurement policy

Requested metric codes are breathing rate (2), talking detection (13), and pulse rate (15), as documented by Presage. Facial-expression emotion labels, HRV, EDA, anxiety/confidence scores, and physiological speech cues are not implemented.

Numbers are omitted unless the SDK is running, validation is OK, talking detection is stable and says quiet, at least 25 accepted frames arrived in the last second, and a continuous quality window has elapsed. Samples must be stable, newer than three seconds, finite, positive, and have confidence of at least 70/100. The 70 threshold is a conservative application choice, not a clinical accuracy guarantee. Repeated old provider timestamps do not refresh a sample. Movement, talking, stale data, and frame gaps reset the window.

These camera estimates are optional wellness context. They do not diagnose anxiety or health conditions and do not score a pitch. Speaking invalidates this flow, so it stops when Practice or Live presentation starts. Synchronized recordings, comparison of camera sessions, and continuous physiological coaching during speech remain future work.

## Verification and remaining acceptance

- `pnpm test`: main app/unit checks, including camera quality gates and supported-platform detection.
- `pnpm test:camera`: local HTTP integration with a simulated native SDK; checks origin and token restrictions, bounds, exclusive sessions, teardown, error sanitization, quiet-window gating, and expiration. It does not open a camera or contact Presage.
- `pnpm typecheck`, `pnpm lint`, and `pnpm deploy:prepare`: frontend/static integration checks. Native dependencies remain outside the Worker build.
- `pnpm camera:check` on the development Mac correctly returns `available: false`, `configured: true`, `platform: darwin-x64`.
- Outstanding: SDK initialization/authentication on a supported host, actual account credit/metric entitlement, physical camera permissions, sustained frame throughput, quality estimates, and browser layout/lifecycle checks. Browser automation was unavailable because its security policy could not be verified; it was not bypassed.

## Primary references

Checked September 27, 2026:

- [Node SDK architecture and supported platforms](https://smartspectra.presagetech.com/docs/nodejs/)
- [Native lifecycle, frame input, error codes and configuration](https://smartspectra.presagetech.com/docs/nodejs/api-reference)
- [Metrics and subscription omissions](https://smartspectra.presagetech.com/docs/nodejs/metrics)
- [Measurement quality, talking and warm-up windows](https://smartspectra.presagetech.com/docs/measurement-quality)
- [Data types and metric codes](https://smartspectra.presagetech.com/docs/data-types)
- [Telemetry controls](https://smartspectra.presagetech.com/docs/telemetry-and-privacy)

Implementation inspected against the official npm package `@smartspectra/node-sdk@3.3.0`. No undocumented Presage REST endpoint is used.
