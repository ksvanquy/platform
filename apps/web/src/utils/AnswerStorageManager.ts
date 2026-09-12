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
 * Tiện ích quản lý LocalStorage & State cho câu trả lời:
 * - Đơn giản, trực quan, tin cậy.
 * - Lưu trữ câu trả lời theo từng phiên thi (`quiz_answers_{sessionId}`).
 * - Hỗ trợ chuẩn hóa dữ liệu bọc (deserialization).
 * - Đồng bộ đơn giản giữa các tab qua window `storage` event.
 */
export class AnswerStorageManager {
  private static subscribers = new Map<string, Set<AnswerStorageSubscriber>>();
  private static isStorageListenerAttached = false;

  private static getStorageKey(sessionId: string): string {
    return `${ANSWERS_STORAGE_KEY_PREFIX}${sessionId}`;
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
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.getStorageKey(sessionId)) : null;
      if (!raw) return {};
      return this.sanitizeAnswers(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  /**
   * Lưu câu trả lời cho một câu hỏi vào localStorage và phát event
   */
  public static saveAnswer(
    sessionId: string,
    questionId: string,
    value: unknown
  ): Record<string, unknown> {
    if (!sessionId || !questionId) return {};

    const key = this.getStorageKey(sessionId);
    const currentStored = this.getAnswers(sessionId);
    const nextAnswers: Record<string, unknown> = {
      ...currentStored,
      [questionId]: value,
    };

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(nextAnswers));
      }
    } catch (e) {
      console.warn('[AnswerStorageManager] Không thể lưu vào localStorage:', e);
    }

    const event: AnswerStorageEvent = {
      type: 'ANSWERS_UPDATED',
      sessionId,
      questionId,
      answers: nextAnswers,
      timestamp: Date.now(),
    };
    this.notifySubscribers(sessionId, event);

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

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(merged));
      }
    } catch (e) {
      console.warn('[AnswerStorageManager] Không thể lưu toàn bộ vào localStorage:', e);
    }

    const event: AnswerStorageEvent = {
      type: 'ANSWERS_UPDATED',
      sessionId,
      answers: merged,
      timestamp: Date.now(),
    };
    this.notifySubscribers(sessionId, event);

    return merged;
  }

  /**
   * Dọn sạch câu trả lời cục bộ của phiên thi
   */
  public static clearAnswers(sessionId: string): void {
    if (!sessionId) return;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.getStorageKey(sessionId));
      }
    } catch {}

    const event: AnswerStorageEvent = {
      type: 'SESSION_CLEARED',
      sessionId,
      answers: {},
      timestamp: Date.now(),
    };
    this.notifySubscribers(sessionId, event);
  }

  /**
   * Phát tín hiệu khi ca thi đã được nộp thành công
   */
  public static notifySubmitted(sessionId: string): void {
    if (!sessionId) return;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        localStorage.removeItem(this.getStorageKey(sessionId));
      }
    } catch {}

    const event: AnswerStorageEvent = {
      type: 'SESSION_SUBMITTED',
      sessionId,
      answers: {},
      timestamp: Date.now(),
    };
    this.notifySubscribers(sessionId, event);
  }

  /**
   * Đăng ký lắng nghe các thay đổi về câu trả lời và trạng thái ca thi
   */
  public static subscribe(sessionId: string, callback: AnswerStorageSubscriber): () => void {
    if (!sessionId) return () => {};

    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    this.subscribers.get(sessionId)!.add(callback);

    this.ensureStorageListener();

    return () => {
      const subs = this.subscribers.get(sessionId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(sessionId);
        }
      }
    };
  }

  /**
   * Lắng nghe sự kiện Storage chuẩn của trình duyệt (đồng bộ giữa các tabs)
   */
  private static ensureStorageListener(): void {
    if (this.isStorageListenerAttached || typeof window === 'undefined' || !window.addEventListener) {
      return;
    }

    this.isStorageListenerAttached = true;
    window.addEventListener('storage', (event) => {
      if (!event.key) return;

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
        this.notifySubscribers(targetSessionId, evt);
      } else if (event.key === ACTIVE_SESSION_STORAGE_KEY && !event.newValue) {
        for (const sId of this.subscribers.keys()) {
          this.notifySubscribers(sId, {
            type: 'SESSION_CLEARED',
            sessionId: sId,
            answers: {},
            timestamp: Date.now(),
          });
        }
      }
    });
  }

  /**
   * Thông báo tới các subscriber
   */
  private static notifySubscribers(sessionId: string, event: AnswerStorageEvent): void {
    const subs = this.subscribers.get(sessionId);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(event);
        } catch (e) {
          console.error('[AnswerStorageManager] Subscriber error:', e);
        }
      }
    }
  }
}

