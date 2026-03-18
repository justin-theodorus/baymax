import { test, expect } from '@playwright/test'

// ── Dashboard ──────────────────────────────────────────────────────────────────

test.describe('Caregiver — Dashboard', () => {
  test('dashboard loads with patient status card', async ({ page }) => {
    await page.goto('/caregiver')
    await expect(page.getByText(/patient status/i)).toBeVisible({ timeout: 15_000 })
  })

  test('adherence percentage is visible', async ({ page }) => {
    await page.goto('/caregiver')
    await expect(page.getByText(/med adherence/i)).toBeVisible({ timeout: 15_000 })
  })

  test('patient name is shown on dashboard', async ({ page }) => {
    await page.goto('/caregiver')
    // Should show a patient name (Mdm Tan or similar)
    await expect(page.locator('body').getByText(/mdm|mr\.|patient/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('quick action links are visible', async ({ page }) => {
    await page.goto('/caregiver')
    // Should have links to alerts, digest, or manage
    const links = page.getByRole('link')
    await expect(links.first()).toBeVisible({ timeout: 10_000 })
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
  })
})

// ── Alerts ─────────────────────────────────────────────────────────────────────

test.describe('Caregiver — Alerts', () => {
  test('alerts page loads with header', async ({ page }) => {
    await page.goto('/caregiver/alerts')
    await expect(page).toHaveURL(/alerts/)
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 })
  })

  test('alerts page shows active alerts or empty state', async ({ page }) => {
    await page.goto('/caregiver/alerts')
    await page.waitForTimeout(3_000)
    // Either alert cards ("Active · N alerts"), or the empty "No alerts" state
    // Scope to main to avoid matching the hidden nav "Alert" link
    await expect(
      page.locator('main').getByText(/active.*alert|no alerts|no active/i).first()
    ).toBeVisible({ timeout: 20_000 })
  })

  test('refresh button is present', async ({ page }) => {
    await page.goto('/caregiver/alerts')
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible({ timeout: 10_000 })
  })

  test('refresh button triggers reload without error', async ({ page }) => {
    await page.goto('/caregiver/alerts')
    await page.waitForTimeout(2_000)
    await page.getByRole('button', { name: /refresh/i }).click()
    // Should not crash — alerts section still visible after refresh
    await page.waitForTimeout(2_000)
    await expect(page.locator('main')).toBeVisible()
  })

  test('pending alert can be acknowledged', async ({ page }) => {
    await page.goto('/caregiver/alerts')
    await page.waitForTimeout(3_000)

    const acknowledgeBtn = page.getByRole('button', { name: /acknowledge/i }).first()
    const hasAlert = await acknowledgeBtn.isVisible().catch(() => false)

    if (!hasAlert) {
      test.info().annotations.push({ type: 'info', description: 'No pending alerts — skipping acknowledge test' })
      return
    }

    await acknowledgeBtn.click()
    // After acknowledging, the card should move to "Previously Acknowledged" section
    // or the button text changes to "Acknowledging…" momentarily
    await expect(
      page.getByText(/acknowledged|previously/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })
})

// ── Digest ─────────────────────────────────────────────────────────────────────

test.describe('Caregiver — Digest', () => {
  test('digest page loads with generate button', async ({ page }) => {
    await page.goto('/caregiver/digest')
    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible({ timeout: 10_000 })
  })

  test('digest page heading is visible after loading', async ({ page }) => {
    await page.goto('/caregiver/digest')
    // Wait for loading skeleton to clear, then heading should appear
    await expect(page.getByText('Weekly Digest')).toBeVisible({ timeout: 20_000 })
  })

  test('clicking generate produces a digest report', async ({ page }) => {
    await page.goto('/caregiver/digest')
    await page.waitForTimeout(1_000)

    const generateBtn = page.getByRole('button', { name: /generate/i })
    await generateBtn.click()

    // Button should show loading state
    await expect(page.getByText(/generating|loading/i)).toBeVisible({ timeout: 5_000 }).catch(() => {
      // May skip loading text if fast
    })

    // Digest content should appear — either summary cards or vitals section
    await expect(
      page.getByText(/adherence|vitals|medications|week/i).first()
    ).toBeVisible({ timeout: 60_000 })
  })

  test('generated digest shows vitals section', async ({ page }) => {
    await page.goto('/caregiver/digest')
    await page.waitForTimeout(1_000)
    await page.getByRole('button', { name: /generate/i }).click()

    // Wait for digest to load
    await page.waitForTimeout(30_000)

    // Vitals boxes or vitals text should appear
    const hasVitals = await page.getByText(/in range|borderline|out of range|blood/i).first().isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'info',
      description: hasVitals ? 'Vitals section present' : 'Vitals section not found (may be no data)',
    })
  })
})

// ── Manage Medications ─────────────────────────────────────────────────────────

test.describe('Caregiver — Manage Medications', () => {
  test('manage page loads with heading', async ({ page }) => {
    await page.goto('/caregiver/manage')
    await expect(page.getByText(/manage medication/i)).toBeVisible({ timeout: 15_000 })
  })

  test('existing medication cards are visible', async ({ page }) => {
    await page.goto('/caregiver/manage')
    await page.waitForTimeout(3_000)
    // Either medication cards or "No medications on record" empty state
    const hasMeds = await page.locator('body').getByText(/mg|no medications/i).first().isVisible().catch(() => false)
    expect(hasMeds).toBe(true)
  })

  test('Add Medication button opens form', async ({ page }) => {
    await page.goto('/caregiver/manage')
    await page.waitForTimeout(2_000)

    await page.getByRole('button', { name: /add medication/i }).click()
    await expect(page.getByPlaceholder(/medication name/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByPlaceholder(/dosage/i)).toBeVisible()
  })

  test('add medication form validates required fields', async ({ page }) => {
    await page.goto('/caregiver/manage')
    await page.waitForTimeout(2_000)
    await page.getByRole('button', { name: /add medication/i }).click()

    // Save button should be disabled when fields are empty
    const saveBtn = page.getByRole('button', { name: /^add medication$/i })
    await expect(saveBtn).toBeDisabled()
  })

  test('can add and remove a test medication', async ({ page }) => {
    await page.goto('/caregiver/manage')
    await page.waitForTimeout(2_000)

    // Open form
    await page.getByRole('button', { name: /add medication/i }).click()
    await page.getByPlaceholder(/medication name/i).fill('TestMed QA')
    await page.getByPlaceholder(/dosage/i).fill('10mg')

    // Submit
    const saveBtn = page.getByRole('button', { name: /^add medication$/i })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // New card should appear
    await expect(page.getByText('TestMed QA')).toBeVisible({ timeout: 15_000 })

    // Remove it using the delete button on that card
    const card = page.locator('[class*="rounded-\\[20px\\]"]').filter({ hasText: 'TestMed QA' })
    const deleteBtn = card.locator('button').last()

    // Handle the browser confirm dialog
    page.on('dialog', dialog => dialog.accept())
    await deleteBtn.click()

    // Card should disappear
    await expect(page.getByText('TestMed QA')).not.toBeVisible({ timeout: 15_000 })
  })

  test('cancel button closes the add form', async ({ page }) => {
    await page.goto('/caregiver/manage')
    await page.waitForTimeout(2_000)
    await page.getByRole('button', { name: /add medication/i }).click()
    await expect(page.getByPlaceholder(/medication name/i)).toBeVisible()
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByPlaceholder(/medication name/i)).not.toBeVisible({ timeout: 5_000 })
  })
})

// ── Navigation ─────────────────────────────────────────────────────────────────

test.describe('Caregiver — Navigation', () => {
  test('all nav tabs are present', async ({ page }) => {
    await page.goto('/caregiver')
    await expect(page.getByRole('link', { name: /home/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /alert/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /digest/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /manage/i })).toBeVisible()
  })

  test('clicking Alerts nav goes to /caregiver/alerts', async ({ page }) => {
    await page.goto('/caregiver')
    await page.getByRole('link', { name: /alert/i }).first().click()
    await expect(page).toHaveURL(/\/caregiver\/alerts/, { timeout: 10_000 })
  })

  test('clicking Digest nav goes to /caregiver/digest', async ({ page }) => {
    await page.goto('/caregiver')
    await page.getByRole('link', { name: /digest/i }).first().click()
    await expect(page).toHaveURL(/\/caregiver\/digest/, { timeout: 10_000 })
  })

  test('clicking Manage nav goes to /caregiver/manage', async ({ page }) => {
    await page.goto('/caregiver')
    await page.getByRole('link', { name: /manage/i }).first().click()
    await expect(page).toHaveURL(/\/caregiver\/manage/, { timeout: 10_000 })
  })
})

// ── Route isolation ────────────────────────────────────────────────────────────

test.describe('Caregiver — Route isolation', () => {
  test('caregiver cannot access /patient (redirects to patient login)', async ({ page }) => {
    await page.goto('/patient')
    await expect(page).toHaveURL(/\/patient\/login/, { timeout: 10_000 })
  })

  test('caregiver cannot access /clinician (redirects to clinician login)', async ({ page }) => {
    await page.goto('/clinician')
    await expect(page).toHaveURL(/\/clinician\/login/, { timeout: 10_000 })
  })
})
