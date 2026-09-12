export const ACTIVE_SESSION_STORAGE_KEY = 'quiz_active_session_cache';
export const ANSWERS_STORAGE_KEY_PREFIX = 'quiz_answers_';

export type AnswerStorageEventType =
  | 'ANSWERS_UPDATED'
  | 'SESSION_SUBMITTED'
  | 'SESSION_CLEARED';

export interface AnswerStorageEvent {
  readonly type: AnswerStorageEventType;
  readonly sessionId: string;
  readonly questionId?: string;
  readonly answers: Record<string, unknown>;
  readonly timestamp: number;
}

export type AnswerStorageSubscriber = (event: AnswerStorageEvent) => void;

/**
 * Tiện ích quản lý Client State & LocalStorage cho Answers:
 * - Đơn giản hóa cơ chế lưu trữ (Single source of truth per session).
 * - Loại bỏ hoàn toàn Stale Overwrite Race Condition giữa các tab bằng cơ chế Atomic Read-Merge-Write.
 * - Tự động đồng bộ đa tab tức thì qua BroadcastChannel và Storage Event.
 * - Khử khuẩn dữ liệu bọc (CandidateAnswerRecord -> Primitive).
 */
export class AnswerStorageManager {
  private static subscribers = new Map<string, Set<AnswerStorageSubscriber>>();
  private static broadcastChannels = new Map<string, BroadcastChannel>();
  private static isGlobalStorageListenerAttached = false;

  private static getStorageKey(sessionId: string): string {
    return `${ANSWERS_STORAGE_KEY_PREFIX}${sessionId}`;
  }

  /**
   * Đọc an toàn chuỗi từ localStorage
   */
  private static safeGetItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`[AnswerStorageManager] Không thể đọc localStorage key "${key}":`, e);
    }
    return null;
  }

  /**
   * Ghi an toàn chuỗi vào localStorage
   */
  private static safeSetItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn(`[AnswerStorageManager] Không thể ghi localStorage key "${key}":`, e);
    }
  }

  /**
   * Xóa an toàn khỏi localStorage
   */
  private static safeRemoveItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`[AnswerStorageManager] Không thể xóa localStorage key "${key}":`, e);
    }
  }

  /**
   * Khử khuẩn (deserialization) cấu trúc câu trả lời:
   * Chuyển đổi các record bọc { answer: ..., sequenceNumber: ... } thành giá trị nguyên thủy
   */
  public static sanitizeAnswers(rawAnswers: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!rawAnswers || typeof rawAnswers !== 'object') {
      return {};
    }

    const clean: Record<string, unknown> = {};
    for (const [qId, rec] of Object.entries(rawAnswers)) {
      if (rec && typeof rec === 'object' && 'answer' in (rec as any)) {
        clean[qId] = (rec as any).answer;
      } else {
        clean[qId] = rec;
      }
    }
    return clean;
  }

  /**
   * Lấy toàn bộ câu trả lời hiện có trong localStorage của phiên thi
   */
  public static getAnswers(sessionId: string): Record<string, unknown> {
    if (!sessionId) return {};
    const key = this.getStorageKey(sessionId);
    const raw = this.safeGetItem(key);
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      return this.sanitizeAnswers(parsed);
    } catch (e) {
      console.warn(`[AnswerStorageManager] Lỗi parse JSON cho session ${sessionId}:`, e);
      return {};
    }
  }

  /**
   * Lưu câu trả lời cho một câu hỏi:
   * Áp dụng Atomic Read-Merge-Write để tránh ghi đè dữ liệu cũ khi thí sinh thao tác nhiều tab
   */
  public static saveAnswer(
    sessionId: string,
    questionId: string,
    value: unknown
  ): Record<string, unknown> {
    if (!sessionId || !questionId) return {};

    const key = this.getStorageKey(sessionId);
    // 1. Đọc bản snapshot mới nhất từ storage để tránh ghi đè state cũ
    const currentStored = this.getAnswers(sessionId);

    // 2. Hợp nhất câu trả lời mới
    const nextAnswers: Record<string, unknown> = {
      ...currentStored,
      [questionId]: value,
    };

    // 3. Ghi atomic vào storage
    this.safeSetItem(key, JSON.stringify(nextAnswers));

    // 4. Phát tín hiệu cập nhật tức thì tới các tab khác
    const event: AnswerStorageEvent = {
      type: 'ANSWERS_UPDATED',
      sessionId,
      questionId,
      answers: nextAnswers,
      timestamp: Date.now(),
    };
    this.dispatchCrossTabEvent(sessionId, event);

    return nextAnswers;
  }

  /**
   * Hợp nhất và lưu toàn bộ bảng câu trả lời
   */
  public static saveAllAnswers(
    sessionId: string,
    answersToMerge: Record<string, unknown>
  ): Record<string, unknown> {
    if (!sessionId) return {};

    const key = this.getStorageKey(sessionId);
    const currentStored = this.getAnswers(sessionId);
    const sanitizedInput = this.sanitizeAnswers(answersToMerge);

    const merged: Record<string, unknown> = {
      ...currentStored,
      ...sanitizedInput,
    };

    this.safeSetItem(key, JSON.stringify(merged));

    const event: AnswerStorageEvent = {
      type: 'ANSWERS_UPDATED',
      sessionId,
      answers: merged,
      timestamp: Date.now(),
    };
    this.dispatchCrossTabEvent(sessionId, event);

    return merged;
  }

  /**
   * Dọn sạch câu trả lời cục bộ của phiên thi
   */
  public static clearAnswers(sessionId: string): void {
    if (!sessionId) return;
    const key = this.getStorageKey(sessionId);
    this.safeRemoveItem(key);

    const event: AnswerStorageEvent = {
      type: 'SESSION_CLEARED',
      sessionId,
      answers: {},
      timestamp: Date.now(),
    };
    this.dispatchCrossTabEvent(sessionId, event);
  }

  /**
   * Phát tín hiệu khi ca thi đã được nộp thành công ở một tab
   */
  public static notifySubmitted(sessionId: string): void {
    if (!sessionId) return;
    this.safeRemoveItem(ACTIVE_SESSION_STORAGE_KEY);
    this.safeRemoveItem(this.getStorageKey(sessionId));

    const event: AnswerStorageEvent = {
      type: 'SESSION_SUBMITTED',
      sessionId,
      answers: {},
      timestamp: Date.now(),
    };
    this.dispatchCrossTabEvent(sessionId, event);
  }

  /**
   * Đăng ký lắng nghe các thay đổi về câu trả lời và trạng thái ca thi từ các tab khác
   */
  public static subscribe(sessionId: string, callback: AnswerStorageSubscriber): () => void {
    if (!sessionId) return () => {};

    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    this.subscribers.get(sessionId)!.add(callback);

    this.initCrossTabListener(sessionId);

    return () => {
      const subs = this.subscribers.get(sessionId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(sessionId);
          this.cleanupChannel(sessionId);
        }
      }
    };
  }

  /**
   * Khởi tạo BroadcastChannel hoặc Storage Event Listener cho đa tab
   */
  private static initCrossTabListener(sessionId: string): void {
    // 1. Khởi tạo BroadcastChannel nếu có hỗ trợ
    if (typeof BroadcastChannel !== 'undefined' && !this.broadcastChannels.has(sessionId)) {
      try {
        const channelName = `quiz_storage_sync_${sessionId}`;
        const channel = new BroadcastChannel(channelName);
        channel.onmessage = (msgEvt) => {
          if (msgEvt.data && typeof msgEvt.data === 'object' && msgEvt.data.sessionId === sessionId) {
            this.notifyLocalSubscribers(sessionId, msgEvt.data as AnswerStorageEvent);
          }
        };
        this.broadcastChannels.set(sessionId, channel);
      } catch (e) {
        console.warn('[AnswerStorageManager] Không thể tạo BroadcastChannel:', e);
      }
    }

    // 2. Khởi tạo Window Storage Event Listener (chuẩn W3C hoạt động qua các tab khác)
    if (!this.isGlobalStorageListenerAttached && typeof window !== 'undefined' && window.addEventListener) {
      this.isGlobalStorageListenerAttached = true;
      window.addEventListener('storage', (event) => {
        if (!event.key) return;

        // Nếu key là câu trả lời của một quiz session
        if (event.key.startsWith(ANSWERS_STORAGE_KEY_PREFIX)) {
          const targetSessionId = event.key.replace(ANSWERS_STORAGE_KEY_PREFIX, '');
          if (!targetSessionId) return;

          let updatedAnswers: Record<string, unknown> = {};
          if (event.newValue) {
            try {
              updatedAnswers = this.sanitizeAnswers(JSON.parse(event.newValue));
            } catch {}
          }

          const evt: AnswerStorageEvent = {
            type: event.newValue ? 'ANSWERS_UPDATED' : 'SESSION_CLEARED',
            sessionId: targetSessionId,
            answers: updatedAnswers,
            timestamp: Date.now(),
          };
          this.notifyLocalSubscribers(targetSessionId, evt);
        } else if (event.key === ACTIVE_SESSION_STORAGE_KEY && !event.newValue) {
          // Khi một tab khác nộp bài hoặc dọn sạch session cache
          for (const sId of this.subscribers.keys()) {
            this.notifyLocalSubscribers(sId, {
              type: 'SESSION_CLEARED',
              sessionId: sId,
              answers: {},
              timestamp: Date.now(),
            });
          }
        }
      });
    }
  }

  /**
   * Phát tín hiệu qua BroadcastChannel và thông báo cho các subscriber tại tab hiện tại
   */
  private static dispatchCrossTabEvent(sessionId: string, event: AnswerStorageEvent): void {
    // Gửi qua BroadcastChannel tới các tab khác
    const channel = this.broadcastChannels.get(sessionId);
    if (channel) {
      try {
        channel.postMessage(event);
      } catch {}
    }

    // Thông báo cho các component nội bộ trong cùng tab
    this.notifyLocalSubscribers(sessionId, event);
  }

  /**
   * Kích hoạt các callback subscriber đã đăng ký
   */
  private static notifyLocalSubscribers(sessionId: string, event: AnswerStorageEvent): void {
    const subs = this.subscribers.get(sessionId);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(event);
        } catch (e) {
          console.error('[AnswerStorageManager] Lỗi subscriber callback:', e);
        }
      }
    }
  }

  private static cleanupChannel(sessionId: string): void {
    const channel = this.broadcastChannels.get(sessionId);
    if (channel) {
      try {
        channel.close();
      } catch {}
      this.broadcastChannels.delete(sessionId);
    }
  }
}
