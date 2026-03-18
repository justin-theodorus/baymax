import { test, expect } from '@playwright/test'

const PASSWORD = 'BaymaxDemo2026!'

// ── Login flows ────────────────────────────────────────────────────────────────

test('patient: toggle to password mode and login lands on dashboard', async ({ page }) => {
  await page.goto('/patient/login')
  await page.getByRole('button', { name: /use password instead/i }).click()
  await page.getByPlaceholder(/name@example\.com/i).fill('patient@baymax.demo')
  await page.getByPlaceholder(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/patient$/, { timeout: 20_000 })
})

test('patient: magic link mode toggle works correctly', async ({ page }) => {
  await page.goto('/patient/login')
  // Default: submit button says "Send me a sign-in link"
  await expect(page.getByRole('button', { name: /send me a sign-in link/i })).toBeVisible()
  // Toggle to password mode
  await page.getByRole('button', { name: /use password instead/i }).click()
  // Now a password field should appear and submit says "Sign In"
  await expect(page.getByPlaceholder(/password/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()
  // Toggle back
  await page.getByRole('button', { name: /use magic link instead/i }).click()
  await expect(page.getByRole('button', { name: /send me a sign-in link/i })).toBeVisible()
})

test('caregiver: login with valid credentials lands on dashboard', async ({ page }) => {
  await page.goto('/caregiver/login')
  await page.getByLabel(/email/i).fill('caregiver@baymax.demo')
  await page.getByLabel(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/caregiver$/, { timeout: 20_000 })
})

test('clinician: login with valid credentials lands on dashboard', async ({ page }) => {
  await page.goto('/clinician/login')
  await page.getByLabel(/email/i).fill('clinician@baymax.demo')
  await page.getByLabel(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/clinician$/, { timeout: 20_000 })
})

test('caregiver: invalid password shows error message', async ({ page }) => {
  await page.goto('/caregiver/login')
  await page.getByLabel(/email/i).fill('caregiver@baymax.demo')
  await page.getByLabel(/password/i).fill('WrongPassword999!')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/invalid|incorrect|wrong|error/i)).toBeVisible({ timeout: 10_000 })
})

// ── Unauthenticated redirects ──────────────────────────────────────────────────

test('unauthenticated /patient redirects to /patient/login', async ({ page }) => {
  await page.goto('/patient')
  await expect(page).toHaveURL(/\/patient\/login/, { timeout: 10_000 })
})

test('unauthenticated /caregiver redirects to /caregiver/login', async ({ page }) => {
  await page.goto('/caregiver')
  await expect(page).toHaveURL(/\/caregiver\/login/, { timeout: 10_000 })
})

test('unauthenticated /clinician redirects to /clinician/login', async ({ page }) => {
  await page.goto('/clinician')
  await expect(page).toHaveURL(/\/clinician\/login/, { timeout: 10_000 })
})

test('unauthenticated /patient/chat redirects to /patient/login', async ({ page }) => {
  await page.goto('/patient/chat')
  await expect(page).toHaveURL(/\/patient\/login/, { timeout: 10_000 })
})

test('unauthenticated /caregiver/alerts redirects to /caregiver/login', async ({ page }) => {
  await page.goto('/caregiver/alerts')
  await expect(page).toHaveURL(/\/caregiver\/login/, { timeout: 10_000 })
})

test('root page renders the landing page with portal links', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/patient portal|caregiver dashboard|clinician view/i).first()).toBeVisible({ timeout: 10_000 })
})
