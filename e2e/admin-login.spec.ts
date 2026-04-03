/**
 * E2E: Admin login and dashboard navigation.
 *
 * STORY-UI1: portal login/dashboard load
 * STORY-UI2: chat history and usage visibility
 *
 * Prerequisites:
 * - API running at localhost:4000 with seeded admin user
 * - Admin app running at localhost:5173
 * - Database with seed data via `npm run seed:admin`
 */
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_SEED_EMAIL ?? 'admin@nexclaw.dev';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? 'AdminP@ssw0rd!234';

test.describe('Admin Portal E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('STORY-UI1: login and reach dashboard', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    await expect(page.getByText('NexClaw Admin')).toBeVisible();
    await expect(page.getByText('Sign in to your admin account')).toBeVisible();

    // Fill login form
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Wait for dashboard to load
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('STORY-UI1: invalid login shows error', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 5_000 });
  });

  test('STORY-UI1: unauthenticated redirect to login', async ({ page }) => {
    // Clear cookies to ensure unauthenticated state
    await page.context().clearCookies();
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });

  test('STORY-UI2: navigate sidebar menu items', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    // Navigate to Chats
    await page.getByRole('link', { name: 'Chats' }).click();
    await expect(page).toHaveURL(/\/dashboard\/chats/);
    await expect(page.locator('main').getByRole('heading', { name: 'Chat History' })).toBeVisible();

    // Navigate to Usage
    await page.getByRole('link', { name: 'Usage' }).click();
    await expect(page).toHaveURL(/\/dashboard\/usage/);
    await expect(page.locator('main').getByRole('heading', { name: 'API Usage' })).toBeVisible();

    // Navigate to Skills
    await page.getByRole('link', { name: 'Skills' }).click();
    await expect(page).toHaveURL(/\/dashboard\/skills/);

    // Navigate to Settings
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
  });

  test('STORY-UI2: chat history page loads with filters', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    await page.getByRole('link', { name: 'Chats' }).click();
    await expect(page).toHaveURL(/\/dashboard\/chats/);

    // Verify filter controls exist
    await expect(page.getByPlaceholder('Search by ID or title')).toBeVisible();

    // Verify channel filter exists
    const channelSelect = page.locator('select').first();
    await expect(channelSelect).toBeVisible();
  });

  test('logout clears session and redirects', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    // Click sign out
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });

    // Verify can't access dashboard anymore
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
