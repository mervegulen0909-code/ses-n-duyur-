import { test, expect } from '@playwright/test';

test('home page renders the hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Discover who sings/i })).toBeVisible();
});

test('nav exposes leaderboard and battle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Battle' })).toBeVisible();
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

test('legal + dmca pages render', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await page.goto('/dmca');
  await expect(page.getByRole('heading', { name: /DMCA/i })).toBeVisible();
});

test('protected API rejects unauthenticated writes', async ({ request }) => {
  const res = await request.post('/api/votes', {
    data: {
      performanceId: '11111111-1111-1111-1111-111111111111',
      verifiedListenId: '22222222-2222-2222-2222-222222222222',
      ratings: { vocalAccuracy: 80 },
    },
  });
  expect(res.status()).toBe(401);
});
