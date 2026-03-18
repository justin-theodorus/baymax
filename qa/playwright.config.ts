import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,           // 60s global — AI responses can be slow
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // ── Setup — saves auth state for each role ──────────────────────────────
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    // ── Patient ─────────────────────────────────────────────────────────────
    {
      name: 'patient',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/patient.json',
      },
      dependencies: ['setup'],
      testMatch: 'tests/patient.spec.ts',
    },

    // ── Caregiver ───────────────────────────────────────────────────────────
    {
      name: 'caregiver',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/caregiver.json',
      },
      dependencies: ['setup'],
      testMatch: 'tests/caregiver.spec.ts',
    },

    // ── Clinician ───────────────────────────────────────────────────────────
    {
      name: 'clinician',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/clinician.json',
      },
      dependencies: ['setup'],
      testMatch: 'tests/clinician.spec.ts',
    },

    // ── Auth (no stored state — tests login flows + redirects) ───────────────
    {
      name: 'auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'tests/auth.spec.ts',
    },

    // ── API (no browser — uses request fixture against backend) ─────────────
    {
      name: 'api',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'tests/api.spec.ts',
    },
  ],
})
