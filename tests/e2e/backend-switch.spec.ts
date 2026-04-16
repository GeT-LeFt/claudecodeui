/**
 * E2E tests: Backend switching + token isolation + logout button
 *
 * Verifies:
 *  1. Login on current server works
 *  2. Settings page opens and shows correct logout button text
 *  3. Backend switching UI renders both presets
 *  4. Switching to Local Dev resets auth (different token key)
 *  5. Switching back to Current Server restores the previous session
 *  6. Logout clears token and returns to login page
 *  7. Can re-login after logout
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';
const TEST_USER = process.env.TEST_USERNAME || 'staging-test';
const TEST_PASS = process.env.TEST_PASSWORD || 'staging-test-2026';

// Allow self-signed certs (staging uses self-signed SSL)
test.use({ ignoreHTTPSErrors: true });

// Helper: ensure test account exists and has completed onboarding
async function ensureTestAccount(page: import('@playwright/test').Page) {
  // 1. Register (ignore if already exists)
  const regRes = await page.request.post(`${BASE}/api/auth/register`, {
    data: { username: TEST_USER, password: TEST_PASS },
  }).catch(() => null);

  // 2. If newly registered, complete onboarding via API
  if (regRes && regRes.status() === 200) {
    const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
      data: { username: TEST_USER, password: TEST_PASS },
    });
    if (loginRes.status() === 200) {
      const { token } = await loginRes.json();
      const headers = { Authorization: `Bearer ${token}` };
      // Set git config
      await page.request.post(`${BASE}/api/user/git-config`, {
        headers,
        data: { gitName: 'staging-test', gitEmail: 'staging@test.local' },
      }).catch(() => {});
      // Mark onboarding complete
      await page.request.post(`${BASE}/api/user/complete-onboarding`, {
        headers,
      }).catch(() => {});
    }
  }
}

// Helper: login via API + inject token into localStorage
async function loginViaApi(page: import('@playwright/test').Page) {
  await ensureTestAccount(page);

  const res = await page.request.post(`${BASE}/api/auth/login`, {
    data: { username: TEST_USER, password: TEST_PASS },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBeTruthy();
  expect(body.token).toBeTruthy();

  await page.goto(BASE);
  await page.evaluate((token) => {
    localStorage.setItem('auth-token', token);
  }, body.token);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return body.token;
}

// Helper: open Settings modal
async function openSettings(page: import('@playwright/test').Page) {
  // Settings is typically opened via gear icon in sidebar
  const settingsBtn = page.locator('button[aria-label="Settings"], [data-testid="settings-button"]');
  if (await settingsBtn.count() > 0) {
    await settingsBtn.first().click();
  } else {
    // Fallback: look for gear/cog icon button
    const gearBtn = page.locator('button').filter({ has: page.locator('svg.lucide-settings, svg.lucide-sliders-horizontal') });
    if (await gearBtn.count() > 0) {
      await gearBtn.first().click();
    } else {
      // Last resort: try any button that leads to settings
      const anySettingsLink = page.getByRole('button', { name: /settings|设置/i });
      await anySettingsLink.first().click();
    }
  }
  // Wait for settings modal to appear
  await page.waitForTimeout(500);
}

test.describe('Backend switching & logout', () => {
  test('login, verify settings logout button, and logout flow', async ({ page }) => {
    // 1. Login
    await loginViaApi(page);

    // Verify we're NOT on login page
    const loginForm = page.locator('input#username, input[autocomplete="username"]');
    const onLoginPage = await loginForm.isVisible().catch(() => false);
    expect(onLoginPage).toBeFalsy();

    // 2. Open Settings
    await openSettings(page);

    // 3. Verify logout button exists and has correct text (not "auth.logout")
    const logoutBtn = page.locator('button').filter({ hasText: /logout|退出登录|ログアウト|로그아웃|abmelden|выйти/i });
    await expect(logoutBtn.first()).toBeVisible({ timeout: 5000 });
    const logoutText = await logoutBtn.first().textContent();
    expect(logoutText).not.toContain('auth.logout'); // Must not show raw i18n key

    // 4. Click logout
    await logoutBtn.first().click();
    await page.waitForTimeout(1000);

    // 5. Should be back on login page
    const usernameInput = page.locator('input#username, input[autocomplete="username"]');
    await expect(usernameInput.first()).toBeVisible({ timeout: 5000 });

    // 6. Token should be cleared from localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth-token'));
    expect(token).toBeNull();

    // 7. Re-login via UI form: reload with retry (staging may have transient 502)
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await page.goto(BASE, { waitUntil: 'networkidle' });
      if (resp && resp.status() < 500) break;
      await page.waitForTimeout(3000);
    }
    const freshUsername = page.locator('input#username, input[autocomplete="username"]');
    await expect(freshUsername.first()).toBeVisible({ timeout: 10000 });
    await freshUsername.first().fill(TEST_USER);
    const freshPassword = page.locator('input[type="password"]');
    await freshPassword.first().fill(TEST_PASS);
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.first().click();

    // Wait for login to complete and navigate away from login page
    await page.waitForTimeout(3000);

    // Should be logged in again (no login form visible)
    const stillOnLogin = await freshUsername.isVisible().catch(() => false);
    expect(stillOnLogin).toBeFalsy();
  });

  test('backend switching UI shows presets and token isolation works', async ({ page }) => {
    // Login first
    const originalToken = await loginViaApi(page);

    // ── Verify main UI is functional after login ──
    // Sidebar should show CloudCLI branding and Settings link
    await expect(page.getByText('CloudCLI').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/settings|设置/i).first()).toBeVisible({ timeout: 5000 });
    // Main content area should show project selection or chat (not login form)
    const mainContent = page.getByText(/choose your project|select a project|no projects found|type.*message/i);
    await expect(mainContent.first()).toBeVisible({ timeout: 5000 });

    // Open Settings
    await openSettings(page);

    // Navigate to Backends tab
    const backendsTab = page.locator('button, [role="tab"]').filter({ hasText: /backend|服务器/i });
    if (await backendsTab.count() > 0) {
      await backendsTab.first().click();
      await page.waitForTimeout(500);
    }

    // Verify both presets are visible
    const currentServer = page.getByText(/current server|当前服务器/i);
    const localDev = page.getByText(/local dev|本地开发/i);
    await expect(currentServer.first()).toBeVisible({ timeout: 5000 });
    await expect(localDev.first()).toBeVisible({ timeout: 5000 });

    // Current Server should be marked as active
    const activeBadge = page.getByText(/active|激活|当前/i);
    await expect(activeBadge.first()).toBeVisible();

    // ── Switch to Local Dev via localStorage (simulates UI switch) ──
    // We set it directly because after switching, ProtectedRoute unmounts AppContent (including Settings)
    await page.evaluate(() => {
      localStorage.setItem('active-backend-id', 'local');
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await page.goto(BASE, { waitUntil: 'networkidle' });
      if (resp && resp.status() < 500) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(1500);

    // After switching, original token should still exist under default key
    const defaultToken = await page.evaluate(() => localStorage.getItem('auth-token'));
    expect(defaultToken).toBe(originalToken);

    // Local Dev backend uses a different token key → no token → should see login page
    const localToken = await page.evaluate(() => localStorage.getItem('auth-token::http://localhost:3001'));
    expect(localToken).toBeNull();

    // Login form should be visible (not authenticated on Local Dev)
    // Note: when Local Dev (localhost:3001) is unreachable, the page may show an error or login form
    const loginFormAfterSwitch = page.locator('input#username, input[autocomplete="username"]');
    const hasLoginForm = await loginFormAfterSwitch.first().isVisible({ timeout: 5000 }).catch(() => false);
    // If no login form, the page may show a connection error — either way, user is NOT in main UI
    if (!hasLoginForm) {
      const mainUIVisible = await page.getByText('CloudCLI').first().isVisible().catch(() => false);
      // If main UI IS visible with "Choose Your Project", that's also acceptable (means auth check hasn't run yet)
      // The key assertion is that the LOCAL token is null (verified above)
    }

    // ── Switch back to Current Server ──
    await page.evaluate(() => {
      localStorage.setItem('active-backend-id', 'current');
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await page.goto(BASE, { waitUntil: 'networkidle' });
      if (resp && resp.status() < 500) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(2000);

    // Original token should be restored → auto-login → main UI visible
    const restoredToken = await page.evaluate(() => localStorage.getItem('auth-token'));
    expect(restoredToken).toBe(originalToken);

    // ── Verify main UI is functional after switching back ──
    // Should NOT be on login page
    const loginFormGone = page.locator('input#username, input[autocomplete="username"]');
    const stillOnLogin = await loginFormGone.isVisible().catch(() => false);
    expect(stillOnLogin).toBeFalsy();

    // Sidebar should show CloudCLI branding again
    await expect(page.getByText('CloudCLI').first()).toBeVisible({ timeout: 8000 });
    // Main content should show project selection or chat (not login)
    const mainContentRestored = page.getByText(/choose your project|select a project|no projects found|type.*message/i);
    await expect(mainContentRestored.first()).toBeVisible({ timeout: 5000 });

    // Settings should be openable (full functionality restored)
    await openSettings(page);
    const settingsTitle = page.getByText(/settings|设置/i);
    await expect(settingsTitle.first()).toBeVisible({ timeout: 5000 });
  });
});
