import { test, expect } from '@playwright/test'

test.describe('Caregiver - Vitals', () => {
  test('vitals page loads with heading', async ({ page }) => {
    await page.goto('/caregiver/vitals')
    await expect(page.getByText(/vitals tracker/i)).toBeVisible({ timeout: 15_000 })
  })

  test('save button is disabled until the form has a reading', async ({ page }) => {
    await page.goto('/caregiver/vitals')
    await expect(page.getByRole('button', { name: /save reading/i })).toBeDisabled({ timeout: 15_000 })
  })

  test('blood pressure mode shows systolic and diastolic inputs', async ({ page }) => {
    await page.goto('/caregiver/vitals')
    await page.selectOption('select', 'blood_pressure')
    await expect(page.getByPlaceholder(/138/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByPlaceholder(/86/i)).toBeVisible()
  })

  test('vitals nav link reaches the vitals screen', async ({ page }) => {
    await page.goto('/caregiver')
    await page.getByRole('link', { name: /vitals/i }).first().click()
    await expect(page).toHaveURL(/\/caregiver\/vitals/, { timeout: 10_000 })
  })
})
