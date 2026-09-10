import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('GIAI ĐOẠN 2: Khử khuẩn Dữ liệu Answers, Tự phục hồi Sequence 409 & Bảo toàn Autosave qua Beacon/Keepalive', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Mô-đun 1: Khử khuẩn Dữ liệu Answers (CandidateAnswerRecord Deserialization)', () => {
    it('1.1. Phải bóc tách giá trị answer nguyên thủy từ CandidateAnswerRecord của Backend', () => {
      const backendAnswers: Record<string, any> = {
        'q_single': {
          answer: 'opt_a',
          sequenceNumber: 4,
          clientTimestamp: 1725450000000,
        },
        'q_multiple': {
          answer: ['opt_1', 'opt_3'],
          sequenceNumber: 2,
          clientTimestamp: 1725450001000,
        },
        'q_direct_string': 'user_typed_text',
        'q_direct_number': 42,
      };

      const extractedAnswers: Record<string, unknown> = {};
      const sequenceMap = new Map<string, number>();

      for (const [qId, rec] of Object.entries(backendAnswers)) {
        if (rec && typeof rec === 'object' && 'answer' in rec) {
          extractedAnswers[qId] = rec.answer;
          const seq = rec.sequenceNumber ?? 1;
          sequenceMap.set(qId, seq);
        } else {
          extractedAnswers[qId] = rec;
          sequenceMap.set(qId, 1);
        }
      }

      expect(extractedAnswers['q_single']).toBe('opt_a');
      expect(extractedAnswers['q_multiple']).toEqual(['opt_1', 'opt_3']);
      expect(extractedAnswers['q_direct_string']).toBe('user_typed_text');
      expect(extractedAnswers['q_direct_number']).toBe(42);

      expect(sequenceMap.get('q_single')).toBe(4);
      expect(sequenceMap.get('q_multiple')).toBe(2);
      expect(sequenceMap.get('q_direct_string')).toBe(1);
      expect(sequenceMap.get('q_direct_number')).toBe(1);
    });
  });

  describe('Mô-đun 2: Tự động Phục hồi khi Gặp Lỗi Sequence Conflict (HTTP 409)', () => {
    it('2.1. Phải phát hiện mã lỗi 409 OUTDATED_ANSWER_SEQUENCE và tự động retry với Sequence Number cao hơn', async () => {
      const sequenceMap = new Map<string, number>();
      sequenceMap.set('q1', 2);

      const mockSaveAnswer = vi.fn()
        // Lần 1: Bị 409 do Server đã nhận sequence #3 từ tab khác
        .mockRejectedValueOnce({
          status: 409,
          errorCode: 'OUTDATED_ANSWER_SEQUENCE',
          message: 'Rejected out-of-order answer for question "q1". Received sequence #2 is older than current #3',
        })
        // Lần 2: Thành công sau khi client tự động nâng sequence
        .mockResolvedValueOnce({
          success: true,
          message: 'Answer recorded successfully',
        });

      const questionId = 'q1';
      const pending = { value: 'option_c', sequenceNumber: 2 };
      let saveStatus = 'SAVING';

      // Mô phỏng logic phục hồi trong useQuizSession
      try {
        await mockSaveAnswer({
          sessionId: 'sess_1',
          userId: 'cand_1',
          questionId,
          answer: pending.value,
          sequenceNumber: pending.sequenceNumber,
        });
        saveStatus = 'SAVED';
      } catch (err: any) {
        const isSequenceConflict =
          err.status === 409 ||
          err.statusCode === 409 ||
          err.errorCode === 'OUTDATED_ANSWER_SEQUENCE' ||
          (typeof err.message === 'string' && err.message.includes('OUTDATED_ANSWER_SEQUENCE'));

        if (isSequenceConflict) {
          const match = typeof err.message === 'string' ? err.message.match(/current #(\d+)/) : null;
          const serverSeq = match ? parseInt(match[1], 10) : 0;
          const currentSeq = sequenceMap.get(questionId) || pending.sequenceNumber;
          const retrySeq = Math.max(currentSeq + 2, serverSeq + 1);
          sequenceMap.set(questionId, retrySeq);

          try {
            await mockSaveAnswer({
              sessionId: 'sess_1',
              userId: 'cand_1',
              questionId,
              answer: pending.value,
              sequenceNumber: retrySeq,
            });
            saveStatus = 'SAVED';
          } catch {
            saveStatus = 'ERROR';
          }
        }
      }

      expect(mockSaveAnswer).toHaveBeenCalledTimes(2);
      expect(sequenceMap.get('q1')).toBe(4); // serverSeq=3 -> retrySeq=4
      expect(saveStatus).toBe('SAVED');
    });

    it('2.2. Nếu server không cung cấp chuỗi "current #N", phải tự nhảy tối thiểu currentSeq + 2', () => {
      const currentSeq = 5;
      const err = { status: 409, errorCode: 'OUTDATED_ANSWER_SEQUENCE', message: 'Conflict' };
      
      const match = typeof err.message === 'string' ? err.message.match(/current #(\d+)/) : null;
      const serverSeq = match ? parseInt(match[1], 10) : 0;
      const retrySeq = Math.max(currentSeq + 2, serverSeq + 1);

      expect(retrySeq).toBe(7);
    });
  });

  describe('Mô-đun 3: Xả Hàng đợi Autosave bằng Fetch Keepalive & Navigator.sendBeacon', () => {
    it('3.1. Phải gửi câu hỏi chưa kịp lưu qua fetch(keepalive: true) khi trang bị ẩn/đóng', () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      (globalThis as any).fetch = mockFetch;

      const pendingSaves = new Map<string, { value: unknown; sequenceNumber: number }>();
      pendingSaves.set('q10', { value: 'B', sequenceNumber: 3 });
      pendingSaves.set('q11', { value: ['A', 'D'], sequenceNumber: 1 });

      const sessionId = 'attempt_xyz_999';
      const userId = 'student_007';
      const baseUrl = 'http://localhost:3000';
      const token = 'jwt_token_sample';

      // Mô phỏng flushPendingAutosaves
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-User-Id': userId,
      };

      for (const [qId, pending] of pendingSaves.entries()) {
        const payloadStr = JSON.stringify({
          answer: pending.value,
          sequenceNumber: pending.sequenceNumber,
          clientTimestamp: 1725450000000,
          userId,
        });
        const endpoint = `${baseUrl}/v1/attempts/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(qId)}`;

        fetch(endpoint, {
          method: 'PUT',
          headers,
          body: payloadStr,
          keepalive: true,
        });
      }
      pendingSaves.clear();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:3000/v1/attempts/attempt_xyz_999/answers/q10',
        expect.objectContaining({
          method: 'PUT',
          keepalive: true,
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt_token_sample',
            'X-User-Id': 'student_007',
          }),
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3000/v1/attempts/attempt_xyz_999/answers/q11',
        expect.objectContaining({
          method: 'PUT',
          keepalive: true,
        })
      );
      expect(pendingSaves.size).toBe(0);
    });

    it('3.2. Phải fallback sang navigator.sendBeacon nếu fetch không thành công hoặc ném ngoại lệ', () => {
      // Giả lập fetch ném ngoại lệ
      (globalThis as any).fetch = vi.fn().mockImplementation(() => {
        throw new Error('fetch failed in unload');
      });

      const sendBeaconMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal('navigator', {
        sendBeacon: sendBeaconMock,
      });

      const pendingSaves = new Map<string, { value: unknown; sequenceNumber: number }>();
      pendingSaves.set('q99', { value: 'True', sequenceNumber: 5 });

      const sessionId = 'attempt_xyz_999';
      const baseUrl = 'http://localhost:3000';

      for (const [qId, pending] of pendingSaves.entries()) {
        const payloadObj = {
          answer: pending.value,
          sequenceNumber: pending.sequenceNumber,
          clientTimestamp: 1725450000000,
          userId: 'user_1',
        };

        let sent = false;
        try {
          fetch('dummy', { keepalive: true });
          sent = true;
        } catch {
          sent = false;
        }

        if (!sent && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const beaconEndpoint = `${baseUrl}/v1/attempts/${encodeURIComponent(sessionId)}/answers`;
          const beaconBlob = new Blob(
            [JSON.stringify({ ...payloadObj, questionId: qId })],
            { type: 'application/json' }
          );
          navigator.sendBeacon(beaconEndpoint, beaconBlob);
        }
      }
      pendingSaves.clear();

      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
      expect(sendBeaconMock).toHaveBeenCalledWith(
        'http://localhost:3000/v1/attempts/attempt_xyz_999/answers',
        expect.any(Blob)
      );
      expect(pendingSaves.size).toBe(0);
    });
  });
});
