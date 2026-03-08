/**
 * E2E: Skill enable/disable flow in admin portal.
 *
 * STORY-UI3: skill enable/disable
 *
 * This test stubs API responses in-browser so the UI behavior is verified
 * independently of backend fixture state.
 */
import { test, expect } from '@playwright/test';

test.describe('Skills Toggle E2E', () => {
  test('STORY-UI3: enable then disable a skill', async ({ page }) => {
    let enabled = false;
    let patchCalls = 0;

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              id: 'admin-1',
              email: 'admin@example.com',
              role: 'admin',
              displayName: 'Admin User',
            },
          },
        }),
      });
    });

    await page.route('**/api/v1/skills**', async (route) => {
      const req = route.request();
      const method = req.method();
      const url = new URL(req.url());

      if (method === 'GET' && url.pathname === '/api/v1/skills') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'skill-1',
                slug: 'sample-skill',
                displayName: 'Sample Skill',
                description: 'Sample skill for UI toggle test.',
                sourceType: 'uploaded',
                enabled,
                currentVersion: '1.0.0',
                latestVetting: 'passed',
              },
            ],
          }),
        });
        return;
      }

      if (method === 'PATCH' && url.pathname === '/api/v1/skills/skill-1/enabled') {
        patchCalls += 1;
        const rawBody = req.postData() ?? '{}';
        const body = JSON.parse(rawBody) as { enabled?: boolean };
        enabled = body.enabled ?? false;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'skill-1',
              slug: 'sample-skill',
              displayName: 'Sample Skill',
              description: 'Sample skill for UI toggle test.',
              sourceType: 'uploaded',
              enabled,
              currentVersion: '1.0.0',
              latestVetting: 'passed',
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/dashboard/skills');
    await expect(page.locator('main').getByRole('heading', { name: 'Skills' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sample Skill' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Enable' }).first().click();
    await page.getByRole('button', { name: 'Enable' }).nth(1).click();

    await expect.poll(() => patchCalls).toBe(1);
    await expect(page.getByRole('button', { name: 'Disable' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Disable' }).first().click();
    await page.getByRole('button', { name: 'Disable' }).nth(1).click();

    await expect.poll(() => patchCalls).toBe(2);
    await expect(page.getByRole('button', { name: 'Enable' }).first()).toBeVisible();
  });
});
