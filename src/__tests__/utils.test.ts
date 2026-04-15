import { describe, it, expect } from 'vitest';
import { isWildcardHost, isLoopbackHost, normalizeLoopbackHost, getConnectableHost } from '../../shared/networkHosts.js';

describe('networkHosts', () => {
  describe('isWildcardHost', () => {
    it('should identify 0.0.0.0 as wildcard', () => {
      expect(isWildcardHost('0.0.0.0')).toBe(true);
    });

    it('should identify :: as wildcard', () => {
      expect(isWildcardHost('::')).toBe(true);
    });

    it('should not identify localhost as wildcard', () => {
      expect(isWildcardHost('localhost')).toBe(false);
    });
  });

  describe('isLoopbackHost', () => {
    it('should identify localhost', () => {
      expect(isLoopbackHost('localhost')).toBe(true);
    });

    it('should identify 127.0.0.1', () => {
      expect(isLoopbackHost('127.0.0.1')).toBe(true);
    });

    it('should not identify external hosts', () => {
      expect(isLoopbackHost('192.168.1.1')).toBe(false);
    });
  });

  describe('getConnectableHost', () => {
    it('should return localhost for wildcard', () => {
      expect(getConnectableHost('0.0.0.0')).toBe('localhost');
    });

    it('should return localhost for loopback', () => {
      expect(getConnectableHost('127.0.0.1')).toBe('localhost');
    });

    it('should return original for external host', () => {
      expect(getConnectableHost('192.168.1.100')).toBe('192.168.1.100');
    });

    it('should return localhost for falsy input', () => {
      expect(getConnectableHost(null)).toBe('localhost');
      expect(getConnectableHost(undefined)).toBe('localhost');
    });
  });

  describe('normalizeLoopbackHost', () => {
    it('should normalize 127.0.0.1 to localhost', () => {
      expect(normalizeLoopbackHost('127.0.0.1')).toBe('localhost');
    });

    it('should preserve falsy input', () => {
      expect(normalizeLoopbackHost('')).toBe('');
      expect(normalizeLoopbackHost(null)).toBe(null);
    });
  });
});
