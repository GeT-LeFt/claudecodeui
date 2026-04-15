/**
 * Playwright E2E test: system_notification (compaction) rendering.
 *
 * Generates a JWT from local auth.db, logs in, navigates into an existing
 * chat session, intercepts WebSocket, injects a fake compaction message,
 * and verifies the blue-dot notification renders.
 */
import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { homedir } from 'os';
import { existsSync } from 'fs';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5173';

function generateTestToken(): string | null {
  const dbPath = process.env.DATABASE_PATH || `${homedir()}/.cloudcli/auth.db`;
  if (!existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare("SELECT value FROM app_config WHERE key = 'jwt_secret'").get() as any;
    if (!row?.value) return null;
    const user = db.prepare('SELECT id, username FROM users WHERE is_active = 1 LIMIT 1').get() as any;
    if (!user) return null;
    return jwt.sign({ userId: user.id, username: user.username }, row.value, { expiresIn: '1h' });
  } finally {
    db.close();
  }
}

/** Monkey-patch WebSocket to capture the real onmessage handler */
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

test.describe('System notification (compaction) E2E', () => {
  let token: string | null = null;

  test.beforeAll(() => {
    token = generateTestToken();
  });

  async function loginAndNavigateToSession(page: any) {
    // 1. Register WS interceptor (runs before page JS)
    await page.addInitScript(WS_INTERCEPTOR);

    // 2. Navigate and set auth token
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t: string) => localStorage.setItem('auth-token', t), token);

    // 3. Reload so React picks up the token
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 4. Click the first project in sidebar
    const projectBtn = page.getByRole('button', { name: /@cloudcli-ai/ });
    if (await projectBtn.isVisible().catch(() => false)) {
      await projectBtn.click();
      await page.waitForTimeout(1500);

      // 5. Click the first existing session (not "New Session")
      //    Sessions have text like "会话压缩展示 Just now 538"
      const sessionButtons = page.locator('button').filter({
        hasNot: page.locator('text="New Session"'),
      });
      // Find a session button that has a timestamp indicator
      const allButtons = await page.locator('button').all();
      for (const btn of allButtons) {
        const text = await btn.textContent().catch(() => '') || '';
        // Session buttons contain time info like "Just now", "mins ago", "hours ago"
        if (text.match(/(Just now|ago|min|hour|day)/i) && !text.includes('New Session')) {
          await btn.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    }

    // 6. Wait for WS onmessage capture
    await page.waitForFunction(
      () => typeof (window as any).__injectWsMessage === 'function',
      { timeout: 10000 },
    ).catch(() => null);
  }

  test('compaction notification renders in chat UI', async ({ page }) => {
    test.setTimeout(60000);
    if (!token) { test.skip(true, 'Could not generate JWT'); return; }

    await loginAndNavigateToSession(page);

    // Verify WS captured
    const wsReady = await page.evaluate(() => typeof (window as any).__injectWsMessage === 'function');
    if (!wsReady) {
      await page.screenshot({ path: 'test-results/compaction-ws-debug.png', fullPage: true });
      console.log('WS not captured. Page body:', await page.evaluate(() => document.body.innerText.substring(0, 200)));
      test.fail(true, 'WebSocket not captured');
      return;
    }

    // Screenshot before injection
    await page.screenshot({ path: 'test-results/compaction-before.png', fullPage: true });

    // Inject compaction notification
    await page.evaluate(() => {
      (window as any).__injectWsMessage(JSON.stringify({
        id: 'e2e-compact-' + Date.now(),
        sessionId: '',
        timestamp: new Date().toISOString(),
        provider: 'claude',
        kind: 'system_notification',
        content: 'Conversation compacted',
        notificationType: 'compaction',
      }));
    });

    await page.waitForTimeout(2000);

    // Screenshot after injection
    await page.screenshot({ path: 'test-results/compaction-after.png', fullPage: true });

    // Verify notification text
    const bodyText = await page.textContent('body') || '';
    expect(bodyText).toContain('Conversation compacted');

    // Verify blue dot
    const blueDot = page.locator('span.rounded-full.bg-blue-400');
    expect(await blueDot.count()).toBeGreaterThanOrEqual(1);

    console.log('[PASS] Compaction notification rendered with blue dot');
  });

  test('failed compaction notification also renders', async ({ page }) => {
    test.setTimeout(60000);
    if (!token) { test.skip(true, 'no token'); return; }

    await loginAndNavigateToSession(page);

    const wsReady = await page.evaluate(() => typeof (window as any).__injectWsMessage === 'function');
    if (!wsReady) { test.fail(true, 'WebSocket not captured'); return; }

    // Inject failed compaction
    await page.evaluate(() => {
      (window as any).__injectWsMessage(JSON.stringify({
        id: 'e2e-compact-fail-' + Date.now(),
        sessionId: '',
        timestamp: new Date().toISOString(),
        provider: 'claude',
        kind: 'system_notification',
        content: 'Conversation compaction failed',
        notificationType: 'compaction',
      }));
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/compaction-failed-after.png', fullPage: true });

    const bodyText = await page.textContent('body') || '';
    expect(bodyText).toContain('Conversation compaction failed');

    console.log('[PASS] Failed compaction notification rendered');
  });
});
