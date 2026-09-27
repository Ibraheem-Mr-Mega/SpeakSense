# Browser acceptance test

Status: **not executed in the browser in this session**. Codex's browser tool repeatedly returned an admin-policy verification failure for localhost. It explicitly prohibited bypassing its security controls, so no alternate browser driver was used. Run this checklist in an allowed browser. HTTP and unit checks are recorded separately.

## Sample flow — no credentials

1. Start `pnpm dev`; open the printed localhost URL in current desktop Chrome/Edge or Safari. Confirm the SpeakSense practice screen appears without console errors.
2. Click **Explore a sample session**. Expect the amber **Sample session · synthetic voice** banner and **SYNTHETIC SAMPLE** recording badge. No microphone prompt and no request to ElevenLabs should occur.
3. Play Attempt 1: expect about **35.45 sec**, with audible “Um” at **0.45**, “Uh” at **11.92**, “Um” at **19.54**, and “uh” at **30.31 seconds**. The cadence is intentionally synthetic. The displayed whole-second labels are floored; playback uses full-precision timestamps with 0.25-second lead-in.
4. Expect **112 WPM**, **4 fillers**, **6.8 fillers/min**. Expand **How these numbers work**. Click each yellow filler or moment card; each clip should seek to its real moment and stop shortly after it. Use **Play full attempt** to remove the clip stop boundary.
5. Check transcript text and the evidence attached to every coaching suggestion. No anxiety, confidence, accent quality, or health judgment should appear.
6. Click **Load sample retry**. Expect a side-by-side comparison of **35.45 vs 26.97 sec**, **4 vs 1 fillers**, **6.8 vs 2.2 fillers/min**, **112 vs 142 WPM**, **66 vs 64 words**. Delta pace is **+31 WPM** after rounding the unrounded difference. Listen to both closings; the second actually asks for introductions.
7. Play one comparison audio and then the other. The first must pause. Open Attempt 1 and Attempt 2 tabs with keyboard arrows; no recording should be lost.
8. Click **My practice**; the sample must not become your recording. **Clear attempts** resets both sample and live session data.

## Real microphone and missing credential

1. Choose an exercise. Leave audience empty and click **Start recording**: expect an explanatory message and focus on the audience input.
2. Enter “Seed investors · earn a follow-up meeting.” Click **Start recording** and deny permission. Expect actionable site-settings guidance, no stuck timer, and a working retry button.
3. Allow permission in browser site settings and start again. Speak this natural test passage: “Um, we help small teams make decisions. Uh, our product keeps the next step visible. I like the way teams can review it. We need two teams to try it this week.” Include an intentional two-second pause between sentences.
4. Expect an explicit recording state, advancing elapsed countdown, and a changing signal meter when supported. In developer tools, verify **no `/api/transcribe` request happens during recording**.
5. Stop after 15–30 seconds. The browser microphone indicator must turn off. Play the captured audio; verify the spoken words were actually recorded. Download it if needed.
6. Without an API key, click **Send for transcription**. Expect an honest missing-key error and preserved audio playback. There must be no invented transcript or sample feedback attached to it.
7. Explore the sample, then return to **My practice**. Your own pending recording should still be there. Click **Record again** to discard only the latest take and record a replacement.
8. Start another recording and choose **Discard & start over**. Check microphone indicator stops and no attempt is created. Repeat cancellation while the permission prompt is pending; a late permission grant must immediately release the stream.
9. Record until 60 seconds. Expect automatic stop and a playable attempt around 60 seconds. Background the tab or lock the phone in a separate test; the app stops on visibility change, but OS behavior must be tested on actual devices.
10. Disconnect the mic during capture. Expect a preserved partial recording marked for review or an actionable recording error, never a fake successful transcript.

## Live Scribe and focused retry — credential required

1. Put the key in `.dev.vars`, restart, and confirm `/api/status` reports `transcriptionConfigured: true`. This reports configuration, not credit validity.
2. Record the filler test passage above. Click **Send for transcription**. Expect a visible **Sending to ElevenLabs…** state and one same-origin multipart POST; the API key must never appear in browser requests, JavaScript, or responses.
3. Play the result while reading the original transcript. Verify filler words weren't intentionally removed. Count the two deliberately spoken filled pauses and verify their returned timestamps against the sound; “like” must be a context check, not automatically a filler. Document any ASR omission rather than marking the count correct.
4. Inspect the response's word start/end times. Click at least three transcript words and all highlighted issues. Check alignment with the audio, including the last word. Reject implausible/absent timestamps; do not fabricate them.
5. Read the next-attempt goal; click **Try again with this goal**. The exercise/audience must remain unchanged. Retry the same message with one deliberate silent beat replacing a filled pause.
6. Transcribe the retry, open **Compare attempts**, and listen to both recordings. Verify counts/rates/durations and quoted openings/closings independently. Faster or slower must not be labeled universally better. No overall score should appear.
7. Simulate offline/timeout with browser developer tools while uploading. Expect an actionable error and audio retained for another send. **Stop waiting** must explain that the service may already have received the audio. Use an invalid host key to test rejection, then restore it.
8. Clear attempts and refresh: neither audio nor transcript should remain. Check Local Storage/IndexedDB: the app does not persist them. Clearing does not claim to erase provider-retained audio.

## Phone, accessibility, and deployment

- Repeat the core recording flow on **iPhone Safari** and **Android Chrome** using the deployed trusted HTTPS URL. Do not test the phone against plain LAN HTTP. Check codecs, playback seeking, short capture, auto-stop, orientation change, and permission denial.
- Check desktop at 1440×900 and phone at 390×844 and 320px wide. No horizontal overflow; readable controls; compare cards stack. At 200% text zoom, text/controls must not overlap.
- Keyboard only: Tab reaches the skip link, exercises, goal, recording controls, player, evidence buttons, tabs, and clear. Arrow keys change the radio group and tabs. Focus is visible; Enter/Space activate buttons.
- With VoiceOver/NVDA: check labels, permission/error announcements, phase changes, audio controls, and transcript buttons. Countdown should not chatter every tenth second (`role=timer` is not a live region).
- Use reduced-motion preference. The app must remain fully usable with animations disabled.
- Verify headers on the HTTPS origin, microphone permission scoped to self, and camera disabled. Protect the API with Cloudflare Access before adding a real transcription secret.

Record browser/OS versions, device, date, observed MIME type, pass/fail, and any ASR errors. These are acceptance steps, not claims of completed QA.

## Microphone input selection acceptance checks

1. Reload localhost (desktop) or the trusted HTTPS deployment (phone). Under the audience field, find **Microphone input**. It initially uses the system default and must not open a microphone permission prompt just by loading the page.
2. Click **Allow access & refresh microphones**. Grant permission; confirm available input names appear, camera is never requested, and the browser's microphone-use indicator ends after discovery. No recording or transcription should be created. If denied, verify the inline site-settings message and retry after allowing permission.
3. Choose a USB/headset input. Enter an audience, start recording, speak into that input, stop, and listen. Check the saved recording displays its actual microphone label. Repeat using the built-in mic. Phone/browser device lists may expose fewer choices than desktop; only claim tested routes.
4. Choose a removable mic, unplug it, and refresh. The selected input should be marked unavailable; starting must fail with an actionable error rather than secretly using another mic. Select the system default or another available input and retry. Unplug while recording and verify the interrupted take is playable.
5. Start the access check, cancel it while permission is pending, then grant permission if the prompt remains. Verify no recording appears and the late microphone stream closes. Recording/sample controls must stay unavailable while an active access check is pending. Discarding a take must also stop its microphone indicator.
6. Navigate the selector and refresh/cancel buttons with keyboard and a screen reader. Check labels, status/error announcements, focus indication, and a 320px-wide viewport. Change mic between attempts; the audience and exercise must remain fixed.

These checks require actual browser/device interaction. The automated adapter tests do not certify hardware routing. Two-hour sessions and live screen/audio coaching toggles are planned and must not be shown as passed acceptance checks.
