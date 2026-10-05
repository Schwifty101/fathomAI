import { expect, test } from '@playwright/test'

// Runs signed out in a fresh browser context: exactly what a stranger gets.
// Needs the seeded data loaded (`npm run seed:load`, `npm run seed:clips`) except the 404 test.
test('meetings list shows seeded calls', async ({ page }) => {
  await page.goto('/meetings')
  await expect(page.getByRole('link', { name: /Q4 Product Planning/ })).toBeVisible()
  await expect(page.getByText(/of highlights/).first()).toBeVisible()
})

test('meeting page plays and the transcript follows', async ({ page }) => {
  await page.goto('/meetings/q4-planning')
  await expect(page.getByRole('heading', { name: 'Q4 Product Planning' })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByText(/^0:0[1-9] \/ /)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('tab', { name: 'Action items' }).click()
  await expect(page.getByText(/Jump to/).first()).toBeVisible()
})

test('summary templates switch without leaving the page', async ({ page }) => {
  await page.goto('/meetings/q4-planning')
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sales', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('search finds a moment and deep-links into the meeting', async ({ page }) => {
  await page.goto('/meetings')
  await page.getByRole('searchbox', { name: 'Search call recordings' }).fill('budget')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=budget/)
  const first = page.locator('a[href*="?t="]').first()
  await expect(first).toBeVisible()
  await first.click()
  await expect(page).toHaveURL(/\/meetings\/.+\?t=\d+/)
})

test('a suggested Ask answer appears with a citation', async ({ page }) => {
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'Summarize my recent meetings' }).click()
  await expect(page.locator('aside[aria-label="Ask Fathom"] a[href*="?t="]').first()).toBeVisible({ timeout: 15_000 })
})

test('Team Calls lists members and calls', async ({ page }) => {
  await page.goto('/team')
  await expect(page.getByRole('cell', { name: /Priya Raman/ })).toBeVisible()
})

test('a shared clip opens with no sign-in and has social metadata', async ({ page }) => {
  await page.goto('/clip/demo-q4-clip')
  await expect(page.getByText('Shared clip')).toBeVisible()
  await expect(page.getByRole('link', { name: 'View the full meeting' })).toBeVisible()
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
})

test('highlighting while signed out asks for sign-in and does not error', async ({ page }) => {
  await page.goto('/meetings/q4-planning')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: /^Insight/ }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()
})

test('unknown meeting and clip show the friendly 404', async ({ page }) => {
  await page.goto('/meetings/nope')
  await expect(page.getByText("We couldn't find that")).toBeVisible()
  await page.goto('/clip/nope-nope')
  await expect(page.getByText("We couldn't find that")).toBeVisible()
})
