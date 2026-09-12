/**
 * TimeSyncManager
 *
 * Tiện ích quản lý đồng hồ đơn giản hóa:
 * - Hỗ trợ lưu trữ độ lệch thời gian (clock offset) giữa Client và Server (nếu có).
 * - Cung cấp getNow() = Date.now() + offsetMs.
 */

export interface TimeSyncState {
  readonly offsetMs: number;
  readonly isSynchronized: boolean;
}

export class TimeSyncManager {
  private static instance: TimeSyncManager;
  private offsetMs: number = 0;
  private isSynchronized: boolean = false;

  private constructor() {}

  public static getInstance(): TimeSyncManager {
    if (!TimeSyncManager.instance) {
      TimeSyncManager.instance = new TimeSyncManager();
    }
    return TimeSyncManager.instance;
  }

  /**
   * Đồng bộ độ lệch từ mốc thời gian máy chủ (ISO string hoặc timestamp)
   */
  public syncFromTimestamp(serverTimestamp: number | string): void {
    const serverTimeMs = typeof serverTimestamp === 'string'
      ? new Date(serverTimestamp).getTime()
      : serverTimestamp;

    if (!isNaN(serverTimeMs)) {
      this.offsetMs = serverTimeMs - Date.now();
      this.isSynchronized = true;
    }
  }

  /**
   * Lấy thời gian Server ước lượng hiện tại
   */
  public getNow(): number {
    return Date.now() + this.offsetMs;
  }

  /**
   * Trả về trạng thái đồng bộ hiện tại
   */
  public getState(): TimeSyncState {
    return {
      offsetMs: this.offsetMs,
      isSynchronized: this.isSynchronized,
    };
  }
}
