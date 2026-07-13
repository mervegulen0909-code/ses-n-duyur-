import { test, expect } from '@playwright/test';

test('home page renders the hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Discover who sings/i })).toBeVisible();
});

test('nav exposes leaderboard and battle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Battle', exact: true })).toBeVisible();
});

test('login page shows the sign-in form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByPlaceholder('Email')).toBeVisible();
});

test('leaderboard renders', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
});

test('add performance requires sign-in when logged out', async ({ page }) => {
  await page.goto('/add');
  await expect(page.getByText('to add a performance')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'sign in' })).toBeVisible();
});

test('weekly league redirects signed-out visitors back through login', async ({ page }) => {
  await page.goto('/league');
  await expect(page).toHaveURL(/\/login\?next=(?:%2F|\/)league$/i);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('legal + dmca pages render', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await page.goto('/dmca');
  await expect(page.getByRole('heading', { name: /DMCA/i })).toBeVisible();
});
