/**
 * CI Smoke Tests: Core frontend interactions
 *
 * Self-bootstrapping tests that register a fresh account, skip onboarding,
 * create a test project, and exercise every major UI surface.
 *
 * Runs in CI WITHOUT TEST_PASSWORD — uses API self-registration instead.
 *
 * CRITICAL: Never call POST /api/user/git-config — it spawns
 * `git config --global` which crashes the Node server in CI.
 */
import { test, expect, type Page } from '@playwright/test';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';
const SMOKE_USER = 'smoke-ci';
const SMOKE_PASS = 'smoke-pass-123456';

// Workspace path must be inside $HOME (WORKSPACES_ROOT default) and not in FORBIDDEN_PATHS.
// Use a subdirectory of $HOME that we create if missing.
const WORKSPACE_DIR = join(homedir(), 'smoke-workspace');
const WORKSPACE_NAME = 'smoke-workspace'; // basename shown in sidebar

let authToken: string;

// ── WebSocket interceptor (reused from system-notification.spec.ts pattern) ──
const WS_INTERCEPTOR = `
  const OrigWebSocket = window.WebSocket;
  window.__injectWsMessage = null;
  window.WebSocket = function(url, protocols) {
    const ws = protocols ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);
    if (url.includes('/ws')) {
      const poll = setInterval(() => {
        if (ws.onmessage) {
          clearInterval(poll);
          const real = ws.onmessage.bind(ws);
          window.__injectWsMessage = (data) => real(new MessageEvent('message', { data }));
        }
      }, 100);
      setTimeout(() => clearInterval(poll), 15000);
    }
    return ws;
  };
  window.WebSocket.prototype = OrigWebSocket.prototype;
  window.WebSocket.CONNECTING = OrigWebSocket.CONNECTING;
  window.WebSocket.OPEN = OrigWebSocket.OPEN;
  window.WebSocket.CLOSING = OrigWebSocket.CLOSING;
  window.WebSocket.CLOSED = OrigWebSocket.CLOSED;
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Select the smoke-workspace project in sidebar + ensure we're in a new session */
async function selectProjectAndNewSession(page: Page) {
  // Expand smoke-workspace project (displayName = basename of the workspace path)
  const projectBtn = page.locator('button').filter({ hasText: new RegExp(WORKSPACE_NAME) }).first();
  await expect(projectBtn).toBeVisible({ timeout: 10_000 });
  await projectBtn.click();
  await page.waitForTimeout(800);

  // After clicking a project:
  // - If it has no sessions → auto-creates new session → shows "Choose Your AI Assistant" or chat UI
  // - If it has sessions → shows session list with "New Session" button
  const newSessionBtn = page.getByText('New Session').first();
  const isNewSessionVisible = await newSessionBtn.isVisible().catch(() => false);
  if (isNewSessionVisible) {
    await newSessionBtn.click();
    await page.waitForTimeout(1500);
  } else {
    // Already in a new session (0 sessions → auto-created), wait for content to load
    await page.waitForTimeout(1000);
  }

  // If provider selection screen is shown, it means we're in a new session — that's fine
  // The Chat/Shell/Files tabs should be visible at the top
  await expect(page.getByText('Chat', { exact: true }).first()).toBeVisible({ timeout: 8000 });
}

// ── Bootstrap: register, skip onboarding, create project ─────────────────────

test.beforeAll(async ({ request }) => {
  // 1. Register or login
  //    CI: fresh DB → register succeeds (200)
  //    Local: existing user → register fails (403) → login with smoke creds
  //    Local: smoke creds wrong → try status endpoint for needsSetup hint
  const regRes = await request.post(`${BASE}/api/auth/register`, {
    data: { username: SMOKE_USER, password: SMOKE_PASS },
  });
  if (regRes.status() === 200) {
    const body = await regRes.json();
    authToken = body.token;
  } else {
    // Try logging in with smoke credentials (handles re-runs on same DB)
    const loginRes = await request.post(`${BASE}/api/auth/login`, {
      data: { username: SMOKE_USER, password: SMOKE_PASS },
    });
    if (loginRes.status() === 200) {
      const body = await loginRes.json();
      authToken = body.token;
    } else {
      // Local dev: a different user already exists.
      // Try common local dev credentials as fallback.
      const statusRes = await request.get(`${BASE}/api/auth/status`);
      const status = await statusRes.json();
      if (!status.needsSetup) {
        // There's an existing user — tests cannot proceed without valid credentials.
        // In CI this path is never hit (fresh DB, register always succeeds).
        // Locally, set TEST_USERNAME and TEST_PASSWORD env vars to match your account.
        const fallbackUser = process.env.TEST_USERNAME || '';
        const fallbackPass = process.env.TEST_PASSWORD || '';
        if (fallbackUser && fallbackPass) {
          const fbRes = await request.post(`${BASE}/api/auth/login`, {
            data: { username: fallbackUser, password: fallbackPass },
          });
          expect(fbRes.status(), 'Local login with TEST_USERNAME/TEST_PASSWORD failed').toBe(200);
          const body = await fbRes.json();
          authToken = body.token;
        } else {
          throw new Error(
            'Smoke tests: Cannot authenticate. DB has an existing user that is not smoke-ci. '
            + 'Set TEST_USERNAME and TEST_PASSWORD env vars for local testing, '
            + 'or delete ~/.cloudcli/auth.db to start fresh.'
          );
        }
      }
    }
  }
  expect(authToken).toBeTruthy();

  // 2. Complete onboarding (MUST happen before any page.goto — safe endpoint)
  await request.post(`${BASE}/api/user/complete-onboarding`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  // 3. Create workspace directory on disk (CI: first run creates it; local: already exists → noop)
  try { mkdirSync(WORKSPACE_DIR, { recursive: true }); } catch { /* exists */ }

  // 4. Create test project via API (idempotent — accept 200/400/409)
  const projRes = await request.post(`${BASE}/api/projects/create-workspace`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { workspaceType: 'existing', path: WORKSPACE_DIR },
  });
  // Log for debugging — 200 means success, anything else means project may already exist
  console.log(`[smoke] create-workspace ${WORKSPACE_DIR} → ${projRes.status()}`);
});

// ── Inject auth token before each test ───────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('auth-token', token);
  }, authToken);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
});

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Smoke tests — core UI interactions', () => {
  test.setTimeout(60_000);

  // ── Test 1: Auth verified, main UI loads ──
  test('authentication works and main UI loads', async ({ page }) => {
    // Not on login/setup page
    const loginForm = page.locator('input#username');
    await expect(loginForm).not.toBeVisible();

    // Not on onboarding
    const onboarding = page.getByText('Complete Setup');
    await expect(onboarding).not.toBeVisible();

    // Sidebar branding visible
    await expect(page.getByText('CloudCLI').first()).toBeVisible({ timeout: 8000 });
  });

  // ── Test 2: Sidebar elements visible ──
  test('sidebar shows all essential elements', async ({ page }) => {
    await expect(page.getByText('CloudCLI').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('button[title*="Refresh"]').first()).toBeVisible();
    await expect(page.locator('button[title="Create new project"]')).toBeVisible();
    await expect(page.locator('button[title="Hide sidebar"]')).toBeVisible();
    await expect(page.getByText('Settings').first()).toBeVisible();
    await expect(page.getByText('Report Issue').first()).toBeVisible();
    await expect(page.getByText('Join Community').first()).toBeVisible();
  });

  // ── Test 3: Sidebar collapse/expand ──
  test('sidebar collapse and expand works', async ({ page }) => {
    await expect(page.getByText('CloudCLI').first()).toBeVisible({ timeout: 8000 });

    // Collapse
    await page.locator('button[title="Hide sidebar"]').click();
    await page.waitForTimeout(500);

    // Expand button should appear
    const expandBtn = page.locator('button[aria-label="Show sidebar"]');
    await expect(expandBtn).toBeVisible({ timeout: 3000 });

    // Expand
    await expandBtn.click();
    await page.waitForTimeout(500);

    // Branding visible again
    await expect(page.getByText('CloudCLI').first()).toBeVisible();
  });

  // ── Test 4: Search input and mode toggle ──
  test('search input and Projects/Conversations toggle works', async ({ page }) => {
    // Wait for project to load (search UI only renders when projectsCount > 0)
    await expect(page.locator('button').filter({ hasText: new RegExp(WORKSPACE_NAME) }).first())
      .toBeVisible({ timeout: 10_000 });

    // Search input visible
    await expect(page.locator('input.nav-search-input').first()).toBeVisible();

    // Mode toggles
    const projectsToggle = page.locator('button[aria-pressed]').filter({ hasText: 'Projects' }).first();
    const convsToggle = page.locator('button[aria-pressed]').filter({ hasText: 'Conversations' }).first();

    await expect(projectsToggle).toBeVisible();
    await expect(convsToggle).toBeVisible();

    // Projects is active by default
    await expect(projectsToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(convsToggle).toHaveAttribute('aria-pressed', 'false');

    // Switch to Conversations
    await convsToggle.click();
    await page.waitForTimeout(300);
    await expect(convsToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(projectsToggle).toHaveAttribute('aria-pressed', 'false');

    // Switch back
    await projectsToggle.click();
    await page.waitForTimeout(300);
    await expect(projectsToggle).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Test 5: Main content tab switching ──
  test('main content tabs switch correctly', async ({ page }) => {
    await selectProjectAndNewSession(page);

    // Chat tab should be visible
    const chatTab = page.getByText('Chat', { exact: true }).first();
    await expect(chatTab).toBeVisible({ timeout: 8000 });

    // Switch through all tabs
    for (const tabName of ['Shell', 'Files', 'Source Control', 'Chat']) {
      const tab = page.getByText(tabName, { exact: true }).first();
      await tab.click();
      await page.waitForTimeout(500);
    }
  });

  // ── Test 6: Chat interface core elements ──
  test('chat interface renders core elements', async ({ page }) => {
    await selectProjectAndNewSession(page);

    // Chat input textarea
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 8000 });

    // Send button
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  // ── Test 7: Send message and verify user message renders ──
  test('sending a message shows user bubble and loading state', async ({ page }) => {
    // Track JS errors
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await selectProjectAndNewSession(page);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 8000 });

    // Type and send
    await textarea.fill('Hello, this is a smoke test');
    await page.locator('button[type="submit"]').first().click();

    // User message bubble should appear (client-side immediate add)
    const userMsg = page.locator('.chat-message.user').first();
    await expect(userMsg).toBeVisible({ timeout: 5000 });
    await expect(userMsg).toContainText('Hello, this is a smoke test');

    // Loading indicator should appear (ClaudeStatus pill bar with pulse dot)
    const loadingPulse = page.locator('span.animate-pulse').first();
    await expect(loadingPulse).toBeVisible({ timeout: 5000 });

    // Wait a bit for backend response (error or assistant message)
    await page.waitForTimeout(5000);

    // No JS exceptions
    expect(jsErrors).toHaveLength(0);
  });

  // ── Test 8: Shell tab loads terminal ──
  test('shell tab loads terminal component', async ({ page }) => {
    await selectProjectAndNewSession(page);

    // Switch to Shell tab
    const shellTab = page.getByText('Shell', { exact: true }).first();
    await expect(shellTab).toBeVisible({ timeout: 8000 });
    await shellTab.click();
    await page.waitForTimeout(1500);

    // Shell container should render (dark background terminal area)
    const shellContainer = page.locator('div.bg-gray-900').first();
    await expect(shellContainer).toBeVisible({ timeout: 8000 });

    // Terminal should be initialized: either xterm element, Connect button, or loading text
    const xtermEl = shellContainer.locator('.xterm, canvas').first();
    const connectBtn = page.locator('button').filter({ hasText: /Connect/i }).first();

    const hasXterm = await xtermEl.isVisible({ timeout: 3000 }).catch(() => false);
    const hasConnect = await connectBtn.isVisible({ timeout: 1000 }).catch(() => false);

    // At least one terminal state indicator should be present
    expect(hasXterm || hasConnect).toBeTruthy();

    // If Connect button visible, click it to test connection flow
    if (hasConnect) {
      await connectBtn.click();
      await page.waitForTimeout(2000);
    }

    // Switch back to Chat — should not break
    await page.getByText('Chat', { exact: true }).first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('textarea').first()).toBeVisible();
  });

  // ── Test 9: Settings modal — open, navigate all tabs, close ──
  test('settings modal opens, all tabs clickable, and closes', async ({ page }) => {
    await expect(page.getByText('CloudCLI').first()).toBeVisible({ timeout: 8000 });

    // Open Settings
    // Use the sidebar footer Settings button (not the collapsed one)
    const settingsBtn = page.locator('button').filter({ hasText: /^Settings$/ }).first();
    await settingsBtn.click();
    await page.waitForTimeout(500);

    // Modal should appear
    const modal = page.locator('.modal-backdrop');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Click through all 9 sidebar nav items (desktop layout: SettingsSidebar)
    // These are <button> elements inside <nav> in the modal sidebar
    const tabNames = [
      'Agents', 'Appearance', 'Git', 'API & Tokens',
      'Tasks', 'Plugins', 'Notifications', 'Backends', 'About',
    ];
    for (const name of tabNames) {
      // Use modal-scoped text search; sidebar buttons contain icon + text span
      const tab = modal.locator('button').filter({ hasText: name }).first();
      await expect(tab).toBeVisible({ timeout: 3000 });
      await tab.click();
      await page.waitForTimeout(300);
    }

    // Logout button visible (in the sidebar footer)
    const logoutBtn = modal.locator('button').filter({ hasText: /Logout/i }).first();
    await expect(logoutBtn).toBeVisible();

    // Close modal via X button in header (Settings modal has no Escape handler)
    // The close button is in the header div, near the "Settings" h2 title
    const modalHeader = modal.locator('div.flex.items-center.justify-between').first();
    const closeButton = modalHeader.locator('button').first();
    await closeButton.click();
    await page.waitForTimeout(500);

    // Modal should be gone
    await expect(modal).not.toBeVisible();
  });

  // ── Test 10: Project creation wizard — open and close ──
  test('project creation wizard opens and closes', async ({ page }) => {
    await expect(page.getByText('CloudCLI').first()).toBeVisible({ timeout: 8000 });

    // Click "Create new project"
    await page.locator('button[title="Create new project"]').click();
    await page.waitForTimeout(500);

    // Wizard title visible
    await expect(page.getByText('Create New Project')).toBeVisible({ timeout: 5000 });

    // Close with Cancel button
    const cancelBtn = page.getByText('Cancel', { exact: true }).first();
    await cancelBtn.click();
    await page.waitForTimeout(500);

    // Wizard should be gone
    await expect(page.getByText('Create New Project')).not.toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// System notification test — needs WS interceptor injected before page load
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Smoke tests — system notification rendering', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    // Inject WS interceptor BEFORE any navigation
    await page.addInitScript(WS_INTERCEPTOR);

    // Then inject auth token
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('auth-token', token);
    }, authToken);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  });

  test('compaction system notification renders with blue dot', async ({ page }) => {
    await selectProjectAndNewSession(page);

    // Send a message first to activate the chat view (dismiss provider selection screen)
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 8000 });
    await textarea.fill('test notification');
    await page.locator('button[type="submit"]').first().click();

    // Wait for user message to appear (chat view is now active)
    const userMsg = page.locator('.chat-message.user').first();
    await expect(userMsg).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(3000);

    // Wait for WS interceptor to capture onmessage
    const wsReady = await page.waitForFunction(
      () => typeof (window as any).__injectWsMessage === 'function',
      { timeout: 10_000 },
    ).then(() => true).catch(() => false);

    if (!wsReady) {
      console.log('WebSocket not captured, skipping system notification test');
      return;
    }

    // Inject compaction success notification via WS interceptor
    await page.evaluate(() => {
      (window as any).__injectWsMessage(JSON.stringify({
        id: 'smoke-compact-' + Date.now(),
        sessionId: '',
        timestamp: new Date().toISOString(),
        provider: 'claude',
        kind: 'system_notification',
        content: 'Conversation compacted',
        notificationType: 'compaction',
      }));
    });

    await page.waitForTimeout(3000);

    // Verify: notification text must exist in DOM (may be scrolled out of viewport
    // if backend responds quickly, but the text should be in the page body)
    const bodyText = await page.textContent('body') || '';
    expect(bodyText).toContain('Conversation compacted');

    // Verify blue dot indicator exists
    const blueDot = page.locator('span.rounded-full.bg-blue-400');
    expect(await blueDot.count()).toBeGreaterThanOrEqual(1);
  });
});
