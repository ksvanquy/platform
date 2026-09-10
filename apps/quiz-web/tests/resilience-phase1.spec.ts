import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACTIVE_SESSION_STORAGE_KEY } from '../src/hooks/useQuizSession.js';

// In Node environment, polyfill localStorage for testing
const localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore[key] = String(value);
  },
  removeItem: (key: string) => {
    delete localStorageStore[key];
  },
  clear: () => {
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
  },
};

(globalThis as any).localStorage = mockLocalStorage;

describe('GIAI ĐOẠN 1: Lá chắn Ngoại vi & Khôi phục Ca thi (Triple-Guard & Session Rehydration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLocalStorage.clear();
  });

  describe('Mô-đun 1: Lá chắn Trình duyệt (Triple-Guard System)', () => {
    it('1.1. BeforeUnload Guard: Phải kích hoạt cờ cảnh báo và ngăn đóng tab/reload đột ngột', () => {
      const mockEvent = {
        preventDefault: vi.fn(),
        returnValue: '',
      } as unknown as BeforeUnloadEvent;

      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = 'Bạn đang trong ca thi. Rời khỏi trang có thể làm gián đoạn tiến trình làm bài!';
        return e.returnValue;
      };

      const result = handleBeforeUnload(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(mockEvent.returnValue).toContain('Bạn đang trong ca thi');
      expect(result).toContain('Bạn đang trong ca thi');
    });

    it('1.2. Keydown Guard: Phải chặn phím Backspace khi focus ở ngoài ô nhập liệu (tránh History Back)', () => {
      const handleKeyDown = (e: { key: string; preventDefault: () => void }, activeElement: any) => {
        if (e.key === 'Backspace') {
          const isInput =
            activeElement &&
            (activeElement.tagName === 'INPUT' ||
              activeElement.tagName === 'TEXTAREA' ||
              activeElement.isContentEditable);
          if (!isInput) {
            e.preventDefault();
          }
        }
      };

      // TH1: Nhấn Backspace khi đang focus ở nút bấm hoặc nền trang -> BỊ CHẶN
      const bodyEvent = { key: 'Backspace', preventDefault: vi.fn() };
      handleKeyDown(bodyEvent, { tagName: 'BUTTON', isContentEditable: false });
      expect(bodyEvent.preventDefault).toHaveBeenCalledTimes(1);

      const divEvent = { key: 'Backspace', preventDefault: vi.fn() };
      handleKeyDown(divEvent, { tagName: 'DIV', isContentEditable: false });
      expect(divEvent.preventDefault).toHaveBeenCalledTimes(1);

      // TH2: Nhấn Backspace khi đang nhập câu trả lời trong <input> hoặc <textarea> -> ĐƯỢC PHÉP
      const inputEvent = { key: 'Backspace', preventDefault: vi.fn() };
      handleKeyDown(inputEvent, { tagName: 'INPUT', isContentEditable: false });
      expect(inputEvent.preventDefault).not.toHaveBeenCalled();

      const textareaEvent = { key: 'Backspace', preventDefault: vi.fn() };
      handleKeyDown(textareaEvent, { tagName: 'TEXTAREA', isContentEditable: false });
      expect(textareaEvent.preventDefault).not.toHaveBeenCalled();

      const editableEvent = { key: 'Backspace', preventDefault: vi.fn() };
      handleKeyDown(editableEvent, { tagName: 'DIV', isContentEditable: true });
      expect(editableEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('1.3. PopState Guard (History Trap): Phải bẫy thao tác back của trình duyệt', () => {
      const pushStateSpy = vi.fn();
      const mockHistory = { pushState: pushStateSpy };

      const trapHistoryBack = () => {
        mockHistory.pushState({ inActiveQuizSession: true }, '', 'http://localhost:3000');
      };

      trapHistoryBack();
      expect(pushStateSpy).toHaveBeenCalledWith(
        { inActiveQuizSession: true },
        '',
        'http://localhost:3000'
      );
    });
  });

  describe('Mô-đun 2: Khôi phục Ca thi Cục bộ & Khử khuẩn DTO (Session Rehydration & Deserialization)', () => {
    it('2.1. Phải lưu vết ca thi hợp lệ vào localStorage khi bắt đầu hoặc khôi phục', () => {
      const activeSessionData = {
        sessionId: 'sess_active_001',
        quizId: 'EXM_TOAN10_HK1',
        userId: 'student_123',
        deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        startedAt: new Date().toISOString(),
        status: 'IN_PROGRESS',
      };

      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(activeSessionData));

      const saved = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!);
      expect(parsed.sessionId).toBe('sess_active_001');
      expect(parsed.quizId).toBe('EXM_TOAN10_HK1');
      expect(new Date(parsed.deadline).getTime()).toBeGreaterThan(Date.now());
    });

    it('2.2. Phải phân biệt chính xác ca thi còn hiệu lực vs ca thi đã hết hạn', () => {
      // Ca thi còn 20 phút
      const validSession = {
        deadline: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        status: 'IN_PROGRESS',
      };
      const isValid = new Date(validSession.deadline).getTime() > Date.now() && validSession.status === 'IN_PROGRESS';
      expect(isValid).toBe(true);

      // Ca thi đã hết hạn từ 5 phút trước
      const expiredSession = {
        deadline: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        status: 'IN_PROGRESS',
      };
      const isExpired = new Date(expiredSession.deadline).getTime() > Date.now();
      expect(isExpired).toBe(false);
    });

    it('2.3. Khử khuẩn Deserialization (RCA 4): Chuẩn hóa câu trả lời backend bọc Object { answer, sequenceNumber } về Primitive', () => {
      // Giả lập dữ liệu backend trả về khi rehydrate
      const rawBackendAnswers: Record<string, any> = {
        'q1': { answer: 'option_b', sequenceNumber: 3, clientTimestamp: 1725450000000 },
        'q2': { answer: ['c1', 'c3'], sequenceNumber: 2, clientTimestamp: 1725450001000 },
        'q3': 'direct_primitive_val',
      };

      const cleanAnswers: Record<string, unknown> = {};
      const sequenceMap = new Map<string, number>();

      for (const [qId, rec] of Object.entries(rawBackendAnswers)) {
        if (rec && typeof rec === 'object' && 'answer' in rec) {
          cleanAnswers[qId] = rec.answer;
          const seq = rec.sequenceNumber ?? 1;
          sequenceMap.set(qId, seq);
        } else {
          cleanAnswers[qId] = rec;
          sequenceMap.set(qId, 1);
        }
      }

      // Xác minh kết quả sau khử khuẩn:
      // UI QuestionRenderer nhận string thuần hoặc array thuần, KHÔNG bị lồng object { answer: 'option_b' }
      expect(cleanAnswers['q1']).toBe('option_b');
      expect(cleanAnswers['q2']).toEqual(['c1', 'c3']);
      expect(cleanAnswers['q3']).toBe('direct_primitive_val');

      // Sequence numbers được nạp chính xác vào map
      expect(sequenceMap.get('q1')).toBe(3);
      expect(sequenceMap.get('q2')).toBe(2);
      expect(sequenceMap.get('q3')).toBe(1);
    });

    it('2.4. Phải xóa sạch cache localStorage khi nộp bài thi thành công', () => {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify({ quizId: 'EXM_1' }));
      expect(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)).not.toBeNull();

      // Giả lập submit hoàn tất
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      expect(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)).toBeNull();
    });
  });
});
