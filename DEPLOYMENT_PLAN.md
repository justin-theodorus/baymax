# Baymax 2.0 — Deployment Preparation Plan

> Current state: local dev only, 1 patient in DB, no tests, voice pipeline broken.
> Goal: a publicly accessible prototype with realistic data, a passing QA suite, and one-command deploy.

---

## Phase 1 — Seed Data Enrichment
**Goal:** Clinician sees a realistic panel of 3 patients, each with distinct conditions, demographics, and a full week of data.

### 1.1 — Add 2 additional patients

Extend `backend/scripts/reset_demo.py` to insert two new patient records:

| # | Name | Age | Conditions | Language |
|---|---|---|---|---|
| 1 | Mdm Tan Ah Ma *(existing)* | 72 | Type 2 Diabetes, Hypertension | English |
| 2 | Mr Lim Ah Kow *(new)* | 68 | Hypertension, Heart Disease | Mandarin (`zh`) |
| 3 | Mdm Nair Kamala *(new)* | 75 | Type 2 Diabetes, Osteoarthritis | Tamil (`ta`) |

Each new patient needs:
- A row in `patients` table with a fixed UUID
- 7 days of `vitals` (blood glucose + blood pressure, realistic but distinct from Tan's)
- 7 days of `medication_logs` (different adherence patterns — Lim has good adherence, Kamala has moderate)
- 2–3 `alerts` each (mix of warning/info severities, some acknowledged)
- Linked into the clinician's `patient_ids` array

New UUIDs to hard-code (keeps resets idempotent):
```
PATIENT_LIM_ID   = "a2b2c3d4-0000-0000-0000-000000000002"
PATIENT_KAMALA_ID = "a3b2c3d4-0000-0000-0000-000000000003"
```

Also add their medications (2 each) to the `medications` table with fixed UUIDs.

### 1.2 — Add a second caregiver

Create a second caregiver linked to Mr Lim so the caregiver flow also has data for this new patient:
- Email: `caregiver2@baymax.demo` / `BaymaxDemo2026!`
- Record in `caregivers` table, `patient_ids: [PATIENT_LIM_ID]`

### 1.3 — Update `create_test_users.py`

Add the new caregiver account creation and link all three patients to the clinician.

---

## Phase 2 — Voice Pipeline Debug
**Symptom:** Audio records fine (mic works), but no response appears in chat. No visible error.

### 2.1 — Isolate the failure point

The voice pipeline is: `mic → browser MediaRecorder → POST /api/voice → Deepgram STT → LangGraph → Azure TTS → response`

Check each hand-off:

1. **Browser → backend**: Open DevTools Network tab, check if the POST to `/api/voice` is being made at all, and what status code it returns.
2. **STT**: Add a logging statement in `app/voice/stt.py` immediately after `transcribe_file()` to print the raw Deepgram response. If Deepgram returns an empty transcript, the LangGraph chain gets an empty string and may return silently.
3. **LangGraph**: Add a log at the entry of `companion_respond` to confirm the node is being reached.
4. **Response serialisation**: The `/api/voice` endpoint likely returns a `StreamingResponse` with audio bytes. Check if the frontend is expecting JSON vs audio, or if there's a mismatch in content-type handling.
5. **CORS on voice endpoint**: WebSocket and multipart endpoints sometimes need explicit CORS preflight handling. Check if the OPTIONS call to `/api/voice` gets a 200.

### 2.2 — Common fixes expected

- **Empty transcript**: Deepgram may be returning an empty string if the audio encoding is wrong. The frontend sends `audio/webm;codecs=opus` — Deepgram needs `encoding=webm` or `mimetype` param set explicitly. Fix in `stt.py`.
- **Silent LangGraph failure**: If the agent graph catches an exception internally and returns an empty response without raising, add explicit error propagation from the graph's final node back to the API endpoint.
- **Frontend not rendering TTS response**: The patient chat page likely only renders text into the chat bubble from the JSON response field. Confirm the response shape (`{ text, audio_b64 }` or similar) matches what the frontend expects.

### 2.3 — Add a `/api/voice/health` test endpoint

A simple endpoint that accepts a hardcoded short audio clip, runs it through STT, returns the transcript. Lets Claude Code verify the STT layer is working without the full LangGraph stack.

---

## Phase 3 — QA Automation (Playwright + Claude Code)
**Goal:** A browser-based test suite that Claude Code can run, read results from, and self-debug.

### 3.1 — Setup

Install Playwright in a new `qa/` directory at the repo root:

```
baymax/
  qa/
    package.json          (playwright + @playwright/test)
    playwright.config.ts  (baseURL, screenshot on failure, video on retry)
    tests/
      auth.spec.ts        — login flows for all 3 roles
      patient.spec.ts     — dashboard, chat (text), medications
      caregiver.spec.ts   — dashboard, alerts, digest, manage
      clinician.spec.ts   — patient list, report page
    fixtures/
      auth.ts             — shared login helper (logs in, saves storageState)
    helpers/
      wait-for-api.ts     — waits for backend health before running tests
```

`playwright.config.ts` settings:
- `baseURL: 'http://localhost:3000'`
- `screenshot: 'only-on-failure'`
- `video: 'retain-on-failure'`
- Separate projects for `patient`, `caregiver`, `clinician` (each with pre-saved auth state)

### 3.2 — Test coverage per stakeholder

**`auth.spec.ts`**
- [ ] Patient login (email/password) → lands on `/patient`
- [ ] Caregiver login → lands on `/caregiver`
- [ ] Clinician login → lands on `/clinician`
- [ ] Unauthenticated access to `/patient` redirects to `/patient/login`

**`patient.spec.ts`**
- [ ] Dashboard loads: greeting, Baymax card, at least one medication card visible
- [ ] Text chat: type a message, submit, response bubble appears within 15 s
- [ ] Medications page: at least one card visible, tap to mark taken → status changes
- [ ] Nav: all 3 tabs navigate to correct pages

**`caregiver.spec.ts`**
- [ ] Dashboard loads: patient status card visible with adherence %
- [ ] Alerts page: at least one alert card visible
- [ ] Acknowledge alert: status changes to acknowledged
- [ ] Digest page: generate button visible; if digest exists, stats card renders
- [ ] Manage page: medication list loads

**`clinician.spec.ts`**
- [ ] Patient list: 3 patient cards visible
- [ ] Click "View Report" → navigates to report page
- [ ] Report page: patient name in breadcrumb, at least one vitals box renders
- [ ] Breadcrumb "Patients" link navigates back to list

### 3.3 — How Claude Code uses the QA suite

Run from the `qa/` directory:
```bash
npx playwright test                    # full suite
npx playwright test patient.spec.ts    # single spec
npx playwright test --headed           # visible browser (for debug sessions)
npx playwright show-report             # open HTML report
```

Claude Code workflow:
1. Run `npx playwright test --reporter=json > results.json`
2. Read `results.json` to see which tests failed and why
3. Read the screenshot/video for failed tests (`test-results/` dir)
4. Inspect the relevant page/component, fix the bug, re-run the failing spec

### 3.4 — Add a `qa/README.md`

Documents how to:
- Start both services (`pnpm dev` + `uvicorn`)
- Run the full suite
- Run a single spec
- Interpret failures

---

## Phase 4 — Environment & Deployment Config

### 4.1 — Environment variables audit

Create `backend/.env.example` and `frontend/.env.example` listing every required var:

**Backend**
```
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_JWT_SECRET=
ANTHROPIC_API_KEY=
DEEPGRAM_API_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastasia
FRONTEND_ORIGIN=http://localhost:3000
TELEGRAM_BOT_TOKEN=          # optional for demo — alerts just won't send to Telegram
```

**Frontend**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Flag which vars are required vs optional for a demo that omits Telegram.

### 4.2 — CORS update for production URLs

In `backend/app/main.py`, `allow_origins` currently hardcodes `localhost:3000`. Update to read from `settings.frontend_origin` which should be set to the Vercel URL in production.

### 4.3 — Backend health endpoint

Add `GET /health` → `{ "status": "ok", "version": "0.2.0" }`. Needed by Railway for deployment health checks.

### 4.4 — Frontend `next.config.js` production settings

- Ensure `NEXT_PUBLIC_API_URL` points to the Railway backend URL in production
- Add `output: 'standalone'` if containerising, or leave as default for Vercel

### 4.5 — `Procfile` / `railway.json` for backend

Railway needs either a `Procfile` or a start command:
```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

---

## Phase 5 — Deployment

### 5.1 — Frontend → Vercel

1. Push repo to GitHub (if not already)
2. Import project in Vercel dashboard → select `frontend/` as root directory
3. Set env vars in Vercel dashboard (from `.env.example`)
4. Deploy — Vercel auto-detects Next.js

### 5.2 — Backend → Railway

1. Create new Railway project → deploy from GitHub → select `backend/` as root
2. Set env vars in Railway dashboard
3. Add `Procfile` (from 4.5)
4. Railway assigns a URL (e.g. `https://baymax-backend.railway.app`) — set this as `FRONTEND_ORIGIN` env var + update `NEXT_PUBLIC_API_URL` in Vercel

### 5.3 — Supabase

Already live. After deploying:
- Re-run `python scripts/create_test_users.py` (pointed at production Supabase, using secret key)
- Re-run `python scripts/reset_demo.py` to seed fresh data
- Verify the JWT custom-claims hook is active (Supabase Dashboard → Auth → Hooks)

### 5.4 — Smoke test checklist (post-deploy)

- [ ] `GET https://baymax-backend.railway.app/health` → 200
- [ ] Login as each of the 3 demo accounts
- [ ] Patient: send a text message → response appears
- [ ] Caregiver: dashboard loads with patient data
- [ ] Clinician: 3 patient cards visible
- [ ] Voice: record a short message → response appears (after Phase 2 fix)

---

## Execution Order

| Order | Phase | Effort | Blocks |
|---|---|---|---|
| 1 | **2 — Voice Debug** | Half day | Demo quality |
| 2 | **1 — Seed Data** | Half day | Clinician demo realism |
| 3 | **3 — QA Setup** | 1 day | Self-debugging capability |
| 4 | **4 — Env/Config** | 2–3 hours | Deployment |
| 5 | **5 — Deploy** | 2–3 hours | Public access |

Fix voice first — it's the most impactful demo feature and the most likely to reveal other bugs. Then enrich data so the clinician view looks real. Then set up QA so you can catch regressions as you deploy.

---

## Demo Credentials (all environments)

| Role | Email | Password |
|---|---|---|
| Patient (Mdm Tan) | `patient@baymax.demo` | `BaymaxDemo2026!` |
| Caregiver (Wei Ling) | `caregiver@baymax.demo` | `BaymaxDemo2026!` |
| Caregiver 2 (Lim's daughter) | `caregiver2@baymax.demo` | `BaymaxDemo2026!` |
| Clinician (Dr. Tan) | `clinician@baymax.demo` | `BaymaxDemo2026!` |
