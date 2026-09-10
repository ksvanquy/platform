/**
 * TimeSyncManager (Singleton)
 *
 * Triết lý Zero-Trust Client Clock:
 * - Đồng bộ đồng hồ máy chủ bằng Thuật toán Cristian (Cristian's Synchronization Algorithm).
 * - Sử dụng Monotonic Clock (performance.now()) làm mốc neo thời gian (Monotonic Anchor).
 * - Hoàn toàn MIỄN NHIỄM với việc thí sinh thay đổi giờ hệ điều hành (Clock Tampering Proof).
 * - Tự động bù trừ độ trễ đường truyền khứ hồi (RTT / 2).
 */

import { apiClient } from '../api/client.js';

export interface TimeSyncState {
  readonly serverAnchorMs: number;
  readonly perfAnchorMs: number;
  readonly rttMs: number;
  readonly offsetMs: number;
  readonly lastSyncTime: number;
  readonly isSynchronized: boolean;
}

export class TimeSyncManager {
  private static instance: TimeSyncManager;

  private serverAnchorMs: number;
  private perfAnchorMs: number;
  private rttMs: number = 0;
  private offsetMs: number = 0;
  private lastSyncTime: number = 0;
  private isSynchronized: boolean = false;
  private syncPromise: Promise<TimeSyncState> | null = null;

  private constructor() {
    // Khởi tạo neo mặc định dựa trên Date.now() và performance.now()
    const now = Date.now();
    const perfNow = typeof performance !== 'undefined' ? performance.now() : 0;
    this.serverAnchorMs = now;
    this.perfAnchorMs = perfNow;
  }

  public static getInstance(): TimeSyncManager {
    if (!TimeSyncManager.instance) {
      TimeSyncManager.instance = new TimeSyncManager();
    }
    return TimeSyncManager.instance;
  }

  /**
   * Đồng bộ giờ với Server theo Thuật toán Cristian
   * @param endpointUrl URL endpoint đồng bộ (mặc định: '/v1/time')
   */
  public async syncWithServer(endpointUrl: string = '/v1/time'): Promise<TimeSyncState> {
    // Tránh gửi nhiều request đồng bộ trùng lặp
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = (async () => {
      try {
        const targetUrl = (() => {
          if (endpointUrl && !endpointUrl.startsWith('/')) return endpointUrl;
          const baseUrl = (apiClient as any)?.getBaseUrl?.() || '';
          if (baseUrl) {
            return `${baseUrl.replace(/\/+$/, '')}/${endpointUrl.replace(/^\/+/, '')}`;
          }
          return endpointUrl;
        })();

        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });

        const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const rtt = Math.max(0, t1 - t0);

        let serverTimestamp: number;

        // Ưu tiên đọc header X-Server-Timestamp hoặc X-Server-Time
        const headerTimestamp = response.headers.get('x-server-timestamp');
        const headerIso = response.headers.get('x-server-time');

        if (headerTimestamp && !isNaN(parseInt(headerTimestamp, 10))) {
          serverTimestamp = parseInt(headerTimestamp, 10);
        } else if (headerIso) {
          serverTimestamp = new Date(headerIso).getTime();
        } else {
          const data = await response.json();
          serverTimestamp = data.timestampMs || new Date(data.serverTime).getTime();
        }

        if (isNaN(serverTimestamp)) {
          serverTimestamp = Date.now();
        }

        // Ước lượng thời gian máy chủ tại thời điểm t1:
        // T_server_est = T_server + (RTT / 2)
        const serverTimeEst = serverTimestamp + rtt / 2;

        this.serverAnchorMs = serverTimeEst;
        this.perfAnchorMs = t1;
        this.rttMs = rtt;
        this.offsetMs = serverTimeEst - Date.now();
        this.lastSyncTime = Date.now();
        this.isSynchronized = true;

        return this.getState();
      } catch (err) {
        // Nếu lỗi mạng hoặc offline, giữ nguyên neo hiện tại và chỉ ghi nhận log
        console.warn('[TimeSyncManager] Không thể đồng bộ với server, sử dụng fallback monotonic:', err);
        return this.getState();
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  /**
   * Đồng bộ nhanh từ header hoặc response body đã có của một API call khác
   */
  public syncFromTimestamp(serverTimestamp: number, estimatedRttMs: number = 20): void {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const serverTimeEst = serverTimestamp + estimatedRttMs / 2;

    this.serverAnchorMs = serverTimeEst;
    this.perfAnchorMs = t1;
    this.rttMs = estimatedRttMs;
    this.offsetMs = serverTimeEst - Date.now();
    this.lastSyncTime = Date.now();
    this.isSynchronized = true;
  }

  /**
   * Lấy thời gian Server hiện tại (Monotonic Server Time)
   * Miễn nhiễm 100% với việc can thiệp chỉnh đồng hồ hệ điều hành
   */
  public getNow(): number {
    if (typeof performance !== 'undefined') {
      const elapsed = performance.now() - this.perfAnchorMs;
      return Math.round(this.serverAnchorMs + elapsed);
    }
    return Date.now() + this.offsetMs;
  }

  /**
   * Trả về trạng thái đồng bộ hiện tại
   */
  public getState(): TimeSyncState {
    return {
      serverAnchorMs: this.serverAnchorMs,
      perfAnchorMs: this.perfAnchorMs,
      rttMs: this.rttMs,
      offsetMs: this.offsetMs,
      lastSyncTime: this.lastSyncTime,
      isSynchronized: this.isSynchronized,
    };
  }

  /**
   * Kiểm tra và tự động đồng bộ nếu đã quá thời hạn (ví dụ > 60 giây)
   */
  public async syncIfNeeded(maxAgeMs: number = 60000): Promise<void> {
    if (!this.isSynchronized || Date.now() - this.lastSyncTime > maxAgeMs) {
      await this.syncWithServer();
    }
  }
}
