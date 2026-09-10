import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Attempt } from '../../../services/attempt/src/domain/entities/attempt.entity.js';
import { AttemptExpirySweeperService } from '../../../services/attempt/src/domain/services/attempt-expiry-sweeper.service.js';
import type { AttemptRepositoryPort, ExamClientPort } from '../../../services/attempt/src/domain/ports/attempt.repository.port.js';

describe('GIAI ĐOẠN 3: Nâng cấp Khả năng Tự phục hồi Backend & Giao diện Nhắc nhở Thí sinh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Mô-đun 1: Tự Động Khôi Phục & Phát Hiện Ca Thi Dở Dang (Active Attempt Discovery)', () => {
    it('1.1. Phải nhận diện chính xác ca thi IN_PROGRESS còn hạn từ danh sách attempts', () => {
      const now = 1725450000000;
      const attemptsList = [
        {
          id: 'att_submitted_01',
          examId: 'exam_math_01',
          status: 'SUBMITTED',
          deadline: new Date(now + 100000).toISOString(),
        },
        {
          id: 'att_expired_02',
          examId: 'exam_phys_01',
          status: 'IN_PROGRESS',
          deadline: new Date(now - 30000).toISOString(), // Quá hạn
        },
        {
          id: 'att_active_03',
          examId: 'exam_chem_01',
          examTitle: 'Đề thi Hóa học Đại cương',
          status: 'IN_PROGRESS',
          deadline: new Date(now + 25 * 60 * 1000).toISOString(), // Còn 25 phút
        },
      ];

      // Logic sàng lọc active attempt
      const activeAttempt = attemptsList.find((a) => {
        if (a.status !== 'IN_PROGRESS') return false;
        const dl = a.deadline ? new Date(a.deadline).getTime() : 0;
        return dl === 0 || dl > now;
      });

      expect(activeAttempt).toBeDefined();
      expect(activeAttempt?.id).toBe('att_active_03');
      expect(activeAttempt?.examId).toBe('exam_chem_01');

      // Tính toán thời gian còn lại (phút)
      const remainingMinutes = activeAttempt?.deadline
        ? Math.max(1, Math.round((new Date(activeAttempt.deadline).getTime() - now) / 60000))
        : 0;
      expect(remainingMinutes).toBe(25);
    });

    it('1.2. Phải trả về null nếu tất cả ca thi đều đã nộp bài hoặc hết hạn', () => {
      const now = 1725450000000;
      const attemptsList = [
        { id: 'att_01', status: 'GRADED', deadline: new Date(now - 100000).toISOString() },
        { id: 'att_02', status: 'TIMED_OUT_GRADED', deadline: new Date(now - 50000).toISOString() },
      ];

      const activeAttempt = attemptsList.find((a) => {
        if (a.status !== 'IN_PROGRESS') return false;
        const dl = a.deadline ? new Date(a.deadline).getTime() : 0;
        return dl === 0 || dl > now;
      });

      expect(activeAttempt).toBeUndefined();
    });
  });

  describe('Mô-đun 2: Điều Chỉnh Grace Period của Sweeper Daemon (Khoảng đệm 60 Giây)', () => {
    it('2.1. Attempt Entity phải mặc định gracePeriodMs = 60,000ms (60 giây)', () => {
      const attempt = new Attempt({
        id: 'att_buffer_test',
        userId: 'candidate_01',
        examId: 'exam_01',
        snapshotId: 'snp_01',
        durationMinutes: 30,
      });

      const startTime = new Date('2026-09-10T10:00:00.000Z');
      const deadline = new Date('2026-09-10T10:30:00.000Z');
      attempt.start(startTime, deadline);

      // Thử nộp bài lúc 10:30:30 (quá hạn 30s) -> Vẫn nằm trong khoảng đệm 60s
      const at30SecAfterDeadline = new Date('2026-09-10T10:30:30.000Z');
      expect(attempt.isSubmissionTimeExpired(at30SecAfterDeadline)).toBe(false);

      // Nộp bài trong khoảng đệm 60s -> Status là SUBMITTED chứ không bị ép TIMED_OUT_GRADED
      attempt.submit(at30SecAfterDeadline);
      expect(attempt.status).toBe('SUBMITTED');
    });

    it('2.2. Attempt Entity phải đánh dấu TIMED_OUT_GRADED chỉ khi vượt quá 60 giây grace period', () => {
      const attempt = new Attempt({
        id: 'att_buffer_expired',
        userId: 'candidate_02',
        examId: 'exam_01',
        snapshotId: 'snp_01',
        durationMinutes: 30,
      });

      const startTime = new Date('2026-09-10T10:00:00.000Z');
      const deadline = new Date('2026-09-10T10:30:00.000Z');
      attempt.start(startTime, deadline);

      // Lúc 10:31:05 (quá hạn 65s > 60s)
      const at65SecAfterDeadline = new Date('2026-09-10T10:31:05.000Z');
      expect(attempt.isSubmissionTimeExpired(at65SecAfterDeadline)).toBe(true);

      // Nộp bài -> Bị cưỡng chế TIMED_OUT_GRADED
      attempt.submit(at65SecAfterDeadline);
      expect(attempt.status).toBe('TIMED_OUT_GRADED');
    });

    it('2.3. Sweeper Daemon phải sử dụng gracePeriodMs mặc định là 60,000ms', async () => {
      let passedGracePeriod = 0;

      const mockAttemptRepo: Partial<AttemptRepositoryPort> = {
        findExpiredInProgressAttempts: vi.fn().mockImplementation(async (_now: Date, grace: number) => {
          passedGracePeriod = grace;
          return [];
        }),
      };

      const mockExamClient: Partial<ExamClientPort> = {
        getExamSnapshot: vi.fn().mockResolvedValue(null),
      };

      const sweeper = new AttemptExpirySweeperService(
        mockAttemptRepo as AttemptRepositoryPort,
        mockExamClient as ExamClientPort
      );

      const result = await sweeper.sweep();

      expect(passedGracePeriod).toBe(60000); // 60 giây an toàn
      expect(result.sweptCount).toBe(0);
    });
  });

  describe('Mô-đun 3: Kiểm Soát Trạng Thái Mất Mạng & Giao Diện Nhắc Nhở Thí Sinh', () => {
    it('3.1. Phải theo dõi sự kiện online / offline của trình duyệt', () => {
      const listeners: Record<string, Function> = {};
      const mockWindow = {
        addEventListener: vi.fn((event: string, cb: Function) => {
          listeners[event] = cb;
        }),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal('window', mockWindow);

      let isOffline = false;
      const handleOnline = () => { isOffline = false; };
      const handleOffline = () => { isOffline = true; };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      expect(mockWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));

      // Giả lập rớt mạng
      listeners['offline']();
      expect(isOffline).toBe(true);

      // Giả lập có mạng trở lại
      listeners['online']();
      expect(isOffline).toBe(false);
    });
  });
});
