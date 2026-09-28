# Hosted Presage camera service — DigitalOcean

## Status

Prepared September 28, 2026. **Not deployed or activated.** The developer Mac uses Intel macOS, which cannot load Presage's native SDK. The browser can capture video on that Mac and supply frames to this separate Linux service. The existing main SpeakSense app continues running on the Mac; hosting the whole app is a separate deployment.

No DigitalOcean account or credits have been verified. No cloud resource or billable plan has been created. Actual Linux SDK initialization, account entitlement, sustained streaming and real camera readings remain unverified. Eight hosted-transport checks now pass locally (`pnpm test:camera:hosted`), using the real pinned WebSocket library with a simulated Presage SDK. They cover access controls, session limits, origin/token authentication, lossless frame bytes, capture timing, expiry and cleanup. They do not verify Linux runtime loading, actual Presage entitlement, or a real camera.

## 1. Claim the MLH offer

Start at [MLH's DigitalOcean partner page](https://www.mlh.com/partners/digitalocean) and use its [signup link](https://mlh.link/digitalocean-signup). MLH advertises **$200 credit**. Confirm the amount, expiry, eligibility, billing verification, and applicable products in your own DigitalOcean dashboard before deploying. Do not assume a generic signup promotion is the same offer or that credit has been applied merely because signup completed.

The alternative checked was [MLH's Vultr offer](https://www.mlh.com/partners/vultr): $100 with an event gift code from the MLH coach, without a credit card. The chosen target for this project is DigitalOcean.

## 2. Review the proposed service

- Repository: `Ibraheem-Mr-Mega/SpeakSense`, branch `main`.
- App specification: [`.do/presage.yaml`](../.do/presage.yaml).
- Build context: repository root `/`. Dockerfile: `native/presage/Dockerfile`.
- Runtime: Node 24 on Debian Bookworm (glibc 2.36), compatible with the documented Linux glibc 2.35+ requirement. SDK pinned to 3.3.0.
- Proposed initial size: **one dedicated CPU, 2 GiB RAM** (`apps-d-1vcpu-2gb`), currently **$39/month**, prorated by the second with a one-minute minimum. This is a starting size, not a measured performance guarantee. Review the live price before creating the service. [Current pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/).
- One instance only, no autoscaling, no database, no persistent disk, no GPU, no automatic deploy on push. Presage subscription/usage is separate from hosting credits.
- HTTPS and a default `ondigitalocean.app` address are supplied by App Platform; no purchased domain is needed. [Domain documentation](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/).
- Health path `/readyz`, port 8789. Readiness confirms SDK loading and configuration only, not key validity or successful measurement.

Do not choose a static site or serverless function: the native SDK requires a long-running Linux process. Keep the service to one instance because the session and SDK state reside in memory. A restart closes the active check.

## 3. Configure runtime secrets and deploy

In App Platform, connect only the intended GitHub repository and import the app spec or create a Docker web service using the settings above. Before starting deployment, fill these **runtime** environment values:

| Variable | Value |
| --- | --- |
| `CAMERA_HOSTED` | `true` |
| `PRESAGE_API_KEY` | The provided Presage key, stored as an encrypted secret |
| `CAMERA_ACCESS_KEY` | A separate random private access code of at least 32 characters, stored as an encrypted secret |
| `CAMERA_ALLOWED_ORIGINS` | Exact browser app origins, comma-separated; initially `http://localhost:5173,http://127.0.0.1:5173` |
| `CAMERA_MAX_SESSIONS_PER_HOUR` | `20` initially |

The app spec deliberately contains empty secret values. They must be replaced in the dashboard; otherwise startup/readiness fails safely. Both actual credentials are available in the developer's ignored `.dev.vars`, with owner-only file permissions. Neither is committed, included in the container, or printed in application logs. Never put either into a public build-time variable. DigitalOcean credentials are not yet available to this workspace.

For a newly generated camera code, use a cryptographically random value such as 32 random bytes encoded as base64url. The browser uses **only the camera access code**, never the Presage key.

Only exact origins are accepted: no wildcards, paths or trailing slash. For a future hosted frontend add its actual HTTPS origin. Changing the browser's port also requires adding that exact origin.

Use the generated HTTPS address after deployment becomes healthy. Restrict any extra DigitalOcean or proxy logging to metadata; do not enable request-body/frame capture. The source image does not contain local secrets or the microphone's ElevenLabs key.

## 4. Connect Chrome

1. Open the running SpeakSense app on the Intel Mac.
2. Expand **Camera service connection**, select **Use a hosted camera service**.
3. Enter the service's actual HTTPS origin and private camera access code. The fields remain only in tab memory and clear on reload.
4. Select **Preview camera**. Allow video permission. Preview stays in the tab and sends no frames.
5. Select **Check Presage connection** if needed, then **Start 45-second Presage check**.
6. Stay still and quiet, with your face and upper chest evenly lit. Stop closes capture and the remote session.

Starting measurement sends face/upper-chest frames to your DigitalOcean service. The app explains this before the start action. The SDK runs on that server and contacts Presage for account validation. SDK telemetry and accumulated output are off. SpeakSense does not write frames or readings to disk and does not attach camera readings to saved pitch reviews.

## Transport and access controls

- Browser to server: HTTPS for session creation; WSS for continuous frames. WebSocket compression is lossless, preserving color values. No JPEG/video lossy compression is used for pulse measurement.
- Each frame contains an 8-byte little-endian capture-time offset in seconds followed by RGBA bytes. The server maps capture time to its monotonic clock and rejects nonmonotonic, implausibly fast or excessively delayed frames. It does not substitute network arrival time for remote capture time.
- Chrome's frame callback avoids sending the same rendered frame repeatedly. Browser buffering is bounded; frames are skipped on backpressure. The server stops abandoned or delayed streams. At least 25 accepted frames per second and uninterrupted quality windows are still required before displaying readings.
- Raw 640×480 RGBA at 30 fps is about 295 Mbps before lossless compression. Compression helps, but real camera noise may compress poorly. A fast stable upload link is essential; ordinary mobile/hotspot connections may not sustain it. Sustained end-to-end performance must be measured before claiming this path works for a particular connection. A lower-bandwidth transport would need separate signal-quality validation.
- Exact Origin checks plus a private access code protect session creation. Random per-session tokens authenticate frame streams and Stop requests. Tokens are sent in headers or the first encrypted WebSocket message, never URL query strings.
- Sessions last at most 45 seconds; the server closes them after three seconds without accepted frames. Only one session runs at a time. Starts are limited per process/hour (including failed initialization attempts); this counter resets on restart and is not a billing cap.
- Public `/readyz` reports only a ready boolean. Native/provider errors are sanitized. No frames, credentials or metrics are logged by the application.

## Activation still required

Before calling this live: complete account signup and verify credit; deploy the Linux image; confirm readiness; confirm unauthorized starts fail; confirm Presage accepts the key and returns subscribed metrics; try a physical camera check in Chrome; confirm frame throughput, quiet windows, Stop, tab hiding and speech-start shutdown. These actions have not been performed for the hosted implementation.

Hosting credit is finite. Keep a billing alert, note the actual credit expiry, and destroy the service when no longer needed; merely closing the browser does not stop hosting charges.

## References

- [Presage Node SDK supported platforms and custom input](https://smartspectra.presagetech.com/docs/nodejs/)
- [DigitalOcean app spec](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
- [DigitalOcean Docker/monorepo deployment](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-monorepo/)
- [DigitalOcean's WebSocket example](https://github.com/digitalocean/sample-websocket)

## Short trial cleanup

For an approved brief trial, record the exact app ID and creation time before testing, use one instance, and destroy it immediately afterward or at the two-hour deadline, whichever comes first. If dashboard/API access is unavailable, do not create the service until a reliable deletion path exists.

To delete manually: **DigitalOcean → Apps → speaksense-camera → Settings → Destroy** (bottom of page), enter the exact app name, and confirm. Verify the app disappears from the Apps list. Deleting this cloud app does not delete the GitHub repository or local source. [Official deletion instructions](https://docs.digitalocean.com/products/app-platform/how-to/destroy-app/).
