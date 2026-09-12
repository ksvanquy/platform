import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimeSyncManager } from '../src/utils/TimeSyncManager.js';

describe('TimeSyncManager (Cristian Algorithm & Monotonic Anchor)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default monotonic anchor', () => {
    const manager = TimeSyncManager.getInstance();
    expect(manager).toBeDefined();
    const state = manager.getState();
    expect(state.serverAnchorMs).toBeGreaterThan(0);
    expect(state.perfAnchorMs).toBeGreaterThanOrEqual(0);
  });

  it('should synchronize with server using Cristian algorithm and RTT/2 compensation', async () => {
    const manager = TimeSyncManager.getInstance();

    // Mock global fetch for /v1/time
    const mockServerTimeIso = '2026-09-04T10:00:00.000Z';
    const mockServerTimestamp = new Date(mockServerTimeIso).getTime();

    const fetchMock = vi.fn().mockImplementation(async () => {
      // Giả lập độ trễ mạng 40ms
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        ok: true,
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === 'x-server-timestamp') return String(mockServerTimestamp);
            if (name.toLowerCase() === 'x-server-time') return mockServerTimeIso;
            return null;
          },
        },
        json: async () => ({
          success: true,
          serverTime: mockServerTimeIso,
          timestampMs: mockServerTimestamp,
        }),
      } as any;
    });

    globalThis.fetch = fetchMock;

    const syncState = await manager.syncWithServer('/v1/time');

    expect(syncState.isSynchronized).toBe(true);
    // Server estimated time must be >= serverTimestamp due to RTT/2 compensation
    expect(syncState.serverAnchorMs).toBeGreaterThanOrEqual(mockServerTimestamp);
    expect(syncState.rttMs).toBeGreaterThan(0);
  });

  it('should be 100% immune to local OS system clock changes (Clock Tampering Proof)', () => {
    const manager = TimeSyncManager.getInstance();
    const fixedServerTimestamp = 1750000000000; // Fixed server epoch

    manager.syncFromTimestamp(fixedServerTimestamp, 50);

    const time1 = manager.getNow();
    expect(time1).toBeGreaterThanOrEqual(fixedServerTimestamp);

    // Thí sinh cố tình chỉnh lùi đồng hồ hệ thống 10 giờ (Clock manipulation attempt)
    const originalDateNow = Date.now;
    try {
      Date.now = () => originalDateNow() - 10 * 3600 * 1000;

      // getNow() dựa trên performance.now() - hoàn toàn không bị ảnh hưởng!
      const timeAfterTampering = manager.getNow();
      expect(timeAfterTampering).toBeGreaterThanOrEqual(time1);
      // Sai lệch không thể bị lùi 10 tiếng
      expect(timeAfterTampering - time1).toBeLessThan(1000);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('should advance monotonically over time', async () => {
    const manager = TimeSyncManager.getInstance();
    manager.syncFromTimestamp(1750000000000, 20);

    const t1 = manager.getNow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const t2 = manager.getNow();

    expect(t2).toBeGreaterThanOrEqual(t1);
  });
});
