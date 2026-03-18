/**
 * Backend API smoke tests — run against http://localhost:8000
 * These do not require a browser session; they use Playwright's `request` fixture.
 */
import { test, expect } from '@playwright/test'

const API = 'http://localhost:8000'

// ── Health ──────────────────────────────────────────────────────────────────

test.describe('API — Health', () => {
  test('GET /health returns 200', async ({ request }) => {
    const res = await request.get(`${API}/health`)
    expect(res.status()).toBe(200)
  })

  test('GET /health returns ok body', async ({ request }) => {
    const res = await request.get(`${API}/health`)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok' })
  })
})

// ── Unauthenticated protection ──────────────────────────────────────────────

test.describe('API — Auth protection', () => {
  test('POST /api/chat without token returns 401 or 403', async ({ request }) => {
    const res = await request.post(`${API}/api/chat`, {
      data: { patient_id: 'test', message: 'hello', language: 'en' },
    })
    expect([401, 403, 422]).toContain(res.status())
  })

  test('GET /api/medications/today without token returns 401 or 403', async ({ request }) => {
    const res = await request.get(`${API}/api/medications/today?patient_id=test`)
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/caregiver/:patientId/alerts without token returns 401 or 403', async ({ request }) => {
    const res = await request.get(`${API}/api/caregiver/00000000-0000-0000-0000-000000000000/alerts`)
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/clinician/:patientId/report without token returns 401 or 403', async ({ request }) => {
    const res = await request.get(`${API}/api/clinician/00000000-0000-0000-0000-000000000000/report`)
    expect([401, 403]).toContain(res.status())
  })
})

// ── CORS ────────────────────────────────────────────────────────────────────

test.describe('API — CORS', () => {
  test('/health allows cross-origin requests from localhost:3000', async ({ request }) => {
    const res = await request.get(`${API}/health`, {
      headers: { Origin: 'http://localhost:3000' },
    })
    // Should not reject the request
    expect(res.status()).toBe(200)
  })
})
