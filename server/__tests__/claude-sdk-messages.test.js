import { describe, it, expect, vi } from 'vitest';

// Mock heavy dependencies so we can import handleSystemMessage without loading the full SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));
vi.mock('../database/db.js', () => ({ db: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) } }));
vi.mock('../utils/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}));

const { handleSystemMessage } = await import('../claude-sdk.js');

const SESSION_ID = 'test-session-123';

describe('handleSystemMessage', () => {
  // ─── 1. Status: compaction ───────────────────────────────────────
  describe('status / compaction', () => {
    it('returns compaction success notification', () => {
      const msg = { type: 'system', subtype: 'status', compact_result: 'success' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({
        kind: 'system_notification',
        content: 'Conversation compacted',
        notificationType: 'compaction',
        sessionId: SESSION_ID,
        provider: 'claude',
      });
    });

    it('returns compaction failure notification', () => {
      const msg = { type: 'system', subtype: 'status', compact_result: 'error' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.content).toBe('Conversation compaction failed');
      expect(result.notificationType).toBe('compaction');
    });
  });

  // ─── 1b. Status: compacting / requesting / null ──────────────────
  describe('status / progress', () => {
    it('returns compacting status', () => {
      const msg = { type: 'system', subtype: 'status', status: 'compacting' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({
        kind: 'status',
        text: 'Compacting conversation',
        canInterrupt: false,
      });
    });

    it('returns requesting status with canInterrupt=true', () => {
      const msg = { type: 'system', subtype: 'status', status: 'requesting' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({
        kind: 'status',
        text: 'Requesting',
        canInterrupt: true,
      });
    });

    it('returns clear status when status is null', () => {
      const msg = { type: 'system', subtype: 'status', status: null };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({ kind: 'status', sessionId: SESSION_ID });
      expect(result.text).toBeUndefined();
    });

    it('returns skip for unrecognized status value', () => {
      const msg = { type: 'system', subtype: 'status', status: 'unknown_value' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toBe('skip');
    });
  });

  // ─── 2. API retry ────────────────────────────────────────────────
  describe('api_retry', () => {
    it('returns retry notification with attempt info', () => {
      const msg = { type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 5, retry_delay_ms: 3000 };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({
        kind: 'system_notification',
        content: 'API retry (attempt 2/5, retrying in 3s)',
        notificationType: 'api_retry',
      });
    });

    it('handles missing fields gracefully', () => {
      const msg = { type: 'system', subtype: 'api_retry' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.content).toBe('API retry (attempt ?/?, retrying in 0s)');
    });
  });

  // ─── 3. Rate limit events ───────────────────────────────────────
  describe('rate_limit_event', () => {
    it('returns rejected rate limit with reset time', () => {
      const resetTs = Math.floor(Date.now() / 1000) + 300;
      const msg = { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: resetTs } };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.kind).toBe('system_notification');
      expect(result.notificationType).toBe('rate_limit');
      expect(result.content).toMatch(/^Rate limited — resets at /);
    });

    it('returns rejected rate limit with "soon" when no resetsAt', () => {
      const msg = { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.content).toBe('Rate limited — resets at soon');
    });

    it('returns allowed_warning with utilization percentage', () => {
      const msg = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', utilization: 0.85 } };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.content).toBe('Approaching rate limit (85% used)');
    });

    it('returns allowed_warning without percentage when utilization is null', () => {
      const msg = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning' } };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.content).toBe('Approaching rate limit');
    });

    it('returns skip for allowed status', () => {
      const msg = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toBe('skip');
    });

    it('returns skip when rate_limit_info is missing', () => {
      const msg = { type: 'rate_limit_event' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toBe('skip');
    });
  });

  // ─── 4. General notification ────────────────────────────────────
  describe('notification', () => {
    it('returns notification with text', () => {
      const msg = { type: 'system', subtype: 'notification', text: 'Session resumed' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({
        kind: 'system_notification',
        content: 'Session resumed',
        notificationType: 'notification',
      });
    });

    it('falls back to "Notification" when text is empty', () => {
      const msg = { type: 'system', subtype: 'notification' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.content).toBe('Notification');
    });
  });

  // ─── 5. Local command output ────────────────────────────────────
  describe('local_command_output', () => {
    it('returns command output notification', () => {
      const msg = { type: 'system', subtype: 'local_command_output', content: 'Total cost: $1.23' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({
        kind: 'system_notification',
        content: 'Total cost: $1.23',
        notificationType: 'command_output',
      });
    });

    it('returns empty string when content is missing', () => {
      const msg = { type: 'system', subtype: 'local_command_output' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.content).toBe('');
    });
  });

  // ─── 6. Session state changed ───────────────────────────────────
  describe('session_state_changed', () => {
    it('returns clear status on idle', () => {
      const msg = { type: 'system', subtype: 'session_state_changed', state: 'idle' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toMatchObject({ kind: 'status', sessionId: SESSION_ID });
    });

    it('returns skip for non-idle states', () => {
      const msg = { type: 'system', subtype: 'session_state_changed', state: 'busy' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result).toBe('skip');
    });
  });

  // ─── Non-system messages ────────────────────────────────────────
  describe('non-system messages', () => {
    it('returns null for assistant text messages', () => {
      const msg = { type: 'assistant', content: [{ type: 'text', text: 'Hello' }] };
      expect(handleSystemMessage(msg, SESSION_ID)).toBeNull();
    });

    it('returns null for result messages', () => {
      const msg = { type: 'result', duration_ms: 1000 };
      expect(handleSystemMessage(msg, SESSION_ID)).toBeNull();
    });

    it('returns null for tool_use messages', () => {
      const msg = { type: 'tool_use', name: 'Read', input: {} };
      expect(handleSystemMessage(msg, SESSION_ID)).toBeNull();
    });
  });

  // ─── Common field validation ────────────────────────────────────
  describe('common fields', () => {
    it('includes id, timestamp, and provider on every message', () => {
      const msg = { type: 'system', subtype: 'status', compact_result: 'success' };
      const result = handleSystemMessage(msg, SESSION_ID);
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^system_notification_/);
      expect(result.timestamp).toBeDefined();
      expect(result.provider).toBe('claude');
    });

    it('handles null session ID', () => {
      const msg = { type: 'system', subtype: 'status', compact_result: 'success' };
      const result = handleSystemMessage(msg, null);
      // createNormalizedMessage defaults null sessionId to ''
      expect(result.sessionId).toBe('');
    });
  });
});
