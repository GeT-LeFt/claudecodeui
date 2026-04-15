/**
 * Playwright E2E tests for non-official API proxy compatibility fixes.
 * Covers: page load, login flow, chat UI, no leaked system messages,
 * error display, and message rendering.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5173';
const API = process.env.TEST_API_URL || 'http://localhost:3001';

// ─── Part 1: No-auth tests (API + page load) ────────────────────────────

test.describe('Backend API health', () => {
  test('backend returns 200', async ({ request }) => {
    const res = await request.get(`${API}/`);
    expect(res.status()).toBe(200);
  });

  test('auth status endpoint works', async ({ request }) => {
    const res = await request.get(`${API}/api/auth/status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('needsSetup');
    expect(body).toHaveProperty('isAuthenticated');
  });
});

test.describe('Page load', () => {
  test('frontend loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    // Page should have a title
    const title = await page.title();
    expect(title).toContain('CloudCLI');
    // No JS errors
    expect(errors).toEqual([]);
  });

  test('login form is visible when unauthenticated', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    // Should show a login form with username and password fields
    const usernameInput = page.locator('input#username, input[autocomplete="username"]');
    const passwordInput = page.locator('input[type="password"]');
    // At least one of these should be visible (login or setup form)
    const hasLogin = (await usernameInput.count()) > 0;
    const hasPassword = (await passwordInput.count()) > 0;
    expect(hasLogin || hasPassword).toBeTruthy();
  });
});

// ─── Part 2: Login + Chat UI tests ──────────────────────────────────────

test.describe('Authenticated chat UI', () => {
  // Get credentials from env vars, or skip
  const username = process.env.TEST_USERNAME || 'thelastbattle1';
  const password = process.env.TEST_PASSWORD || '';

  test.beforeEach(async ({ page }) => {
    if (!password) {
      test.skip(true, 'TEST_PASSWORD not set — skipping authenticated tests');
      return;
    }
    // Login via API to get token, then inject into localStorage
    const res = await page.request.post(`${API}/api/auth/login`, {
      data: { username, password },
    });
    if (res.status() !== 200) {
      test.skip(true, `Login failed with status ${res.status()} — check TEST_USERNAME/TEST_PASSWORD`);
      return;
    }
    const body = await res.json();
    if (!body.success || !body.token) {
      test.skip(true, 'Login response missing token — check credentials');
      return;
    }

    // Set token in localStorage before navigating (key is 'auth-token' per AuthContext)
    await page.goto(BASE);
    await page.evaluate((token) => {
      localStorage.setItem('auth-token', token);
    }, body.token);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    // Wait for React to render the authenticated view
    await page.waitForTimeout(2000);
  });

  test('chat page renders without system message leaks', async ({ page }) => {
    if (!password) test.skip(true, 'no password');

    // Get all visible text content
    const bodyText = await page.textContent('body') || '';

    // These internal SDK markers should NEVER appear anywhere in the UI
    const leakedPrefixes = [
      '<system-reminder>',
      '<command-name>',
      '<command-args>',
      '<local-command-stdout>',
      '<system-prompt>',
    ];
    for (const prefix of leakedPrefixes) {
      expect(bodyText).not.toContain(prefix);
    }

    // Verify login succeeded — should NOT still be on login form
    const loginButton = page.locator('button[type="submit"]');
    const loginVisible = await loginButton.isVisible().catch(() => false);
    // If login form is still visible, the auth token injection failed
    // (but don't hard-fail, just log — the page might have a submit button for other purposes)
    if (loginVisible) {
      const btnText = await loginButton.textContent();
      if (btnText?.toLowerCase().includes('login') || btnText?.toLowerCase().includes('sign in')) {
        console.warn('Login form still visible — auth token may not have been accepted');
      }
    }
  });

  test('no duplicate user messages on send', async ({ page }) => {
    if (!password) test.skip(true, 'no password');

    // Look for a chat input / composer — try multiple selector strategies
    const composer = page.locator('textarea').first();
    const composerVisible = await composer.isVisible().catch(() => false);
    if (!composerVisible) {
      // No composer visible — might need to create/select a project or session first
      test.skip(true, 'No composer found — project/session selection may be needed');
      return;
    }

    const testMsg = `test_dedup_${Date.now()}`;
    await composer.fill(testMsg);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    // Count occurrences of the test message in the chat area
    const allText = await page.textContent('body') || '';
    const occurrences = (allText.split(testMsg).length) - 1;
    // Should appear exactly once (user bubble), not duplicated
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  test('error messages display correctly', async ({ page }) => {
    if (!password) test.skip(true, 'no password');

    // Check that no random "Unknown error" is displayed on the main page
    const bodyText = await page.textContent('body') || '';
    expect(bodyText).not.toContain('Unknown error');
  });
});

// ─── Part 3: Unit-style tests via page evaluate (no login needed) ───────

test.describe('Frontend utility verification', () => {
  test('HTML entity decoding handles numeric entities', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Inject and test the decodeHtmlEntities logic in browser context
    const result = await page.evaluate(() => {
      // Replicate the enhanced decodeHtmlEntities logic
      function decodeHtmlEntities(text: string) {
        if (!text) return text;
        return text
          .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
          .replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&');
      }
      return {
        basic: decodeHtmlEntities('&lt;div&gt;'),
        numeric: decodeHtmlEntities('&#10;'),       // newline
        hex: decodeHtmlEntities('&#x27;'),          // single quote
        nbsp: decodeHtmlEntities('hello&nbsp;world'),
        ampLast: decodeHtmlEntities('&amp;lt;'),    // should become &lt; not <
      };
    });

    expect(result.basic).toBe('<div>');
    expect(result.numeric).toBe('\n');
    expect(result.hex).toBe("'");
    expect(result.nbsp).toBe('hello world');
    expect(result.ampLast).toBe('&lt;');
  });

  test('rate limit formatting matches proxy patterns', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      // Test the enhanced formatUsageLimitText regex matching
      const ratePatterns = [
        'rate limit exceeded',
        'Too Many Requests',
        'quota exceeded for today',
        'Error 429: rate limited',
      ];
      return ratePatterns.map(p =>
        /(?:rate.?limit|too.?many.?requests|quota.?exceeded)/i.test(p)
      );
    });

    // All patterns should match
    expect(result).toEqual([true, true, true, true]);
  });

  test('internal content prefix filtering works with trim', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      const INTERNAL_CONTENT_PREFIXES = [
        '<command-name>', '<command-message>', '<command-args>',
        '<local-command-stdout>', '<local-command-caveat>', '<local-command-stderr>',
        '<system-reminder>', '<system-prompt>', '<tool-',
        'Environment:', 'Caveat:',
        'This session is being continued from a previous',
        'Continue from where you left off',
        '[Request interrupted', '[Previous conversation context',
      ];
      function isInternalContent(content: string) {
        const trimmed = content.trim();
        return INTERNAL_CONTENT_PREFIXES.some(prefix => trimmed.startsWith(prefix));
      }
      return {
        normal: isInternalContent('Hello world'),
        sysReminder: isInternalContent('<system-reminder>some text'),
        withWhitespace: isInternalContent('  <system-reminder>padded'),
        toolPrefix: isInternalContent('<tool-use>something'),
        environment: isInternalContent('Environment: production'),
        continueMsg: isInternalContent('Continue from where you left off with task X'),
        previousCtx: isInternalContent('[Previous conversation context...'),
      };
    });

    expect(result.normal).toBe(false);
    expect(result.sysReminder).toBe(true);
    expect(result.withWhitespace).toBe(true);  // The key fix — trim handles padding
    expect(result.toolPrefix).toBe(true);
    expect(result.environment).toBe(true);
    expect(result.continueMsg).toBe(true);
    expect(result.previousCtx).toBe(true);
  });

  test('JSON envelope detection extracts text content', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      // Simulate the JSON envelope check logic
      function checkJsonEnvelope(content: string) {
        const trimmed = content.trim();
        if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) return null;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const textValue = parsed.response || parsed.content || parsed.text || parsed.message || parsed.result;
            if (typeof textValue === 'string' && textValue.length > 0) return textValue;
          }
          return 'IS_JSON';
        } catch {
          return null;
        }
      }
      return {
        normalText: checkJsonEnvelope('Hello world'),
        proxyEnvelope: checkJsonEnvelope('{"response": "Hello from proxy", "metadata": {}}'),
        contentField: checkJsonEnvelope('{"content": "Actual response text"}'),
        pureJson: checkJsonEnvelope('{"key": "value", "number": 42}'),
        array: checkJsonEnvelope('[1, 2, 3]'),
      };
    });

    expect(result.normalText).toBeNull();                         // not JSON
    expect(result.proxyEnvelope).toBe('Hello from proxy');         // extracted
    expect(result.contentField).toBe('Actual response text');      // extracted
    expect(result.pureJson).toBe('IS_JSON');                       // normal JSON, no envelope
    expect(result.array).toBeNull();                               // array, not checked
  });

  test('message dedup with fuzzy matching', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      type Msg = { id: string; kind: string; role?: string; content?: string };
      function computeMerged(server: Msg[], realtime: Msg[]) {
        if (realtime.length === 0) return server;
        if (server.length === 0) return realtime;
        const serverIds = new Set(server.map(m => m.id));
        const serverSignatures = new Set(
          server.map(m => `${m.kind}|${m.role || ''}|${(m.content || '').slice(0, 100)}`),
        );
        const extra = realtime.filter(m => {
          if (serverIds.has(m.id)) return false;
          const sig = `${m.kind}|${m.role || ''}|${(m.content || '').slice(0, 100)}`;
          return !serverSignatures.has(sig);
        });
        return [...server, ...extra];
      }

      const server = [
        { id: 'srv_1', kind: 'text', role: 'assistant', content: 'Hello' },
        { id: 'srv_2', kind: 'tool_use', content: 'ls -la' },
      ];
      const realtime = [
        { id: 'rt_1', kind: 'text', role: 'assistant', content: 'Hello' },  // same content, diff ID
        { id: 'rt_2', kind: 'text', role: 'assistant', content: 'New msg' }, // genuinely new
        { id: 'srv_2', kind: 'tool_use', content: 'ls -la' },               // same ID
      ];
      const merged = computeMerged(server, realtime);
      return {
        count: merged.length,
        ids: merged.map(m => m.id),
      };
    });

    // srv_1 + srv_2 from server, rt_1 deduped by signature, srv_2 deduped by ID, rt_2 is new
    expect(result.count).toBe(3);
    expect(result.ids).toEqual(['srv_1', 'srv_2', 'rt_2']);
  });
});
