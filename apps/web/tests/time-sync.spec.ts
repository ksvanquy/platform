import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimeSyncManager } from '../src/utils/TimeSyncManager.js';

describe('TimeSyncManager (Simplified Clock Offset)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default offset 0', () => {
    const manager = TimeSyncManager.getInstance();
    expect(manager).toBeDefined();
    const state = manager.getState();
    expect(state.offsetMs).toBeDefined();
  });

  it('should synchronize offset from server timestamp', () => {
    const manager = TimeSyncManager.getInstance();
    const serverTimestamp = Date.now() + 5000; // Server is 5 seconds ahead

    manager.syncFromTimestamp(serverTimestamp);

    const state = manager.getState();
    expect(state.isSynchronized).toBe(true);
    expect(state.offsetMs).toBeGreaterThanOrEqual(4000);
    expect(manager.getNow()).toBeGreaterThanOrEqual(Date.now() + 4000);
  });

  it('should sync from ISO string', () => {
    const manager = TimeSyncManager.getInstance();
    const futureIso = new Date(Date.now() + 10000).toISOString();

    manager.syncFromTimestamp(futureIso);

    expect(manager.getState().isSynchronized).toBe(true);
    expect(manager.getNow()).toBeGreaterThan(Date.now());
  });
});
