# Baymax 2.0 — Demo Video Plan
> Intended for Remotion. All durations are in seconds. Total runtime: ~2 min 30 s.

---

## Global Config

| Property | Value |
|---|---|
| FPS | 30 |
| Width | 1920 |
| Height | 1080 |
| Total frames | ~4500 (150 s) |
| Font | Poppins (matches app) |
| Primary colour | `#4894fe` |
| Dark colour | `#464646` |
| Background | `#f5f5f5` |
| Accent colours | `#52B788` (green), `#F4A261` (amber), `#E63946` (red) |

---

## Scene Breakdown

### Scene 1 — Hook (0–8 s)

**Visual:** Full-screen dark background (`#0d0d0d`). Text fades in line by line.

```
Line 1 (fade in at 0.5 s):  "1 in 9 Singaporeans is over 65."
Line 2 (fade in at 2.5 s):  "Most manage 3+ chronic conditions alone."
Line 3 (fade in at 4.5 s):  "What if AI could be the bridge?"
```

**Animation:** Each line slides up 20px and fades in over 0.6 s. Line 3 renders in `#4894fe`.

**Audio cue:** Soft ambient tone starts.

---

### Scene 2 — Product Title (8–14 s)

**Visual:** Background transitions to white. Baymax logo mark (blue sparkle SVG) scales up from 0 → 1 with a spring easing. Title text appears below.

```
Large title:   "Baymax 2.0"            (font-size: 72px, bold, #4894fe)
Subtitle:      "AI Care Companion"     (font-size: 28px, #8f8f8f)
Tag line:      "Voice-first · Multilingual · Multi-agent"  (font-size: 18px, #b4b4b4)
```

**Animation:** Logo spring-scales in (mass 0.5, stiffness 120). Title fades in 0.4 s after logo settles.

---

### Scene 3 — Three Stakeholders (14–22 s)

**Visual:** Three cards slide in from the bottom in staggered sequence (0.15 s apart). Cards sit side-by-side on a `#f5f5f5` background.

| Card | Icon | Label | Colour |
|---|---|---|---|
| Left | Patient (elderly person icon) | "Patient" | `#4894fe` |
| Centre | Caregiver (family icon) | "Caregiver" | `#464646` |
| Right | Clinician (stethoscope icon) | "Clinician" | `#52B788` |

Below each card, a one-liner fades in:
- Patient: *"Voice-first daily check-ins"*
- Caregiver: *"Real-time alerts & weekly digest"*
- Clinician: *"AI-generated pre-visit reports"*

**Transition out:** Cards scale down to thumbnail size and float to corners of screen (used as persistent pip in scenes 4–6).

---

### Scene 4 — Patient Flow (22–62 s)

Narration bar at bottom throughout: white pill with text in `#464646`.

#### 4a — Patient Dashboard (22–32 s)

**Visual:** Browser/phone mockup frame fades in showing `/patient` page.
- Highlight ring animates around the Baymax card (tip bubble + waveform)
- Annotation appears: *"Personalised health tip, powered by RAG from MOH guidelines"*
- Highlight ring moves to medication cards
- Annotation: *"Today's medications — pulled live from patient profile"*

**Narration text:** *"Mdm Tan opens Baymax and sees her morning tip and upcoming medications."*

#### 4b — Voice Interaction (32–52 s)

**Visual:** Screen transitions to `/patient/chat`. Simulate a conversation:

1. (32 s) User taps mic button — button pulses blue, waveform animates
2. (35 s) Transcript appears in chat bubble:
   > *"Baymax, I forgot to take my Metformin this morning. Also my knee has been aching."*
3. (38 s) Thinking indicator (three animated dots)
4. (41 s) Baymax response bubble types in:
   > *"No worries, Mdm Tan. I've noted the missed dose. For your knee, gentle stretching can help — but if the ache persists more than 3 days, please mention it to your doctor. Would you like me to flag this for your caregiver?"*
5. (48 s) Badge appears: *"Safety-checked · RAG-grounded · No diagnosis made"*

**Annotation callouts (timed):**
- At 38 s: callout on right side — *"LangGraph orchestrates 5 MCP agents"*
- At 41 s: callout — *"Responded in patient's preferred language"*
- At 48 s: callout — *"PolicyGate blocks any prescriptive language"*

**Narration text:** *"Baymax responds in natural language — safe, grounded, and escalation-ready."*

#### 4c — Medication Check-in (52–62 s)

**Visual:** Screen slides to `/patient/medications`. A medication card pulses. User taps it — card flips to "Taken ✓" state with a green fill animation.

**Narration text:** *"One tap to log a dose. Adherence is tracked automatically."*

---

### Scene 5 — Caregiver Flow (62–102 s)

#### 5a — Dashboard (62–72 s)

**Visual:** Screen shows `/caregiver` dashboard. Highlight the status card.
- Blue status card: "Stable" label, adherence %, alerts count
- Warning card animates in with amber dot pulsing: *"2 active alerts require attention"*

**Annotation:** *"Real-time patient status — no need to call"*

**Narration text:** *"Meanwhile, Mdm Tan's daughter checks the caregiver dashboard."*

#### 5b — Alerts (72–84 s)

**Visual:** Navigate to `/caregiver/alerts`. Two alert cards visible.
- Top card (red border): *"Missed morning medication — Metformin"*
- Second card (amber): *"Blood glucose: 11.2 mmol/L — borderline high"*
- Tap "Acknowledge" on first card → card fades to gray, checkmark animates

**Annotation:** *"Alerts are AI-triaged by severity — critical, warning, info"*

**Narration text:** *"Critical alerts are surfaced immediately. Caregivers can acknowledge and act."*

#### 5c — Weekly Digest (84–102 s)

**Visual:** Navigate to `/caregiver/digest`. Show the full digest page.
- Blue report period card with stats (adherence %, alert count)
- Vitals section: animate in the coloured gauge boxes one by one (stagger 0.1 s each)
  - Blood Glucose: green "In Range" box with gauge bar
  - Blood Pressure: amber "Borderline" box
- Summary cards below: each slides up with stagger

**Annotation at vitals:** *"Structured vitals — averaged from weekly readings"*
**Annotation at summary:** *"Plain-language AI summary — no medical jargon"*

**Narration text:** *"The weekly digest translates a full week of health data into a 30-second read."*

---

### Scene 6 — Clinician Flow (102–132 s)

#### 6a — Patient List (102–110 s)

**Visual:** Screen shows `/clinician` page. Two patient cards visible (blue cards).
- Highlight the patient card for Mdm Tan
- Tap "View Report"

**Narration text:** *"Before the consultation, the doctor pulls up Baymax's pre-visit report."*

#### 6b — Clinical Report (110–132 s)

**Visual:** `/clinician/report/[id]` page. Scroll animation through the report.

1. (110 s) Header — patient name, age, date range, Export PDF button
2. (113 s) Vitals at a Glance — gauge boxes animate in (same as caregiver but more detailed)
   - Annotation: *"7-day average · colour-coded by clinical range"*
3. (118 s) Medication adherence section — progress bar animates to 86%
   - Annotation: *"Dose-by-dose adherence log"*
4. (122 s) AI narrative summary — text types in
   - Annotation: *"Generated by Claude Sonnet · RAG-grounded in MOH guidelines"*
5. (128 s) Click "Export PDF" → brief print preview flash

**Narration text:** *"A full AI-generated clinical brief — ready before the patient even walks in."*

---

### Scene 7 — Connected Care (132–142 s)

**Concept:** Show the full loop — one patient action ripples in real time to the caregiver and then the clinician. No technical diagram; pure human story.

**Visual:** Three-panel split screen. Each panel is a phone mockup labelled with the stakeholder's role.

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   PATIENT   │   │  CAREGIVER  │   │  CLINICIAN  │
│             │   │             │   │             │
│  chat ui    │   │  dashboard  │   │  report pg  │
└─────────────┘   └─────────────┘   └─────────────┘
```

**Animation sequence (within 132–142 s):**

1. **(132 s)** Patient panel lights up — chat bubble types:
   > *"I feel dizzy and skipped my morning Metformin."*

2. **(134.5 s)** A glowing pulse travels along a connecting arc from Patient → Caregiver panel. Caregiver panel flashes a red alert badge: *"Critical — missed dose + dizziness reported"*. A Telegram icon animates in below: *"Alert sent via Telegram"*.

3. **(137 s)** A second pulse travels from Patient → Clinician panel. The clinician report page highlights a new entry in the vitals/symptom log. Annotation fades in: *"Pre-visit brief updated automatically"*.

4. **(139.5 s)** All three panels are simultaneously lit. A single line of text fades in below across the full width:
   > *"One conversation. Three people informed. Zero phone calls."*  (bold, `#464646`, centred)

**Narration text:** *"Baymax connects the entire care circle — automatically, in real time."*

---

### Scene 8 — Outro (142–150 s)

**Visual:** White background. Three mock phone screens (patient, caregiver, clinician) float in side-by-side, each showing their home screen. Below, impact stats count up:

| Stat | Value |
|---|---|
| Patients supported | 1 |
| Languages | 4 |
| Agents | 3 |
| Safety checks | Every response |

Then fade to:

```
"Baymax 2.0"          (large, bold, #4894fe)
"Built for Synapxe Healthcare AI Hackathon 2026"
```

Final hold for 2 s before fade to black.

---

## Remotion Component Map

Suggested component structure:

```
src/
  Root.tsx                  — registerRoot, Composition config
  compositions/
    DemoVideo.tsx           — master sequence, imports all scenes
  scenes/
    Scene1Hook.tsx
    Scene2Title.tsx
    Scene3Stakeholders.tsx
    Scene4aPatientDash.tsx
    Scene4bVoiceChat.tsx
    Scene4cMedications.tsx
    Scene5aCaregiverDash.tsx
    Scene5bAlerts.tsx
    Scene5cDigest.tsx
    Scene6aClinicianList.tsx
    Scene6bReport.tsx
    Scene7ConnectedCare.tsx
    Scene8Outro.tsx
  components/
    AnnotationCallout.tsx   — animated side annotation with arrow
    MockupFrame.tsx         — browser/phone frame wrapper
    VitalBox.tsx            — reusable gauge box (matches app)
    ChatBubble.tsx          — animated typing bubble
    TypingText.tsx          — character-by-character type-in animation
    CountUp.tsx             — animating number counter
    StakeholderCard.tsx
  assets/
    baymax-sparkle.svg
    logo.png
```

### Key Remotion APIs to use

| Need | API |
|---|---|
| Scene timing | `<Sequence from={} durationInFrames={}>` |
| Spring animations | `spring({ frame, fps, config: { stiffness, mass } })` |
| Fade in/out | `interpolate(frame, [0,15], [0,1])` |
| Animated arc/pulse | `<svg>` path + `strokeDashoffset` driven by `interpolate` |
| Scroll simulation | `translateY` on a tall div driven by `interpolate` |
| Stagger | `spring({ frame: frame - i * 5, ... })` per item |

---

## Timing Summary

| # | Scene | Start | End | Duration |
|---|---|---|---|---|
| 1 | Hook | 0 s | 8 s | 8 s |
| 2 | Title | 8 s | 14 s | 6 s |
| 3 | Three Stakeholders | 14 s | 22 s | 8 s |
| 4a | Patient — Dashboard | 22 s | 32 s | 10 s |
| 4b | Patient — Voice Chat | 32 s | 52 s | 20 s |
| 4c | Patient — Medications | 52 s | 62 s | 10 s |
| 5a | Caregiver — Dashboard | 62 s | 72 s | 10 s |
| 5b | Caregiver — Alerts | 72 s | 84 s | 12 s |
| 5c | Caregiver — Digest | 84 s | 102 s | 18 s |
| 6a | Clinician — Patient List | 102 s | 110 s | 8 s |
| 6b | Clinician — Report | 110 s | 132 s | 22 s |
| 7 | Connected Care | 132 s | 142 s | 10 s |
| 8 | Outro | 142 s | 150 s | 8 s |
| | **Total** | | | **150 s** |
