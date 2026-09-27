# Live milestone deployment update

The existing packaging workflow also includes `/api/realtime-token`, `/pcm-worklet.js`, `/lab`, and its controlled audio asset. Protect `/api/realtime-token` with the same access policy as `/api/transcribe` before adding a hosted ElevenLabs key. Realtime browser audio connects directly to `wss://api.elevenlabs.io`; any added CSP must allow that destination. No Meta or additional live environment variable is required. Follow [LIVE-HANDOFF.md](LIVE-HANDOFF.md) for current live browser acceptance steps.

# HTTPS deployment preparation

This project produces a Cloudflare Worker and static assets. **No cloud deployment was performed**; no hosting credentials were supplied. The local build and deploy dry-run are the preparation deliverable. Keep the session local until the browser checks and API entitlement check are done.

## 1. Build and package

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm deploy:prepare
pnpm deploy:dry-run
```

The preparation script sets the Worker name to `speaksense`, disables preview URLs and Worker observability, and preserves generated ESM modules plus `dist/client` assets. Deployment uses `dist/server/wrangler.json`; never deploy only `dist/client`, since that would remove the secret-backed API.

`artifacts/worker` contains the Wrangler dry-run package. Rebuild and rerun preparation after source edits. Keep `.dev.vars`, `.env*`, `.wrangler`, node_modules, and local recordings out of uploaded source archives. The committed samples are synthetic and intended for distribution.

## 2. Publish the credential-free pilot

Use your own Cloudflare account; choose another Worker name in `scripts/prepare-deployment.mjs` if `speaksense` already hosts unrelated work.

```sh
pnpm exec wrangler login
pnpm deploy
```

For CI, supply `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` through CI secrets instead of interactive login. The token needs Workers deployment permissions for the intended account. Wrangler returns the actual HTTPS workers.dev URL; no URL is assumed here. [Wrangler deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

Initially leave the ElevenLabs key unset. The sample and recorder work; sending a live recording returns the documented configuration error. This avoids exposing a paid transcription endpoint before access control is in place.

## 3. Protect the pilot, then add the key

1. In Cloudflare, select the deployed Worker → **Settings → Domains & Routes** and enable Cloudflare Access for its production workers.dev URL. Configure an allow policy limited to your HackGT team/testers. Keep preview URLs disabled, or separately protect any preview URLs you intentionally enable. Confirm an incognito visitor without access cannot call the app or API. [Protecting workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
2. Only after that check, add the transcription secret:

```sh
pnpm exec wrangler secret put ELEVENLABS_API_KEY --config dist/server/wrangler.json
# Optional, ONLY if your ElevenLabs plan supports enterprise zero retention:
pnpm exec wrangler secret put ELEVENLABS_ZERO_RETENTION --config dist/server/wrangler.json
```

Paste the secret in Wrangler's prompt, never in source or chat. Set the optional value to `true` only when supported. A normal HackGT plan should use the default provider retention behavior and the app's matching disclosure. [ElevenLabs STT parameters](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).

3. Set an ElevenLabs key usage/credit limit in its dashboard appropriate to the event. Same-origin checks and a 10 MB cap are input safeguards, **not authentication or a global spending limit**. This prototype has no account-level rate limiter. Do not run an unrestricted paid public endpoint without authentication, per-user quotas, rate limiting, and budget controls.

## 4. Verify the deployed result

- Open the **actual HTTPS URL returned by Wrangler** in a signed-in authorized browser. Confirm the browser trusts its certificate without a warning.
- `/api/status` should now show only `transcriptionConfigured: true` and `model: scribe_v2`; no secret. This is configuration evidence, not entitlement evidence.
- Follow [LIVE-HANDOFF.md](LIVE-HANDOFF.md) for both speaking modes, live cues, stop/mute and review. Repeat on a physical phone. [BROWSER-TESTING.md](BROWSER-TESTING.md) remains the older `/review-demo` checklist.
- Inspect a failed unauthorized request and confirm Access protects `/api/realtime-token` and `/api/transcribe` as well as `/`.
- Check `Cache-Control: no-store` on API results and the response headers for microphone/self, camera scoped to self and requested only by the optional Preview camera action, and no-referrer. No recorded audio should be placed in static assets, R2, D1, or logs by SpeakSense.
- Verify sample full-file loading and local blob seek playback (the production asset service may return HTTP 200 rather than byte ranges). Test both short and full 60-second attempts.

## Hosting boundaries

The app needs an HTTPS top-level origin or a host that explicitly permits microphone use. The current app sets `X-Frame-Options: DENY`; use a full browser tab rather than embedding it in a third-party iframe. The UI feature-detects microphone APIs and chooses a supported recording MIME at runtime; browser support does not prove OS/device permission will succeed. [getUserMedia secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [MediaRecorder MIME negotiation](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).

Cloudflare is the prepared target, not a requirement for later native apps. No native desktop installer, App Store binary, microphone background service, or hardware integration is included.
