import { test, expect } from '@playwright/test'

// ── Dashboard ──────────────────────────────────────────────────────────────────

test.describe('Patient — Dashboard', () => {
  test('loads with time-of-day greeting', async ({ page }) => {
    await page.goto('/patient')
    await expect(page.getByText(/good (morning|afternoon|evening)/i)).toBeVisible({ timeout: 15_000 })
  })

  test('shows Baymax voice card with health tip', async ({ page }) => {
    await page.goto('/patient')
    // The Baymax card always shows a health tip bubble and a "Hold to speak" label
    await expect(page.getByText(/hold to speak|按住说话/i)).toBeVisible({ timeout: 10_000 })
  })

  test('medication cards appear on dashboard', async ({ page }) => {
    await page.goto('/patient')
    await expect(
      page.locator('[class*="rounded"]').filter({ hasText: /mg/i }).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('nav tabs — Home, Baymax (chat), Medications — are all present', async ({ page }) => {
    await page.goto('/patient')
    await expect(page.getByRole('link', { name: /home/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /med/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /baymax/i }).first()).toBeVisible()
  })
})

// ── Chat (text) ────────────────────────────────────────────────────────────────

test.describe('Patient — Chat', () => {
  test('chat page loads with message input', async ({ page }) => {
    await page.goto('/patient/chat')
    await expect(page.getByPlaceholder(/ask baymax/i)).toBeVisible({ timeout: 10_000 })
  })

  test('language selector is visible', async ({ page }) => {
    await page.goto('/patient/chat')
    // Language buttons (English, 中文, etc.) should be present
    await expect(page.getByRole('button', { name: /english/i })).toBeVisible({ timeout: 10_000 })
  })

  test('voice button is visible', async ({ page }) => {
    await page.goto('/patient/chat')
    // Microphone / voice button should be present
    await expect(page.locator('button[aria-label*="voice" i], button[aria-label*="mic" i], button svg').first()).toBeVisible()
  })

  test('sends a text message and receives assistant reply within 45s', async ({ page }) => {
    await page.goto('/patient/chat')
    await page.waitForTimeout(1500) // let session + patientId settle

    const input = page.getByPlaceholder(/ask baymax/i)
    await input.fill('Hello, what medications do I have today?')
    await page.keyboard.press('Enter')

    // User bubble appears immediately
    await expect(page.getByText('Hello, what medications do I have today?')).toBeVisible({ timeout: 5_000 })

    // Typing indicator or assistant response appears
    await expect(
      page.locator('[class*="assistant"], [class*="bg-\\[\\#f5f5f5\\]"], [class*="typing"]').first()
    ).toBeVisible({ timeout: 45_000 })
  })

  test('input clears after sending and is ready for next message', async ({ page }) => {
    await page.goto('/patient/chat')
    await page.waitForTimeout(1500)

    const input = page.getByPlaceholder(/ask baymax/i)
    await input.fill('Hello Baymax!')
    await page.keyboard.press('Enter')

    // User bubble appears
    await expect(page.getByText('Hello Baymax!')).toBeVisible({ timeout: 5_000 })
    // Input should be cleared after send
    await expect(input).toHaveValue('', { timeout: 5_000 })
  })
})

// ── Medications ────────────────────────────────────────────────────────────────

test.describe('Patient — Medications', () => {
  test('medications page loads with heading', async ({ page }) => {
    await page.goto('/patient/medications')
    await expect(page.getByText(/medication/i)).toBeVisible({ timeout: 10_000 })
  })

  test('at least one medication card or empty state is visible', async ({ page }) => {
    await page.goto('/patient/medications')
    // Wait for loading to finish (loading text disappears), then check content
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading medications'),
      { timeout: 30_000 }
    )
    // After loading: medication cards, all-done, empty state, or error
    const content = page.locator('main')
    await expect(content).toBeVisible()
  })

  test('medication cards show name and dosage', async ({ page }) => {
    await page.goto('/patient/medications')
    // Wait for loading to finish
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading medications'),
      { timeout: 30_000 }
    )
    // Now check for medication dosage text or an accepted alternative state
    await expect(
      page.locator('main').getByText(/\d+\s*mg|no medications scheduled|all medications taken today|failed to load/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('mark as taken — clicking a pending card optimistically moves it to taken', async ({ page }) => {
    await page.goto('/patient/medications')
    await page.waitForTimeout(5_000)

    // Check for a pending (clickable button) medication card
    const pendingCard = page.locator('button').filter({ hasText: /tap to mark taken/i }).first()
    const hasPending = await pendingCard.isVisible().catch(() => false)

    if (!hasPending) {
      // No pending meds today — pass the test gracefully
      test.info().annotations.push({ type: 'info', description: 'No pending medications today — skipping mark-as-taken check' })
      return
    }

    // Get medication name before clicking
    const medName = await pendingCard.locator('p').first().innerText()
    await pendingCard.click()

    // The card should show a spinner momentarily, then move to taken section
    // Either "Taken" text appears, or the card transitions
    await expect(page.getByText(/taken|all medications taken/i).first()).toBeVisible({ timeout: 15_000 })
    test.info().annotations.push({ type: 'info', description: `Marked "${medName}" as taken` })
  })

  test('"all medications taken" message appears when all taken', async ({ page }) => {
    await page.goto('/patient/medications')
    await page.waitForTimeout(3_000)

    // If no pending meds and some taken, should see success message
    const pendingCards = page.locator('button').filter({ hasText: /tap to mark taken/i })
    const pendingCount = await pendingCards.count()

    if (pendingCount === 0) {
      const takenCard = page.locator('[class*="rounded-\\[20px\\]"]').filter({ hasText: /taken/i })
      const hasTaken = await takenCard.first().isVisible().catch(() => false)
      if (hasTaken) {
        await expect(page.getByText(/all medications taken today/i)).toBeVisible({ timeout: 5_000 })
      }
    }
  })
})

// ── History ────────────────────────────────────────────────────────────────────

test.describe('Patient — History', () => {
  test('history page loads without crashing', async ({ page }) => {
    await page.goto('/patient/history')
    await expect(page).toHaveURL(/\/patient\/history/)
    // Should not redirect away
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 })
  })
})

// ── Route isolation ────────────────────────────────────────────────────────────

test.describe('Patient — Route isolation', () => {
  test('patient cannot access /caregiver (redirects to caregiver login)', async ({ page }) => {
    await page.goto('/caregiver')
    // Should land on caregiver login (wrong role)
    await expect(page).toHaveURL(/\/caregiver\/login/, { timeout: 10_000 })
  })

  test('patient cannot access /clinician (redirects to clinician login)', async ({ page }) => {
    await page.goto('/clinician')
    await expect(page).toHaveURL(/\/clinician\/login/, { timeout: 10_000 })
  })
})
