import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimeSyncManager } from '../src/utils/TimeSyncManager.js';

describe('Server-Authoritative Countdown Calculation Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should compute remaining seconds strictly against server-sealed deadline', () => {
    const timeSync = TimeSyncManager.getInstance();
    // Giả sử Server Time đang là 10:00:00
    const serverEpoch = new Date('2026-09-04T10:00:00.000Z').getTime();
    timeSync.syncFromTimestamp(serverEpoch, 10);

    const deadline = '2026-09-04T10:15:00.000Z'; // 15 phút làm bài
    const deadlineEpoch = new Date(deadline).getTime();

    const diffSeconds = Math.max(0, Math.floor((deadlineEpoch - timeSync.getNow()) / 1000));
    // Khoảng 15 phút = 900 giây (sai số ms nhỏ < 1s)
    expect(diffSeconds).toBeGreaterThanOrEqual(899);
    expect(diffSeconds).toBeLessThanOrEqual(900);
  });

  it('should detect expiry when server monotonic time crosses deadline', () => {
    const timeSync = TimeSyncManager.getInstance();
    // Giả sử Server Time đã là 10:15:05 (quá hạn 5s)
    const serverEpoch = new Date('2026-09-04T10:15:05.000Z').getTime();
    timeSync.syncFromTimestamp(serverEpoch, 10);

    const deadline = '2026-09-04T10:15:00.000Z';
    const deadlineEpoch = new Date(deadline).getTime();

    const diffSeconds = Math.max(0, Math.floor((deadlineEpoch - timeSync.getNow()) / 1000));
    expect(diffSeconds).toBe(0);
  });

  it('should remain accurate even if local Date.now() is shifted', () => {
    const timeSync = TimeSyncManager.getInstance();
    const serverEpoch = new Date('2026-09-04T10:00:00.000Z').getTime();
    timeSync.syncFromTimestamp(serverEpoch, 10);

    const deadline = '2026-09-04T10:10:00.000Z';
    const deadlineEpoch = new Date(deadline).getTime();

    const initialDiff = Math.max(0, Math.floor((deadlineEpoch - timeSync.getNow()) / 1000));

    // Thí sinh thay đổi giờ OS
    const origDateNow = Date.now;
    try {
      Date.now = () => 0; // Epoch 1970
      const tamperedDiff = Math.max(0, Math.floor((deadlineEpoch - timeSync.getNow()) / 1000));
      // Không bị nhảy lên 56 năm! Vẫn giữ nguyên ~600 giây
      expect(Math.abs(tamperedDiff - initialDiff)).toBeLessThanOrEqual(1);
    } finally {
      Date.now = origDateNow;
    }
  });
});
