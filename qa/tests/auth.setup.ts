import { test as setup, expect, chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const authDir = path.join(__dirname, '../playwright/.auth')
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

const PASSWORD = 'BaymaxDemo2026!'
const BASE = 'http://localhost:3000'

// Helper: sign in using a brand-new browser context so previous sessions
// never bleed through (Supabase uses both cookies and localStorage).
async function signIn(
  authFile: string,
  loginPath: string,
  email: string,
  password: string,
  dashPattern: RegExp,
  beforeFill?: (page: import('@playwright/test').Page) => Promise<void>
) {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${BASE}${loginPath}`)
  if (beforeFill) await beforeFill(page)
  // Fill email — patient uses a placeholder, others use a label
  const emailField = page.getByLabel(/email/i).or(page.getByPlaceholder(/name@example/i)).first()
  await emailField.fill(email)
  // Fill password — patient field has no label, only placeholder
  const passwordField = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i)).first()
  await passwordField.fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(dashPattern, { timeout: 20_000 })
  await context.storageState({ path: authFile })
  await browser.close()
}

setup('authenticate as patient', async () => {
  await signIn(
    path.join(authDir, 'patient.json'),
    '/patient/login',
    'patient@baymax.demo',
    PASSWORD,
    /localhost:3000\/patient$/,
    async (page) => {
      // Patient defaults to magic-link; toggle to password mode first
      await page.getByRole('button', { name: /use password instead/i }).click()
    }
  )
})

setup('authenticate as caregiver', async () => {
  await signIn(
    path.join(authDir, 'caregiver.json'),
    '/caregiver/login',
    'caregiver@baymax.demo',
    PASSWORD,
    /localhost:3000\/caregiver$/
  )
})

setup('authenticate as clinician', async () => {
  await signIn(
    path.join(authDir, 'clinician.json'),
    '/clinician/login',
    'clinician@baymax.demo',
    PASSWORD,
    /localhost:3000\/clinician$/
  )
})
