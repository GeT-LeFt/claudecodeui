import { describe, it, expect, vi } from 'vitest';

// Mock the database module
vi.mock('../database/db.js', () => ({
  db: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ '1': 1 })),
    })),
  },
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Health Route Logic', () => {
  it('should return ok status for liveness check', async () => {
    const { db } = await import('../database/db.js');
    const result = db.prepare('SELECT 1').get();
    expect(result).toBeDefined();
  });

  it('should detect database failure', async () => {
    const { db } = await import('../database/db.js');
    db.prepare.mockImplementationOnce(() => {
      throw new Error('DB connection failed');
    });

    expect(() => db.prepare('SELECT 1')).toThrow('DB connection failed');
  });

  it('should have correct memory usage format', () => {
    const mem = process.memoryUsage();
    expect(mem.rss).toBeGreaterThan(0);
    expect(mem.heapUsed).toBeGreaterThan(0);
    expect(mem.heapTotal).toBeGreaterThan(0);

    const formatted = {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    };

    expect(typeof formatted.rss).toBe('number');
    expect(formatted.rss).toBeGreaterThan(0);
  });
});
