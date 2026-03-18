import { test, expect } from '@playwright/test'

// ── Patient List ───────────────────────────────────────────────────────────────

test.describe('Clinician — Patient List', () => {
  test('patient list page loads with heading', async ({ page }) => {
    await page.goto('/clinician')
    await expect(page.getByText(/my patients/i)).toBeVisible({ timeout: 10_000 })
  })

  test('exactly 3 patient "View Report" links are visible', async ({ page }) => {
    await page.goto('/clinician')
    const reportLinks = page.getByRole('link', { name: /view report/i })
    await expect(reportLinks.first()).toBeVisible({ timeout: 15_000 })
    await expect(reportLinks).toHaveCount(3, { timeout: 15_000 })
  })

  test('patient cards show names and conditions', async ({ page }) => {
    await page.goto('/clinician')
    await page.waitForTimeout(2_000)
    // Should see patient names including Mdm Tan
    await expect(page.getByText(/Tan|Lim|Kamala|Nair/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('patient cards show age or condition info', async ({ page }) => {
    await page.goto('/clinician')
    await page.waitForTimeout(2_000)
    // Conditions like Diabetes, Hypertension, or age numbers
    await expect(
      page.getByText(/diabetes|hypertension|heart|osteoarthritis|age|\d{2} yr/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('nav tabs — Patients and Reports — are visible', async ({ page }) => {
    await page.goto('/clinician')
    await expect(page.getByRole('link', { name: /patients/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /reports/i })).toBeVisible()
  })
})

// ── Patient Report ─────────────────────────────────────────────────────────────

test.describe('Clinician — Report', () => {
  test('clicking first View Report navigates to /clinician/report/:id', async ({ page }) => {
    await page.goto('/clinician')
    const firstLink = page.getByRole('link', { name: /view report/i }).first()
    await expect(firstLink).toBeVisible({ timeout: 15_000 })
    await firstLink.click()
    await expect(page).toHaveURL(/\/clinician\/report\//, { timeout: 10_000 })
  })

  test('report page shows breadcrumb with "Patients" link', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).first().click()
    await expect(page.getByRole('link', { name: /patients/i }).first()).toBeVisible({ timeout: 10_000 })
  })

  test('report page shows patient name in breadcrumb', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).first().click()
    await page.waitForURL(/\/clinician\/report\//)
    // Breadcrumb should have "/ Patient Name"
    await expect(page.getByText(/mdm|mr\.|nair/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('report page shows AI-generated content within 25s', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).first().click()
    await expect(
      page.getByText(/ai-generated|vitals|in range|borderline|adherence|summary/i).first()
    ).toBeVisible({ timeout: 25_000 })
  })

  test('breadcrumb Patients link navigates back to list', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).first().click()
    await page.waitForURL(/\/clinician\/report\//)
    await page.getByRole('link', { name: /patients/i }).first().click()
    await expect(page).toHaveURL(/\/clinician$/, { timeout: 10_000 })
  })

  test('second patient report also loads', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).nth(1).click()
    await expect(page).toHaveURL(/\/clinician\/report\//, { timeout: 10_000 })
    await expect(
      page.getByText(/ai-generated|vitals|in range|borderline|adherence|summary/i).first()
    ).toBeVisible({ timeout: 25_000 })
  })

  test('third patient report also loads', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).nth(2).click()
    await expect(page).toHaveURL(/\/clinician\/report\//, { timeout: 10_000 })
    await expect(
      page.getByText(/ai-generated|vitals|in range|borderline|adherence|summary/i).first()
    ).toBeVisible({ timeout: 25_000 })
  })

  test('/clinician/report (no id) redirects back to /clinician', async ({ page }) => {
    await page.goto('/clinician/report')
    await expect(page).toHaveURL(/\/clinician$/, { timeout: 10_000 })
  })
})

// ── Report content ─────────────────────────────────────────────────────────────

test.describe('Clinician — Report content', () => {
  test('report shows vitals gauge boxes or "no data" message', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).first().click()
    await expect(page).toHaveURL(/\/clinician\/report\//)
    await expect(
      page.locator('main').getByText(/in range|borderline|out of range|mmol|mmhg|bpm|no vitals|no data/i).first()
    ).toBeVisible({ timeout: 25_000 })
  })

  test('report shows medication adherence section', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).first().click()
    await expect(page).toHaveURL(/\/clinician\/report\//)
    await expect(
      page.locator('main').getByText(/adherence|taken|medication/i).first()
    ).toBeVisible({ timeout: 25_000 })
  })

  test('report shows AI disclaimer', async ({ page }) => {
    await page.goto('/clinician')
    await page.getByRole('link', { name: /view report/i }).first().click()
    await expect(page).toHaveURL(/\/clinician\/report\//)
    // Use first() to avoid strict mode — there may be multiple "ai-generated" matches
    await expect(page.getByText(/ai-generated/i).first()).toBeVisible({ timeout: 20_000 })
  })
})

// ── Route isolation ────────────────────────────────────────────────────────────

test.describe('Clinician — Route isolation', () => {
  test('clinician cannot access /patient (redirects to patient login)', async ({ page }) => {
    await page.goto('/patient')
    await expect(page).toHaveURL(/\/patient\/login/, { timeout: 10_000 })
  })

  test('clinician cannot access /caregiver (redirects to caregiver login)', async ({ page }) => {
    await page.goto('/caregiver')
    await expect(page).toHaveURL(/\/caregiver\/login/, { timeout: 10_000 })
  })
})
