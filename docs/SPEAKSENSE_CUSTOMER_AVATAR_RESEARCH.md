# SpeakSense: customer avatar, positioning, UX, and copy brief

**Research date:** September 26, 2026  
**Status:** Desk research and product hypotheses. No SpeakSense customer interviews, usage data, or willingness-to-pay tests have been completed.  
**Decision:** Design the first working product for an early-stage founder with a scheduled investor, accelerator, or demo-day pitch. Its defining interaction is **feedback while the person is speaking**. The first microphone prototype must detect a small number of useful signals and deliver a timely, unobtrusive cue during the take; the transcript, review, retry, and comparison deepen that live experience afterward. This is the strongest path for a **first launch and rapid learning**, not a proven claim about the largest market or highest long-term revenue. Keep aspiring executives as the next scenario, using the same live-coaching engine with a different content rubric.

## 1. Executive read

SpeakSense should first help a founder with an upcoming pitch **adjust while speaking**, using sparse cues that arrive early enough to affect the current take. A post-speech review should explain each cue with a source moment and support a focused retry. Y Combinator's pitch guidance emphasizes clarity, a concise explanation of what the company does, an audience-aware story, and repeated practice and critique; its guide also cautions that the goal of a demo-day pitch is usually to earn a follow-up conversation, not to close an investment on stage. [YC demo-day guide](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) A founder facing a real date has a more concrete job for a first prototype than the broad aspiration to become a better speaker. **Live feedback alone is not unique:** Microsoft Speaker Coach gives on-screen guidance during a rehearsal, Poised offers real-time meeting feedback, and Orai advertises live feedback alongside its 60-second pitch exercise. [Microsoft Speaker Coach](https://support.microsoft.com/en-us/powerpoint/rehearse-your-slide-show-with-speaker-coach) · [Poised](https://help.poised.com/en/articles/6050069-how-poised-works-in-meetings) · [Orai](https://orai.com/) The proposed angle is **timely, low-interruption coaching during a specific high-stakes pitch**, informed by the speaker's audience and goal, with evidence-linked review afterward. Whether that combination beats alternatives is a product hypothesis, not a proven market gap. The later executive mode should focus on the decision, trade-offs, risk, and requested action rather than founder-investor story elements. [Aspiring product leader discussion](https://www.reddit.com/r/ProductManagement/comments/1tuyycb/how_to_improve_executive_presence_and_speaking/)

## 2. Product facts from the SpeakSense conversation

These are **user-specified direction**, not findings from market research:

1. **First stage:** device microphone audio with **live feedback during the speech** as the essential behavior. A first complete flow uses a roughly 60-second pitch, streaming audio analysis, a small number of timely cues, then a transcript, moment-linked explanation, retry, and comparison. A take that only produces feedback after it ends does not meet the product vision.
2. **Second stage:** camera capture and Presage SmartSpectra integration where supported, to explore pulse, breathing, and related physiological signals while presenting. Camera is optional to the core audio experience.
3. **Third stage:** a separate wearable pin that **streams live audio** into SpeakSense. The user specified streaming, rather than local recording and later sync.
4. **Later stage:** connect smart devices or hardware sensors to access additional physiological measurements.
5. **Platform ambition:** web browser, desktop, and phone. Use one coherent product experience across them, while respecting platform-specific camera and sensor integrations.
6. **Initial audience direction:** pitch presenters and people aspiring to C-suite leadership who want to improve for keynotes and consequential moments.
7. **Available credits:** ElevenLabs credits and $50 in Meta Model API credits. Provider choice is an implementation decision and should be verified against current API capabilities and cost before use.

Presage documents camera-based pulse and breathing measurement, but its SDK notes that capture quality depends on lighting, movement, and framing, and that SDK metrics are for general wellness and information rather than diagnosis or treatment. Product copy must not translate physiological signals into a diagnosis of anxiety, confidence, or truthfulness. [Presage measurement quality](https://smartspectra.presagetech.com/docs/measurement-quality) The documented Node/Electron and native paths support a staged cross-platform strategy; do not assume the same SDK runs directly in an ordinary web page. [Presage Node/Electron SDK](https://smartspectra.presagetech.com/docs/nodejs) · [Presage C++ SDK](https://smartspectra.presagetech.com/docs/cpp/)

## 3. Research method and limits

This brief combines first-party product documentation, YC's practitioner guidance, a LinkedIn L&D survey, one controlled study of oral presentation feedback in medical students, peer-reviewed speech-recognition fairness research, and a small purposive scan of public founder and product-management discussions. Those discussions provide language and possible pain points, **not population prevalence**. Anonymous comments can be self-promotional or unverified. The controlled study supports the plausibility of feedback-assisted practice in its studied population; it does **not** prove SpeakSense will reduce pitch anxiety or improve investment outcomes. [Video-feedback study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4059172/) No market-size, conversion, retention, pricing, or clinical claim should be inferred from this desk research.

## 4. Segment choice

The following rankings are **strategy judgments for a first prototype**, not measured market scores.

| Candidate first user | Trigger and job | Fit to microphone-first prototype | Buying/distribution caveat | Decision |
| --- | --- | --- | --- | --- |
| **Early-stage founder with a pitch date** | Condense a company story for an investor, accelerator, or demo-day audience; adjust delivery while speaking and rehearse before a scheduled event. | **High.** A 60-second opening and live, observable cues create a bounded first test; review and retry show whether the cue helped. YC's guide explicitly recommends repetition, critique, and recording. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) | Individual demand may be episodic, and willingness to pay is unknown. Accelerator partnerships are a later channel hypothesis. | **Primary launch avatar.** |
| **Rising product or business leader pitching an internal decision** | Win approval, resources, or confidence from senior leadership. | Medium to high, but requires a different rubric around decision, trade-offs, risks, and business impact. A public discussion describes exactly this struggle. [Product-leader discussion](https://www.reddit.com/r/ProductManagement/comments/1tuyycb/how_to_improve_executive_presence_and_speaking/) | Employer reimbursement and L&D budgets exist as category behavior, but sales/procurement and confidentiality requirements are heavier. [LinkedIn Learning report](https://business.linkedin.com/learn/resources/workplace-learning-report) · [Yoodli team plans](https://yoodli.ai/pricing) | **Second scenario.** |
| **Established keynote speaker or C-suite executive** | Polish an important address and presence. | Lower for a 60-second audio-only first flow; likely expects human-level editorial feedback and video. | High trust threshold and hard to recruit early. | Later, after validated coaching quality. |
| **Student or hackathon presenter** | Prepare a competition/demo pitch. | High prototype fit and good pilot access. A first-pitch post shows an explicit deadline and time constraint. [Founder competition discussion](https://www.reddit.com/r/startups/comments/1e3x0k5/first_pitch_competition_advice/) | Student willingness to pay is unproven and may be low. | **Pilot/recruiting channel**, not assumed economic buyer. |
| **Enterprise L&D buyer** | Scale communication training across a team. | The microphone flow could contribute, but administration, reporting, privacy, and security are separate product requirements. Incumbents already provide team workflows. [Yoodli](https://yoodli.ai/pricing) · [VirtualSpeech](https://support.virtualspeech.com/Subscription%20Plans-a4f49dcd-282b-4f21-9238-d0f044389ed7) | Longer sales cycle and evidence burden. | Later buyer hypothesis. |

**Buyer decision:** Start with individual founders as users and potential direct buyers. Explore an accelerator or founder program as a distribution and group-purchase channel only after founders demonstrate repeated use and value. This keeps the first validation loop short. Do not imply founders or accelerators have agreed to pay.

**Confidence ledger:** High confidence that live feedback is a user-specified product requirement and must be demonstrated in the first prototype. Medium confidence that sparse live cues plus review and retry will be useful; cue timing and distraction need direct testing. Medium confidence that deadline-driven founders are the easiest first users to recruit and evaluate; that depends on the founder's actual access to them. Low confidence that this group will pay enough, return between events, or prefer SpeakSense to incumbents; those require direct tests.

## 5. Winning avatar: the deadline-driven founder

**Archetype, not a demographic stereotype:** A founder who knows the business deeply, has a consequential pitch in the next 7–30 days, and needs an unfamiliar listener to understand it quickly. They may be first-time or experienced, technical or nontechnical, native or nonnative English-speaking. The qualifying trait is the *job and date*, not age, gender, accent, or school.

| Dimension | Working avatar |
| --- | --- |
| Situation | Invited to a pitch competition, demo day, accelerator interview, or investor meeting. The allotted opening may be 60 seconds, 3 minutes, or 5 minutes; 60 seconds is the first rehearsal unit. |
| Functional goal | Make the audience grasp what the company does, for whom, why it matters now, what evidence supports it, and what conversation or action should follow. The exact elements depend on the venue and time limit. YC emphasizes stating what the company does early and avoiding jargon. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) |
| Emotional goal | Walk in feeling prepared and able to recover, without being made to feel personally deficient by an app. A founder described difficulty getting candid feedback from people already familiar with their business. [Founder feedback discussion](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) |
| Current workaround | Rehearse alone, record with a phone or Loom, time the pitch, ask a cofounder, friend, mentor, or founder group, and edit the deck or script. This is directly recommended in YC guidance and discussed by founders. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) · [Founder discussion](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) |
| Friction | They are too close to the material; polite or already-informed listeners may miss the clarity problem; feedback that arrives only after the take cannot help them recover mid-speech; a transcript or metric dashboard alone does not tell them what to change first. The live-feedback need is user-specified; a separate anonymous user questioned whether improving a speaking score improves communication. [Speaking-score skepticism](https://www.reddit.com/r/PublicSpeaking/comments/1vsd722/would_you_trust_an_ai_to_score_your_speaking_or/) |
| Sensitive moments | Hitting Record, hearing their own voice, seeing a flaw, uploading unreleased company details, and deciding whether to try again. A first-pitch competitor reported having a near-full 5-minute pitch and wanting better advice under a deadline. [Pitch competition discussion](https://www.reddit.com/r/startups/comments/1e3x0k5/first_pitch_competition_advice/) |
| Definition of success | Notices an appropriate cue during the first take, can act on it without losing the thread, and can identify what changed in the second take. A real human listener can summarize the company and next step without hints. This human comprehension test is a **proposed validation measure**, not something the app can claim to know from audio alone. |
| Purchase hypothesis | Might pay for a focused preparation period or pitch pack tied to an event, or receive access through a founder program. Test this; an indefinite monthly habit is not assured by a one-time pitch deadline. |

### Adoption and purchase map

| Moment | Likely founder thought | SpeakSense must demonstrate |
| --- | --- | --- |
| Trigger | “I have a date and a strict time limit; I need to make this understandable.” | Use the event and time limit in setup and example copy. |
| Search/alternative | “I could use my phone recorder, ask a mentor, join a practice group, or try Orai/Yoodli.” | Show a real live cue in context and its later explanation, then the retry comparison. Existing apps already provide pitch practice and some live feedback, so feature checklists alone are weak. [Orai](https://orai.com/) · [Yoodli](https://support.yoodli.ai/en/articles/9550465-practice-with-yoodli) |
| First-use objection | “I am too busy; will cues distract me or give me a generic score?” | Get to a rough take quickly, show how to mute live cues, emit only actionable signals, and avoid an unexplained grade. Distraction is a testable product risk, not a documented founder preference. [Speaking-score concern](https://www.reddit.com/r/PublicSpeaking/comments/1vsd722/would_you_trust_an_ai_to_score_your_speaking_or/) |
| Trust objection | “Can I share an unreleased pitch here, and will it understand my words?” | State the actual processing/retention policy, allow transcript correction, and show the source clip for every suggestion. Do not promise privacy controls before building them. |
| Value decision | “Was my second take meaningfully better for this audience?” | Compare changes the user can hear and read; invite a trusted human to check the intended takeaway. |
| Payment decision | “Is this worth paying for before this event?” | Test a concrete event-based offer and ask for a real payment action. No price or willingness-to-pay conclusion is yet supported. |

### Job story

> When I have a high-stakes pitch coming up, I want a quiet coach that can signal a useful adjustment while I am speaking, then show me exactly what happened so I can rehearse the next take with more control.

### Non-goals of this avatar

The app should not tell a founder whether a company is fundable, whether a market is real, or whether investors will invest. A founder pitch can be well delivered while the underlying business or investor fit remains weak; founders themselves distinguish those problems in the public discussion. [Founder feedback discussion](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) YC likewise frames a demo-day pitch as a way to earn follow-up interest, not a guaranteed financing result. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/)

## 6. Ranked customer and UX problems

**Severity, frequency, and confidence are qualitative research judgments.** “Frequency” here means repeated visibility in this small source scan, not a population estimate.

| Rank | User goal / surface | What breaks | Evidence | Severity · frequency · confidence | Product move |
| --- | --- | --- | --- | --- | --- |
| 1 | Explain the company to the intended audience | The opening hides what the company does, uses jargon, or delays the core point. | YC lists these as common pitch errors; founders discuss audiences failing to understand the company after rehearsal. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) · [Founder discussion](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) | High · repeated · high | Ask for audience, time limit, and desired takeaway; flag specific transcript spans where required context is absent or delayed. Offer one revision target. |
| 2 | Get candid, useful feedback | Friends are polite or already know the business; generic advice cannot be acted on. | A founder explicitly asks how to get feedback after unsuccessful VC pitches and says familiar listeners may be less useful. [Founder discussion](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) | High · observed · medium | Show exact moment, reason, and a rehearsal action. Permit a shareable clip or transcript for a trusted human reviewer later. |
| 3 | Improve the *message*, not a score | Filler and pace numbers can be optimized while the point remains unclear. | Orai, Microsoft, and Poised already cover delivery metrics; a public user voices concern about gaming scores. [Orai](https://orai.com/) · [Microsoft](https://support.microsoft.com/en-us/powerpoint/rehearse-your-slide-show-with-speaker-coach) · [Poised](https://poised.com/pricing) · [User concern](https://www.reddit.com/r/PublicSpeaking/comments/1vsd722/would_you_trust_an_ai_to_score_your_speaking_or/) | High · observed · medium | Put audience goal and message coverage above vanity scores. Use delivery metrics as supporting evidence only. |
| 4 | Rehearse under a deadline | A long setup and sprawling report delay the next practice attempt. | A founder pitch-competition post includes a near-term event, strict runtime, and feedback request. [Pitch competition discussion](https://www.reddit.com/r/startups/comments/1e3x0k5/first_pitch_competition_advice/) | Medium · observed · medium | A short setup, visible time limit, one primary action, and an immediate retry. |
| 5 | Practice without being judged | Self-review is uncomfortable; harsh scores can become discouraging. | Founder and product-leader discussions describe the difficulty of watching recordings and the need to separate performance critique from self-worth. [Founder discussion](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) · [Product-leader discussion](https://www.reddit.com/r/ProductManagement/comments/1tuyycb/how_to_improve_executive_presence_and_speaking/) | Medium · observed · medium | Coach behavior, not identity. Lead with one thing that worked and one change. Let users replay only the relevant clip. |
| 6 | Trust the transcript and keep data private | Recognition errors or unclear storage can undermine feedback, especially across accents and confidential pitches. | Peer-reviewed work has documented ASR error disparities across speaker groups; Yoodli's plan-specific training and retention disclosures show that data policy is a competitive issue. [PNAS study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7149386/) · [Yoodli pricing/data FAQ](https://yoodli.ai/pricing) | High · plausible · medium | Show/edit transcript, allow correction before analysis, label low-confidence sections, and explain storage, deletion, and third-party processing in plain language. Validate actual implementation before making privacy claims. |
| 7 | Use physiological cues constructively | A noisy camera measurement could be mistaken for a verdict about composure. | Presage says lighting, movement, and framing affect measurement quality and limits SDK use to wellness/information. [Presage](https://smartspectra.presagetech.com/docs/measurement-quality) | Medium · future · high | Make camera opt-in, show measurement quality, and present pulse/breathing trends only as optional context. Never score confidence or diagnose anxiety from vitals. |

**Cross-cutting live-feedback requirement:** A cue must arrive while the speaker can still act, appear at a useful boundary rather than over a sentence, and be easy to ignore or mute. The default should be sparse; measure distraction and false cues explicitly. Pace drift, time remaining, and repeated fillers are candidates for the first live loop. To test a more pitch-specific cue, let the user name one or two required message points before speaking, then consider a discreet checkpoint if a point still appears absent while enough time remains. Suppress that cue when transcription is uncertain; the system cannot know what a listener understood. This is a design hypothesis to test with speakers, not a finding from the desk research.

## 7. Positioning and the winning angle

### Proposed positioning

**Category:** live speaking coach for high-stakes pitches and presentations.  
**Who it is for first:** founders preparing for and delivering a scheduled pitch.  
**Core promise:** give a discreet, timely cue during the speech so the speaker can adjust while it still matters.  
**Mechanism:** stream microphone audio into a live cue engine during practice or a real presentation; begin with subtle on-screen cues, add private earbud audio prompts next, and use the transcript and cue history for review, retry, and comparison.  
**Proof the product can honestly show:** when a cue fired, what observable signal triggered it, and what changed next. Before/after clips, words spoken, timing, and pauses can support later review. These do not prove investor persuasion or actual audience understanding.

### Tagline and elevator pitch

**Tagline:** Guidance while you speak.

**Elevator pitch:** SpeakSense is a live speaking coach for high-stakes pitches. During practice and real presentations, it gives discreet cues while you speak so you can adjust your pace and delivery in the moment. Afterward, it shows what prompted each cue and lets you review and improve your next take.

**Short product line:** Get a cue. Adjust in the moment. Keep your message moving.

**Why this angle is worth testing:** a real date and room create a concrete workflow, and a useful cue can affect the current speech. YC guidance supports clarity and practice as core pitch work. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) However, Microsoft and Poised already provide live guidance, while Orai advertises live feedback; SpeakSense must prove that its cue timing, low-distraction design, and fit to the speaker's audience and goal are better for this use case. Calling the feature “live” is not a sufficient competitive claim. [Microsoft](https://support.microsoft.com/en-us/powerpoint/rehearse-your-slide-show-with-speaker-coach) · [Poised](https://help.poised.com/en/articles/6050069-how-poised-works-in-meetings) · [Orai](https://orai.com/)

### Message hierarchy for site and app

1. **Immediate relevance:** “Your investor pitch is in two weeks.” Adapt to the user's event; do not assume every user is fundraising.
2. **Live promise:** “Get a discreet cue while you are speaking.” Show a real product example, not a simulated UI pretending to be live.
3. **Choice of setting:** “Use it while practicing or during the real presentation.” Explain which cue channels each platform actually supports.
4. **Result:** “Adjust now; review the cue and its source moment later.”
5. **Trust and control:** “Mute cues, review the transcript, and control the recording.” Only show exact privacy/deletion claims after implementation.

### Angles to test, not claim as proven

| Angle | Testable headline | Why it might work | Risk |
| --- | --- | --- | --- |
| **Live adjustment** (recommended first) | “Get a discreet cue while you speak.” | Makes the defining interaction immediately understandable. | Live feedback is present in competing products; timing and usefulness must be demonstrated. [Microsoft](https://support.microsoft.com/en-us/powerpoint/rehearse-your-slide-show-with-speaker-coach) · [Poised](https://help.poised.com/en/articles/6050069-how-poised-works-in-meetings) |
| **Message clarity** | “Make your company understandable in the first minute.” | YC emphasizes explaining what the company does early. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) | An AI cannot verify actual human understanding on its own; deeper clarity suggestions may follow the speech. |
| **Specific feedback** | “See why you got each cue.” | Addresses vague advice and feedback overload. [Founder discussion](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) | Competitors also claim actionable feedback; must demonstrate quality. |
| **Calm preparation** | “Walk in having practiced the version you want to give.” | Connects to emotional stakes without overpromising confidence. | Can sound generic; does not explain mechanism. |
| **Physiology-aware** (later only) | “See how your breathing changed during rehearsal.” | Matches the user's Presage and sensor vision. [Presage](https://smartspectra.presagetech.com/docs/measurement-quality) | Quality, consent, platform fit, and medical-claim risk; weak first-launch message. |

## 8. Copy system Codex can use

Treat this as **draft copywriting**, to be tested with real founders. Use plain language and an encouraging, serious tone. Avoid gamified shame, “executive presence” stereotypes, false certainty, and claims that SpeakSense predicts investor decisions or reads emotions.

### Homepage, founder version

**Hero:** Guidance while you speak.  
**Subhead:** Get discreet, real-time cues during practice or a live pitch. Adjust in the moment, then review what happened and prepare your next take.  
**Primary CTA:** Start with live cues  
**Secondary CTA:** See a cue in action  
**Proof strip:** A cue now. A clear explanation afterward.  
**How it works:** (1) Choose practice or presentation mode. (2) Speak with subtle on-screen cues. (3) Review each cue and decide what to change next.  
**Trust line placeholder:** Explain recording storage, deletion, and third-party processing here after they are implemented and verified.

### Product microcopy

| Moment | Recommended copy |
| --- | --- |
| Mode choice | “Practice” / “Live presentation”. Both use live cues. Explain that a live presentation may include other people's voices and that the speaker should start and stop capture deliberately. |
| Audience setup | “Who will hear this pitch?” Options: investors, accelerator judges, prospective customers, other. |
| Goal setup | “What should they understand or do when you finish?” Free text with a short example. |
| Time limit | “How long will you have?” Start with 60 seconds; allow a custom limit when supported. |
| Cue controls | “Show subtle cues on screen” / “Mute cues”. When earbud prompts exist, offer separate controls for visual and private audio cues. |
| Microphone permission | “SpeakSense needs your microphone to listen and give cues while you speak.” Add accurate processing, saving, and provider details when implemented. |
| Before practice | “Give the version you would say in the room. Watch for a cue, or mute it whenever you like.” |
| Before live presentation | “Start when you are ready. Keep SpeakSense visible to see cues. Stop listening when your presentation ends.” |
| Live pace cue | “Ease your pace” — only after a sustained, reliable pace shift, not a single fast phrase. |
| Live transition cue | “Take a beat” — only at a natural boundary when a pause would help. |
| Live time cue | “20 seconds left” — time-based, no speech analysis needed. |
| Optional message checkpoint | “Remember your customer” — only if the user marked that point as essential, the stable transcript gives enough evidence it has not been said, and enough time remains. Never show on low-confidence recognition. |
| Cue delivery state | “Live cues unavailable; recording continues.” Show this when streaming/analysis fails, instead of pretending the coach is active. |
| Processing after speech | “Putting your cues and moments together…” |
| First review insight | “One thing that worked: you named the customer in the opening.” |
| Specific edit | “At 0:18, you explain the technology before saying who needs it. Try naming the customer first.” Display only when grounded in an accurate transcript. |
| Pace insight | “You sped up during the problem statement. Replay 0:22–0:34 and try a pause after the first sentence.” |
| Filler insight | “You used several fillers in the transition to your ask. Try a brief pause there.” Avoid criticizing ordinary conversational language without context. |
| Uncertain analysis | “We may have misheard this line. Check the transcript before using this suggestion.” |
| Retry CTA | “Try that change” |
| Comparison | “Your second take states who the product is for 14 seconds earlier.” Only use if the transcript supports it. |
| No clear change | “These takes differ, but we cannot tell whether the message improved. Listen to both openings or ask a trusted listener.” |
| Camera stage | “Add camera insights” with explicit opt-in and a measurement-quality explanation. |

### Language to avoid

- “Get funded,” “win the room,” or “guaranteed confidence.”
- “Your pitch is 92% persuasive” unless a validated measure actually exists.
- “Your heart rate proves you are nervous” or any diagnostic/psychological claim from a physiological signal.
- “Fix your accent.” Coach understandability in context and permit the user to correct recognition errors; do not equate accent with ability. ASR fairness research warrants care. [PNAS study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7149386/)
- A wall of metrics or negative adjectives such as “weak,” “bad,” or “unprofessional” directed at the person.

## 9. UX specification derived from the avatar

### Core journey

| Stage | User question | Screen behavior | Key success criterion |
| --- | --- | --- | --- |
| Arrive | “Will this help while I am speaking?” | Show a genuine example of a subtle live cue and its post-speech explanation. | User understands the live behavior in one glance. |
| Set context | “Does it know whom I am speaking to?” | Ask for audience, event, time limit, and intended takeaway in 3–4 lightweight prompts. Allow skip/edit. | Context captured without delaying recording. |
| Choose mode | “Am I practicing or presenting for real?” | Offer Practice and Live presentation using the same live cue engine. Show cue channel and capture state clearly. | User can begin the intended mode confidently. |
| Speak | “Can I stay focused while getting help?” | Clear mic state, countdown or start control, timer, discreet on-screen cue, mute/pause control, stop control, and connection status. | At least one valid cue appears during the take when an eligible signal occurs; the user can continue speaking. |
| Review | “Why did that cue appear?” | Cue timeline, evidence clip/transcript, one priority change, and separate delivery details. | User can understand the cue and name a concrete next action. |
| Retry | “Did the change help?” | One-tap replay and second recording against the same goal. | Second complete take. |
| Compare | “What changed?” | Side-by-side evidence: relevant text, timings, word count/pace, and short user reflection. Do not invent a composite success score. | User can judge the difference. |
| Prepare for room | “How will cues work at the event?” | Let the user choose visible on-screen cues; add private earbud audio as the next channel. Show a brief cue preview and mute control. | User knows what will appear and can stop it immediately. |

### Feedback architecture

1. Run one **live cue engine** in both Practice and Live presentation modes. The first cue channel is subtle on-screen text or iconography; private earbud audio follows directly after the on-screen experience is reliable, before the camera stage. Each channel needs independent mute and volume/intensity controls.
2. Start with signals that can be detected reliably during a speech: time remaining, sustained pace drift, and a repeated filler pattern on stable transcript segments. Add a user-defined message checkpoint only when the transcript is stable enough, the point's absence is reasonably supported, and time remains to act. Do not diagnose a person's state from one word, silence, or pulse. If a content cue arrives too late to help, place it in the after-speech review instead.
3. Rate-limit cues, avoid stacking them, and prefer sentence or transition boundaries. Test whether cues distract or help. Let the speaker mute them instantly while capture continues, or stop capture entirely.
4. Separate **observed fact** (“pace rose over the last 15 seconds”) from **interpretation** (“the audience may need more time here”) and **next action** (“ease your pace on the next sentence”). Review can explain why a live cue fired using the recording and transcript.
5. Prioritize the user's goal and audience. A 60-second pitch cannot be graded against every element of a 5-minute investor presentation. Make every content suggestion traceable to a transcript span or an explicitly missing element; show uncertainty when transcript quality is weak.
6. Use before/after comparison for actual changes. Avoid a universal “ideal” words-per-minute target; speaking rate depends on the audience, material, and context. Keep an optional human feedback path; YC recommends practicing with people who give candid feedback. [YC](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/)

### Accessibility and trust

Provide captions/transcript, keyboard controls, readable contrast, visible recording and streaming state, a way to mute cues without ending capture, and a non-camera route. On-screen cues must work without color alone; earbud prompts need a visual equivalent. Let users correct recognized words before content assessment. Test with different accents, dialects, speaking styles, noise conditions, and assistive technologies; the historical ASR disparity evidence makes this a product quality requirement rather than a cosmetic add-on. [PNAS study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7149386/) Explain where audio goes, which providers process it, retention period, and deletion controls in user-visible terms once implemented. Do not claim on-device or private processing merely because the microphone is on the user's device. Live presentation mode needs a conspicuous start/stop state and clear handling when other voices are captured.

## 10. MVP boundary and roadmap

### Stage 1: microphone-first prototype

**Must work end to end:** choose audience, goal, optional required message points, and Practice or Live presentation mode; capture microphone audio continuously; compute timely delivery signals while the speaker talks; show a subtle on-screen cue **before the speech ends** when a supported trigger occurs; allow instant cue mute and capture stop; retain cue timestamps; then produce a review with time-linked transcript, observable metrics, and grounded message suggestions. Test at least one user-defined message checkpoint if it can be made reliable enough to help mid-speech; otherwise label it experimental and keep deeper message feedback after the take. In Practice mode, support retry and comparison. In Live presentation mode, prioritize discreet cues and allow a post-presentation review when the user has chosen to save the session. Handle microphone denial, noisy/empty audio, streaming disconnection, transcription failure, and cue delay. A sample input may test the review screen, but a scripted after-the-fact cue must never be presented as a working live loop. The review must distinguish observed data from AI inference.

**Streaming implementation note:** ElevenLabs currently documents Scribe v2 Realtime for client-side microphone streaming, with partial transcripts during speech, committed transcript segments, optional word timestamps, and short-lived client tokens issued by a server. This is a feasible candidate for the first live loop, not a promise about end-to-end cue latency or cost. Verify current access and pricing with the user's credits; keep API secrets off the client. [ElevenLabs client-side streaming](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming) · [Realtime events](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/event-reference) · [Commit/timestamp guidance](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies)

**Live cue quality gate:** instrument audio-to-cue latency, trigger accuracy, cue frequency, mute use, and whether users could act without losing their place. Set the target from real rehearsal tests and report measured median and slow-case latency; do not equate a model's published transcription latency with full product latency. If streaming fails, clearly mark live coaching unavailable and keep recording only if the user chose that behavior.

**Build only if it improves the loop:** short suggested rehearsal cue, export/share for a trusted mentor, goal-specific content rubric. **Defer:** live audience simulation, pitch-deck grading, generalized persuasion scores, prediction of funding, and a dashboard of every possible metric. YC interview guidance also warns against treating a conversation as a memorized pitch; future Q&A practice should reward clear, direct answers rather than a rehearsed script. [YC interview tips](https://www.ycombinator.com/blog/tips-for-yc-interviews/)

### Stage 1b: private earbud prompts

Add private earbud audio prompts **directly after the on-screen live cues are reliable and before camera work**. Use the same cue events and user controls; test prompt length, timing, audibility, and distraction in both Practice and Live presentation modes. Keep on-screen cues available as an accessible alternative. Do not play prompts through a public speaker or interrupt the presenter's own audio. The exact earbud transport and supported devices are implementation questions to verify.

### Stage 2: camera and physiology

Add camera only after the live microphone loop is useful. Validate camera availability and SDK compatibility on web, desktop, and mobile separately. Use Presage readings only when measurement-quality signals are adequate, make them optional, and show them as trend context during practice or a real presentation, not a confidence or health diagnosis. [Presage measurement quality](https://smartspectra.presagetech.com/docs/measurement-quality) Test whether a physiological cue is timely, valid, and helpful before adding it to the live channel; otherwise reserve the reading for later review.

### Stage 3: live-streaming pin

Treat the pin as another live audio input to the same cue engine, usable in Practice and Live presentation modes. The user's intended behavior is **live audio streaming**, so test latency, connection loss, battery life, consent, and how to route prompts privately. A wearable should make the live experience easier in real settings, not require users to buy hardware before they can benefit. Avoid silently capturing other speakers.

### Stage 4: optional connected sensors

Add device/sensor integrations only with clear data provenance, consent, quality display, and a user benefit that is stronger than the camera's existing pulse/breathing context. Do not combine physiological streams into an unexplained “confidence score.”

### Executive scenario after founder validation

Reuse the live cue engine, review, retry, and comparison. Change setup to: **Who must decide? What decision or action do you need? What trade-off and evidence matter?** Live cues should remain sparse and grounded in reliable signals; deeper judgment on decision framing belongs in review unless it can be delivered early enough to help. The public product-management discussion points to decision framing and excessive context as a pain for aspiring leaders, but this mode requires its own user testing. [Product-leader discussion](https://www.reddit.com/r/ProductManagement/comments/1tuyycb/how_to_improve_executive_presence_and_speaking/)

## 11. Acquisition and business-model hypotheses

**Where to find first users:** founder communities, accelerator cohorts, campus entrepreneurship programs, pitch competitions, and the user's HackGT network. Ask organizers for permission to recruit; do not assume access to their participants. Offer a rapid rehearsal for an existing event. **What to demonstrate:** an actual cue while the person is speaking, the reason it appeared, and how the speaker adjusted; then a review or second take. A static report cannot demonstrate SpeakSense's defining behavior.

**Payment hypothesis A:** an individual pitch-prep pack for a defined preparation window. **Payment hypothesis B:** an accelerator or university entrepreneurship program buys cohort access. **Payment hypothesis C:** a professional-development reimbursement path for the later executive mode. Yoodli's reimbursement and team-plan language shows these are category patterns, not proof that SpeakSense can sell through them. [Yoodli pricing](https://yoodli.ai/pricing) LinkedIn's 2025 L&D report shows leadership development is an established organizational practice but also identifies time and resource constraints; it does not establish demand for this specific product. [LinkedIn report](https://business.linkedin.com/learn/resources/workplace-learning-report) Avoid selecting subscription pricing from competitor prices without direct tests, because event-driven founders may use the product in bursts.

## 12. Validation plan and decision rules

These are **proposed tests and provisional thresholds**, not research results.

1. **Problem interviews:** Recruit 12 founders with a real pitch within 30 days and 6 rising leaders with a real senior-leadership presentation. Ask about the last preparation attempt, whether they have used live feedback, which cues would help or distract in the actual room, where feedback came from, what changed, and what they spent. Avoid showing the product until after the story. Look for unprompted mention of clarity, timing, audience fit, and mid-speech adjustment.
2. **Artifact study:** Ask consenting participants for an existing pitch recording or have them give a fresh 60-second take. Ask a separate listener unfamiliar with the company to write what the company does, for whom, and what next step was requested. This gives a human comprehension benchmark the app cannot infer by itself.
3. **Live-cue prototype:** Run 5–8 founders through a genuinely streaming or human-operated live cue session. Record which cues appeared, when, whether they were noticed, whether the speaker adjusted, and whether any cue broke concentration. Compare with a session that gives feedback only afterward. Do not pass a replay animation off as real-time analysis.
4. **Usability test:** Five participants should complete setup, choose Practice or Live presentation, receive an eligible live cue, mute cues, finish, and understand the cue history without coaching. A provisional launch gate is that at least 4 of 5 complete the flow and can explain what one cue asked them to do. If they cannot, simplify the cue behavior before adding features.
5. **Feedback-quality test:** For 20 sessions, have an independent human coach or experienced pitch mentor label live cue triggers and review suggestions as supported, useful, distracting, or misleading. Set a provisional gate of **zero fabricated transcript claims** and at least 80% of top suggestions judged useful. Measure cue latency and false cues separately; review disagreements, especially across accents and audio quality.
6. **Positioning test:** Show the same working prototype behind three landing-page headlines: live adjustment, message clarity, and calm preparation. Measure qualified sign-ups or booked tests from people with an upcoming pitch, not raw clicks alone.
7. **Payment test:** After a useful session, ask for a concrete action—join a paid pilot, request an invoice, or place a refundable deposit—at a stated price. Record refusals and preferred payment structure. Do not treat a survey answer alone as willingness to pay.
8. **Broaden or pivot:** If founders find live cues distracting, mute them, or cannot act in time, fix cue timing and format before expanding hardware. If live cues help but founders rarely return or pay, test the internal-decision presenter with the same engine. If speakers use the cues and human listeners understand later takes better, deepen that wedge.

## 13. Source map

| Source | Used for | Limit |
| --- | --- | --- |
| [Y Combinator: demo-day presentations](https://www.ycombinator.com/blog/guide-to-demo-day-pitches/) | Founder pitch goals, clarity, practice, audience, common errors. | Practitioner guidance from 2016; not a controlled product study. |
| [Y Combinator: YC interviews](https://www.ycombinator.com/blog/tips-for-yc-interviews/) | Conversational Q&A versus a memorized speech. | Specific to YC interviews. |
| [r/startups: getting better at pitching](https://www.reddit.com/r/startups/comments/1mc165s/how_do_you_get_better_at_pitching_i_will_not/) | First-person question about candid feedback and rehearsal alternatives. | Anonymous, self-selected discussion; some comments promote products. |
| [r/startups: first pitch competition](https://www.reddit.com/r/startups/comments/1e3x0k5/first_pitch_competition_advice/) | Deadline, duration, and dissatisfaction with one AI feedback tool. | One founder's account; not a representative sample. |
| [r/ProductManagement: executive presence](https://www.reddit.com/r/ProductManagement/comments/1tuyycb/how_to_improve_executive_presence_and_speaking/) | Secondary avatar: decision, trade-off, and impact framing. | Anonymous, self-selected discussion. |
| [r/ProductManagement: leadership deck review](https://www.reddit.com/r/ProductManagement/comments/1rkpzxa/when_reviewing_a_deck_before_presenting_to/) | Senior-audience desire for takeaway, decision, and careful framing. | Anonymous, self-selected discussion. |
| [r/PublicSpeaking: speaking-score trust](https://www.reddit.com/r/PublicSpeaking/comments/1vsd722/would_you_trust_an_ai_to_score_your_speaking_or/) | Concern that a metric score can be gamed without better communication. | One account; comments include product promotion. |
| [Orai product page](https://orai.com/) | Existing 60-second pitch and delivery feedback. | Vendor description; check live product in competitive usability tests. |
| [Yoodli practice guide](https://support.yoodli.ai/en/articles/9550465-practice-with-yoodli) and [pricing](https://yoodli.ai/pricing) | Existing pitch/Q&A workflows, individual and team plans, privacy-plan language. | Vendor description, changeable over time. |
| [Microsoft Speaker Coach](https://support.microsoft.com/en-us/powerpoint/rehearse-your-slide-show-with-speaker-coach) | Existing live, on-screen pace, pitch, filler, and language guidance during rehearsal. | Vendor description; platform features vary. |
| [Poised meeting guide](https://help.poised.com/en/articles/6050069-how-poised-works-in-meetings) | Existing real-time meeting feedback category. | Vendor description; inspect current experience directly. |
| [ElevenLabs client-side streaming](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming), [events](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/event-reference), [timestamps](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies) | Candidate streaming transcription path for microphone-first live cues. | Verify account access, rate limits, end-to-end latency, costs, and privacy behavior. |
| [VirtualSpeech practice library](https://virtualspeech.com/practice) | Existing roleplay, presentation, and pitch exercises. | Vendor description. |
| [LinkedIn 2025 workplace learning report](https://business.linkedin.com/learn/resources/workplace-learning-report) | Organizational learning context and constraints. | Survey of L&D/HR/learners, not SpeakSense buyers. |
| [Controlled video-feedback study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4059172/) | Limited support for structured feedback plus practice. | Medical-student presentations; cannot infer SpeakSense efficacy. |
| [PNAS: racial disparities in ASR](https://pmc.ncbi.nlm.nih.gov/articles/PMC7149386/) | Need to test recognition quality and avoid accent-based judgments. | Evaluated 2019 commercial systems; measure current providers directly. |
| [Presage measurement quality](https://smartspectra.presagetech.com/docs/measurement-quality), [Node SDK](https://smartspectra.presagetech.com/docs/nodejs), [C++ SDK](https://smartspectra.presagetech.com/docs/cpp/) | Roadmap feasibility, measurement quality, wellness limitation. | Platform support and product claims can change; verify before build. |

## 14. Opportunity map

**Fix this week:** demonstrate an actual on-screen cue during streaming microphone input in both Practice and Live presentation modes; expose mute and capture state; log cue reason and timing; recruit real deadline-driven founders.  
**Build directly next:** private earbud audio prompts using the same cue events, with separate mute/volume controls and tests for distraction.  
**Build this quarter if validated:** content rubric by audience, transcript correction, trusted-human feedback sharing, privacy/deletion controls, custom duration, and the executive decision-pitch scenario.  
**Deeper research:** willingness to pay, accelerator buyer interest, whether cues help in a real presentation, cue latency, listener comprehension, ASR accuracy across users, whether Presage data changes speaking behavior, and whether a live-streaming pin provides value beyond a phone.

## 15. Codex handoff prompt

**Use the expanded, current build prompt in [`SPEAKSENSE_CODEX_BUILD_PROMPT.md`](SPEAKSENSE_CODEX_BUILD_PROMPT.md).** It contains the live-feedback acceptance criteria, both modes, cue behavior, earbud milestone, provider checks, and browser test requirements. The paragraph below is a condensed summary only.

**Recommended model:** GPT-6 Astra  
**Recommended thinking level:** High

> Read `SPEAKSENSE_CUSTOMER_AVATAR_RESEARCH.md` as the product and copy brief, including its evidence limits and staged roadmap. Build a responsive, working SpeakSense prototype for the primary avatar: an early-stage founder preparing for and delivering a scheduled pitch. **The defining requirement is real feedback during the speech in both Practice and Live presentation modes. A post-speech report alone does not satisfy the task.** First complete the microphone flow: ask for audience, time limit, intended takeaway, and optional required message points; capture streaming microphone audio; detect a small set of reliable live signals such as time remaining, sustained pace drift, or repeated fillers; show sparse, subtle on-screen cues early enough for the speaker to act; provide instant cue mute and capture stop; and mark when live analysis is unavailable. Try one user-defined message checkpoint during the speech only if stable transcript evidence supports it and time remains for the speaker to act; suppress uncertain cues. Log each cue's trigger and time. After the take, create a correctable time-linked transcript and a review that explains the cues and offers grounded message feedback; support retry and comparison in Practice mode. Implement a real stream, not a replay-only mock, and report measured audio-to-cue latency and failure behavior. Next, add private earbud audio prompts using the same cue events **before** camera or pin work. Make uncertainty visible, never fabricate transcript evidence or a persuasion score, and avoid claims that the product predicts funding or diagnoses anxiety. Use the draft copy in the brief as a starting point, then adjust to fit actual implemented behavior. Preserve room for later executive, camera/Presage, live-streaming pin, and sensor scenarios without claiming those integrations work in the first prototype. Use all relevant skills, documentation, tools, and resources efficiently; verify current API and SDK capabilities and the user's credits before selecting ElevenLabs, Meta, Presage, or another provider. Run the app, fix errors, and give exact browser test steps for both modes. Keep the code in Git and prepare it for an HTTPS demo. Ask only for information that truly blocks implementation; document assumptions and continue with useful independent work.

## 16. Open questions for the founder

1. Can you recruit five founders with a real pitch in the next 30 days? This determines whether the recommended first avatar can be validated quickly.
2. Is the first event an investor pitch, demo day, hackathon judging, customer pitch, or another setting? The feedback rubric depends on it.
3. What recording policy do you want for unreleased company information: temporary processing with deletion, saved practice history, or user choice? Product copy must match the actual implementation.
4. Is English the first supported language, and which accents/languages must be tested with the first cohort? Avoid presenting unsupported languages as available.
5. Do you want the first paid experiment aimed at individual founders or a founder program? This is a test choice; neither buying path is validated yet.
6. For Live presentation mode, should sessions be saved by default, never saved, or saved only when the speaker opts in? The UI and data policy must match this decision.
