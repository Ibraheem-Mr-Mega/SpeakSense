# Current milestone order — September 27, 2026

The latest product direction is **useful cues while speaking in both Practice and Live presentation**. See [LIVE-HANDOFF.md](LIVE-HANDOFF.md) and [LIVE-VERIFICATION.md](LIVE-VERIFICATION.md) for current implementation and evidence.

1. **Live microphone:** implemented streaming input, sparse on-screen cues, mute/stop, correction, review, retry and comparison. Controlled live browser testing is the current evidence boundary; physical-device testing remains.
2. **Earbud prompts before camera:** optional named-output tone channel implemented behind an output test and user confirmation. Physical private routing and distraction remain unverified; no claim of universally private audio.
3. **Extended audio:** 30–600-second setup now available. Full two-hour sessions still require durable recording, recovery, provider-session rollover and extended device testing.
4. **Camera / Presage, then live-streaming pin, then optional sensors:** planned only. The detailed feasibility notes below remain reference material.

---

## Historical planning notes

The following was written for the earlier 60-second, after-speech prototype. Statements that all live cues are unimplemented are superseded by the current status above; later hardware feasibility remains a plan, not working functionality.

# SpeakSense: after Stage 1

Stage 1 is browser microphone practice. Everything below is **planned or evaluated, not implemented**. The shared contract is `AudioSource → Recording → timestamped Transcript → verified metrics → evidence-linked coaching → comparison`; a new capture adapter should preserve it.

## Next audio milestone — longer sessions and optional live feedback

**User requirements:** selectable session lengths from the existing one-minute exercise up to two hours, plus independently toggleable on-screen and audio feedback. These are planned extensions before camera/hardware work. The current build still auto-stops at 60 seconds, keeps audio in tab memory, accepts at most 65 seconds / 10 MB for transcription, and uses a synchronous provider timeout. No two-hour or realtime-coaching capability is claimed.

Long-session implementation should retain the short focused-retry exercise and add a separate presentation-session mode with presets (1, 5, 15, 30, 60, 120 minutes), custom duration, elapsed/remaining time, and an explicit stop. Before extending the cap:

1. Persist timestamped capture chunks to local durable storage with quota checks, bounded memory, recovery metadata, and a clear deletion policy. MediaRecorder chunks may depend on earlier container headers; validate final assembly and incremental playback per browser instead of treating every chunk as an independently playable file. Avoid decoding two hours of PCM into memory just to determine duration.
2. Use authenticated, resumable uploads to private object storage and a background transcription job with progress/cancellation. Verify current Scribe file/duration limits and account entitlement before selecting whole-file asynchronous processing or overlapped segments. Preserve original global timestamps, deduplicate overlap, and mark gaps. Never fit a two-hour file into the current single Worker upload.
3. Offer full-session metrics plus playable section-level evidence. Compare corresponding sections and duration-normalized rates; a focused retry need not repeat two hours. Show changes in microphone/source so recording conditions are visible.
4. Run actual two-hour endurance tests on desktop and supported phones: memory/storage, playback/seek to the final minute, transcript alignment, network interruption/retry, device unplug, background/lock, battery, and recovery. Current browser capture stops when hidden; don't promise mobile background recording. Evaluate native phone/desktop capture for reliable background sessions.

**Live feedback controls:** two independent toggles, **On-screen cues** and **Audio cues**, both off by default, allowing either, both, or neither. The timer and input-level meter currently work; they are not live speech coaching. Do not show nonfunctional toggles as available features.

Start with local time-budget cues; add speech cues only after evaluating a separate streaming STT adapter for latency, final-word stability, filler retention, and reconnect gaps. Explain when live audio is transmitted and obtain consent before streaming. Reuse the verified-event schema for screen, audio, and eventual pin haptics; label provisional data, retract corrected partials, and suppress stale or unsupported cues. Start with a user-selected goal and one cue at a time, a configurable cooldown, a pause/mute action, and accessible visible equivalents. Never infer anxiety or confidence.

Audio cues should have a preview and volume control and use short tones or brief spoken prompts. Respect browser playback activation requirements. Test headphones and output routing, duck/stop cues when appropriate, and prevent synthesized prompts from being counted as the speaker's words. Default to headphones for spoken cues; with speakers, disable speech prompts unless feedback leakage can be reliably excluded. Keep the final evidence-based review available even with both live toggles off. This is separate from the optional later pin vibration toggle.

## Stage 2 — camera delivery and a Presage evaluation

Start with opt-in video recording and synchronized playback. Offer observable delivery evidence (face out of frame, camera alignment, posture changes) with timestamps and user review. Don't convert facial expressions, eye contact, accent, or vocal patterns into confidence, anxiety, personality, or health judgments. Consent for video is separate from microphone consent; provide clear capture indicators and deletion controls.

**Current Presage feasibility, checked September 26, 2026:**

| Platform | Credible integration path                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser  | The documented SDK catalog lists native and Node integrations, not a standalone browser/WASM SDK. Treat pure-browser support as unproven. A consented frame stream to a native Node service using custom input is an engineering option, with added bandwidth/privacy/latency costs; it cannot run inside this Cloudflare Worker. This is an inference from the SDK architecture, not a vendor browser-support claim. |
| Desktop  | Reuse the UI in Electron with SmartSpectra's main/preload/renderer bridge. Current Node SDK docs list macOS Apple Silicon, Linux x64/ARM64 (glibc ≥2.35), and Windows x64. Confirm the specific SDK version, packaging, signing, licensing, and camera permissions on each target before committing.                                                                                                                  |
| Phone    | Native Swift (iOS 17+) and Kotlin (Android API 28+) are documented routes. A hybrid app needs a native plugin/bridge; mobile Safari is not equivalent to the Swift SDK. Share transcript/analysis schemas, while implementing native camera lifecycle and permissions.                                                                                                                                                |

Sources: [SDK platform catalog](https://smartspectra.presagetech.com/docs/), [Node/Electron architecture and platform support](https://smartspectra.presagetech.com/docs/nodejs/). Presage requires a developer API key or supported OAuth setup. No Presage key, SDK installation, or device validation was performed for Stage 1.

For trustworthy camera readings, evaluate a stable mount, one centered unobstructed face, visible chest when relevant, diffuse non-flickering lighting, sustained frame rate near 30 fps, and minimal movement. Respect each metric's confidence, stability flag, validation status, operating range, and full window: about 12 seconds for pulse, 30 for breathing, 60 for HRV. Poor conditions can still yield misleadingly high confidence. [Measurement setup and limitations](https://smartspectra.presagetech.com/docs/measurement-quality).

**Use quiet pre/post practice windows first.** Talking invalidates breathing/chest measurements; natural gestures and head motion undermine other readings. Suppress invalid readings during speech rather than presenting continuous “stress” feedback. Evaluate against reference sensors with consenting participants across skin tones, lighting, camera models, movement, and speaking styles; predefine acceptable error/availability and suppress output if those gates fail. Do not use camera-derived measurements to score a pitch or infer anxiety/health. This is a research gate, not a promised product capability.

## Stage 3 — live pin audio and discreet cues

Do not assume an **ESP32-S3 is a standard Bluetooth audio microphone**. Espressif documents BLE-only support, without Bluetooth Classic; its listed S3 stack also lacks BLE audio/ISO support. A BLE GATT peripheral does not automatically appear as an OS microphone. [Espressif S3 Bluetooth support](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-guides/ble/overview.html).

A practical first pin uses an I²S microphone, timestamped audio frames, a bounded ring buffer, and authenticated Wi-Fi transport to a phone/desktop bridge or gateway. Prototype PCM first (16 kHz × 16 bit mono ≈256 kbit/s before overhead); evaluate Opus encoding CPU, quality, battery, and latency before adopting it. Test packet loss, sequence gaps, clock drift, reconnection, battery drain, and noisy rooms. Mark missing intervals explicitly; never fabricate transcript continuity. Stage 1's batch Scribe adapter stays useful for finalized attempts; live coaching needs a separately evaluated realtime STT adapter with stable partial/final word semantics.

BLE can handle provisioning and tiny **haptic commands** even when audio uses Wi-Fi. Implement a small acknowledged protocol with session ID, sequence ID, cue type, expiration, and deduplication. Drive a vibration motor through a suitable driver/transistor, not directly from a GPIO. Let the wearer enable/disable cues, choose intensity, preview patterns, and enforce a cooldown/maximum cue rate. Start with a rehearsed time-budget cue; only later add verified speech-event cues. Never vibrate on speculative emotion or every filler.

A native phone bridge avoids relying on browser BLE support. Web Bluetooth has limited cross-browser availability and requires HTTPS and explicit device permission, so it is an optional desktop/Android path after testing, not the universal phone transport. [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API). If ordinary OS microphone behavior is required, evaluate a USB audio-class device or dedicated Bluetooth audio hardware and validate platform/profile support independently.

## Stage 4 — optional wearable biometrics

Add a separate `SensorSource` contract: timestamp, sensor identity, units, sampling interval, signal quality, and missing-data markers. Integrate a compatible BLE heart-rate sensor or vendor phone SDK with explicit consent and revocation. Treat Apple/Android health ecosystems as platform-specific permissioned integrations; verify actual API/device data availability before choosing hardware. Don't infer microphone or camera capabilities from a sensor's marketing label.

Align sensor and audio clocks, validate against a reference, document lag/artifacts, and show only quality-gated observations a user chooses to inspect. Motion-contaminated readings, incomplete windows, or incompatible devices should be unavailable rather than scored. Keep biometrics optional and separate from pitch-message coaching, with minimal retention and no health or psychological diagnosis.

## Optional Meta drafting

A future server-only Meta Model API adapter may draft wording from a constrained payload of verified metric values and transcript excerpt IDs. Require structured output referencing only supplied evidence IDs; validate numbers and quotes, reject unsupported claims, and fall back to the current deterministic coach. Keep transcript instructions untrusted and provider credentials server-side. Evaluate helpfulness and factuality before presenting this as working. Stage 1 makes no Meta API calls.
