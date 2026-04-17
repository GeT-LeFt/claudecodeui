// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  promises: { readdir: vi.fn() },
  default: { createReadStream: vi.fn(() => 'fake-stream') },
}));

// Helper: create an async iterable from an array of strings (simulates readline line-by-line)
function asyncIterable(lines) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return { async next() { return i < lines.length ? { value: lines[i++], done: false } : { done: true }; } };
    },
  };
}

vi.mock('readline', () => ({
  default: { createInterface: vi.fn() },
}));

vi.mock('os', () => ({ default: { homedir: () => '/fake/home' } }));
vi.mock('crypto', () => ({
  default: { createHash: vi.fn(() => ({ update: vi.fn().mockReturnThis(), digest: vi.fn(() => 'abc123') })) },
}));
vi.mock('sqlite3', () => ({ default: {} }));
vi.mock('sqlite', () => ({ open: vi.fn() }));
vi.mock('../sessionManager.js', () => ({ default: {} }));
vi.mock('../database/db.js', () => ({
  applyCustomSessionNames: vi.fn(),
  db: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
}));
vi.mock('../utils/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}));

const fs = (await import('fs')).promises;
const readline = (await import('readline')).default;
const { getSessionMessages } = await import('../projects.js');

// ─── Test Data Builders ─────────────────────────────────────────────────────

const SID = 'test-session';

function makeEntry(sessionId, ts, role, content) {
  return JSON.stringify({
    sessionId,
    timestamp: ts,
    message: { role, content },
  });
}

/** Shorthand for a normal assistant message */
const assistantMsg = (ts) => makeEntry(SID, ts, 'assistant', [{ type: 'text', text: `msg at ${ts}` }]);

/** Shorthand for an assistant tool_use message */
const toolUseMsg = (ts, toolId) =>
  makeEntry(SID, ts, 'assistant', [{ type: 'tool_use', id: toolId, name: 'Bash', input: {} }]);

/** Shorthand for a user tool_result message */
const toolResultMsg = (ts, toolId) =>
  makeEntry(SID, ts, 'user', [{ type: 'tool_result', tool_use_id: toolId, content: 'ok' }]);

/** Shorthand for a normal user text message */
const userMsg = (ts) => makeEntry(SID, ts, 'user', 'hello');

// ─── Setup ──────────────────────────────────────────────────────────────────

function setupJSONL(lines) {
  fs.readdir.mockResolvedValue(['session.jsonl']);
  readline.createInterface.mockReturnValue(asyncIterable(lines));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('getSessionMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all messages when limit=null (backward compat)', async () => {
    const lines = [
      assistantMsg('2024-01-01T00:00:01Z'),
      userMsg('2024-01-01T00:00:02Z'),
      assistantMsg('2024-01-01T00:00:03Z'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', SID, null, 0);
    // limit=null → returns raw array (not paginated envelope)
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('paginates from the end with limit and offset', async () => {
    // 6 messages, limit=2, offset=0 → should get last 2
    const lines = [
      userMsg('2024-01-01T00:00:01Z'),
      assistantMsg('2024-01-01T00:00:02Z'),
      userMsg('2024-01-01T00:00:03Z'),
      assistantMsg('2024-01-01T00:00:04Z'),
      userMsg('2024-01-01T00:00:05Z'),
      assistantMsg('2024-01-01T00:00:06Z'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', SID, 2, 0);
    expect(result.messages).toHaveLength(2);
    expect(result.total).toBe(6);
    expect(result.hasMore).toBe(true);
    // Should be the last 2 messages (timestamps 05, 06)
    expect(result.messages[0].timestamp).toBe('2024-01-01T00:00:05Z');
    expect(result.messages[1].timestamp).toBe('2024-01-01T00:00:06Z');
  });

  it('expands startIndex backwards to include tool_result at boundary (L10)', async () => {
    // Layout (sorted by timestamp):
    //   [0] user text
    //   [1] assistant text
    //   [2] assistant tool_use (tu_1)
    //   [3] user tool_result (tu_1)  ← should be pulled in
    //   [4] assistant text
    //   [5] user text
    // limit=2, offset=0 → naive startIndex=4, but [3] is a tool_result → expand to 3
    const lines = [
      userMsg('2024-01-01T00:00:01Z'),
      assistantMsg('2024-01-01T00:00:02Z'),
      toolUseMsg('2024-01-01T00:00:03Z', 'tu_1'),
      toolResultMsg('2024-01-01T00:00:04Z', 'tu_1'),
      assistantMsg('2024-01-01T00:00:05Z'),
      userMsg('2024-01-01T00:00:06Z'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', SID, 2, 0);
    // Naive: indices 4,5 (2 msgs). L10 fix: index 3 is tool_result → expand → indices 3,4,5 (3 msgs)
    expect(result.messages).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    // First message in page should be the tool_result
    expect(result.messages[0].message.content[0].type).toBe('tool_result');
  });

  it('expands backwards across multiple consecutive tool_results', async () => {
    // Layout:
    //   [0] user text
    //   [1] assistant text
    //   [2] user tool_result (tu_a)
    //   [3] user tool_result (tu_b)
    //   [4] assistant text
    //   [5] user text
    // limit=2, offset=0 → naive startIndex=4, msgs [3] is tool_result → expand,
    //   then [2] is also tool_result → expand again → startIndex=2
    const lines = [
      userMsg('2024-01-01T00:00:01Z'),
      assistantMsg('2024-01-01T00:00:02Z'),
      toolResultMsg('2024-01-01T00:00:03Z', 'tu_a'),
      toolResultMsg('2024-01-01T00:00:04Z', 'tu_b'),
      assistantMsg('2024-01-01T00:00:05Z'),
      userMsg('2024-01-01T00:00:06Z'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', SID, 2, 0);
    // Expanded from index 4 → 2, so 4 messages returned (indices 2,3,4,5)
    expect(result.messages).toHaveLength(4);
    expect(result.hasMore).toBe(true);
    expect(result.messages[0].message.content[0].type).toBe('tool_result');
    expect(result.messages[1].message.content[0].type).toBe('tool_result');
  });

  it('does not expand when boundary message is not a tool_result', async () => {
    // Layout: 6 normal messages, no tool_result at boundary
    const lines = [
      userMsg('2024-01-01T00:00:01Z'),
      assistantMsg('2024-01-01T00:00:02Z'),
      userMsg('2024-01-01T00:00:03Z'),
      assistantMsg('2024-01-01T00:00:04Z'),
      userMsg('2024-01-01T00:00:05Z'),
      assistantMsg('2024-01-01T00:00:06Z'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', SID, 3, 0);
    // No expansion needed → exactly 3 messages
    expect(result.messages).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });

  it('does not expand past index 0', async () => {
    // All messages are tool_results except the last
    const lines = [
      toolResultMsg('2024-01-01T00:00:01Z', 'tu_1'),
      toolResultMsg('2024-01-01T00:00:02Z', 'tu_2'),
      toolResultMsg('2024-01-01T00:00:03Z', 'tu_3'),
      assistantMsg('2024-01-01T00:00:04Z'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', SID, 1, 0);
    // Naive startIndex=3, [2] is tool_result → expand, [1] → expand, [0] → expand, stops at 0
    expect(result.messages).toHaveLength(4);
    expect(result.hasMore).toBe(false); // startIndex reached 0
  });

  it('hasMore is false when expansion pulls startIndex to 0', async () => {
    const lines = [
      toolResultMsg('2024-01-01T00:00:01Z', 'tu_1'),
      assistantMsg('2024-01-01T00:00:02Z'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', SID, 1, 0);
    // Naive startIndex=1, [0] is tool_result → expand to 0 → hasMore=false
    expect(result.messages).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });

  it('returns empty result for non-existent session', async () => {
    const lines = [
      // All messages belong to a different session
      makeEntry('other-session', '2024-01-01T00:00:01Z', 'user', 'hi'),
    ];
    setupJSONL(lines);

    const result = await getSessionMessages('proj', 'non-existent', 10, 0);
    expect(result.messages).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});
