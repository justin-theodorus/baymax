# Baymax QA — Playwright Test Suite

End-to-end browser tests for all three stakeholder flows.

## Prerequisites

- Node.js 18+
- Both services running locally:
  - Frontend: `cd frontend && pnpm dev` (port 3000)
  - Backend: `cd backend && uvicorn app.main:app --reload` (port 8000)
- Demo data seeded: `cd backend && python scripts/reset_demo.py`

## Setup

```bash
cd qa
npm install
npx playwright install chromium
```

## Running tests

```bash
# Full suite
npm test

# Single spec
npm run test:patient
npm run test:caregiver
npm run test:clinician
npm run test:auth

# Headed (visible browser — useful for debugging)
npm run test:headed

# View HTML report after a run
npm run report
```

## Output

- `test-results/results.json` — machine-readable results (for Claude Code to parse)
- `playwright-report/` — HTML report with screenshots and traces
- `test-results/` — screenshots and videos for failed tests

## How Claude Code uses this

1. Run `npm test -- --reporter=json 2>&1 | tee test-results/results.json`
2. Claude reads `test-results/results.json` to find failures
3. Claude reads screenshots from `test-results/` for visual context
4. Claude fixes the issue and re-runs just the failing spec:
   `npx playwright test tests/caregiver.spec.ts --reporter=list`

## Interpreting failures

Common failure patterns:
- **Timeout on API response** — backend may be down or slow; check `http://localhost:8000/health`
- **Login redirect loop** — JWT claims issue; check Supabase auth hook configuration
- **Element not found** — UI changed; update the selector in the spec
- **3 patient cards expected, got 1** — reset_demo.py needs to be re-run
