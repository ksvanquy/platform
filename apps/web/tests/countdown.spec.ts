import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimeSyncManager } from '../src/utils/TimeSyncManager.js';

describe('Server-Authoritative Countdown Calculation Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should compute remaining seconds strictly against server-sealed deadline', () => {
    const timeSync = TimeSyncManager.getInstance();
    const serverEpoch = new Date('2026-09-04T10:00:00.000Z').getTime();
    timeSync.syncFromTimestamp(serverEpoch);

    const deadline = '2026-09-04T10:15:00.000Z'; // 15 phút làm bài
    const deadlineEpoch = new Date(deadline).getTime();

    const diffSeconds = Math.max(0, Math.floor((deadlineEpoch - timeSync.getNow()) / 1000));
    expect(diffSeconds).toBeGreaterThanOrEqual(899);
    expect(diffSeconds).toBeLessThanOrEqual(900);
  });

  it('should detect expiry when server time crosses deadline', () => {
    const timeSync = TimeSyncManager.getInstance();
    const serverEpoch = new Date('2026-09-04T10:15:05.000Z').getTime();
    timeSync.syncFromTimestamp(serverEpoch);

    const deadline = '2026-09-04T10:15:00.000Z';
    const deadlineEpoch = new Date(deadline).getTime();

    const diffSeconds = Math.max(0, Math.floor((deadlineEpoch - timeSync.getNow()) / 1000));
    expect(diffSeconds).toBe(0);
  });
});
