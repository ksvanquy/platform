import { describe, it, expect } from 'vitest';
import { QuizSession } from '../../src/domain/state-machine/quiz-session.js';
import { EvaluationResult } from '../../src/domain/scoring/scoring.factory.js';

describe('Trụ Cột 1: Session State Machine & Invariants Tests', () => {
  const baseProps = {
    id: 'sess_123',
    userId: 'user_456',
    quizId: 'quiz_789',
    durationMinutes: 10,
    allowedQuestionIds: ['q1', 'q2'],
  };

  it('1. State Transition: NOT_STARTED -> start() -> IN_PROGRESS', () => {
    const session = new QuizSession({
      ...baseProps,
      status: 'NOT_STARTED',
    });

    expect(session.status).toBe('NOT_STARTED');
    session.start(new Date());
    expect(session.status).toBe('IN_PROGRESS');
  });

  it('2. State Transition: IN_PROGRESS -> pause() -> PAUSED -> resume() -> IN_PROGRESS', () => {
    const session = new QuizSession({
      ...baseProps,
      status: 'IN_PROGRESS',
    });

    session.pause();
    expect(session.status).toBe('PAUSED');

    // Không thể trả lời khi đang tạm dừng
    expect(() => {
      session.answerQuestion('q1', 'val');
    }).toThrow(/Cannot answer question while session is PAUSED/);

    session.resume();
    expect(session.status).toBe('IN_PROGRESS');
    session.answerQuestion('q1', 'val');
    expect(session.answers['q1']).toBe('val');
  });

  it('3. Invariant: Chặn trả lời câu hỏi không thuộc đề thi (allowedQuestionIds)', () => {
    const session = new QuizSession({
      ...baseProps,
      status: 'IN_PROGRESS',
    });

    expect(() => {
      session.answerQuestion('unauthorized_q99', 'hack');
    }).toThrow('Question "unauthorized_q99" does not belong to this quiz session.');
  });

  it('4. Invariant: Tự động hết giờ và chặn trả lời khi thời gian vượt durationMinutes', () => {
    const startedAt = new Date('2026-09-02T10:00:00Z');
    const session = new QuizSession({
      ...baseProps,
      durationMinutes: 10,
      startedAt,
      status: 'IN_PROGRESS',
    });

    const onTime = new Date('2026-09-02T10:05:00Z');
    session.answerQuestion('q1', 'first_answer', onTime);
    expect(session.answers['q1']).toBe('first_answer');

    // Quá 10 phút (10:11)
    const lateTime = new Date('2026-09-02T10:11:00Z');
    expect(session.isExpired(lateTime)).toBe(true);

    expect(() => {
      session.answerQuestion('q2', 'second_answer', lateTime);
    }).toThrow('Session has expired.');

    expect(session.status).toBe('EXPIRED');
  });

  it('5. Invariant: Đóng băng phiên khi nộp bài (Freeze on Submission)', () => {
    const session = new QuizSession({
      ...baseProps,
      status: 'IN_PROGRESS',
    });

    const evalResult: EvaluationResult = {
      totalScoreAwarded: 5,
      totalMaxScore: 10,
      percentage: 50,
      details: {},
    };

    session.submit(new Date(), evalResult);
    expect(session.status).toBe('SUBMITTED');
    expect(session.result).toBeDefined();
    expect(session.result?.totalScoreAwarded).toBe(5);

    // Không thể sửa câu trả lời khi đã SUBMITTED
    expect(() => {
      session.answerQuestion('q1', 'try_modify');
    }).toThrow(/Cannot update answers. Session is already SUBMITTED/);
  });

  it('6. Invariant: Idempotent Submit (Nộp nhiều lần không phá vỡ kết quả ban đầu)', () => {
    const session = new QuizSession({
      ...baseProps,
      status: 'IN_PROGRESS',
    });

    const firstResult: EvaluationResult = {
      totalScoreAwarded: 8,
      totalMaxScore: 10,
      percentage: 80,
      details: {},
    };

    const secondResult: EvaluationResult = {
      totalScoreAwarded: 0,
      totalMaxScore: 10,
      percentage: 0,
      details: {},
    };

    session.submit(new Date(), firstResult);
    expect(session.result?.totalScoreAwarded).toBe(8);

    // Gọi submit lần 2
    session.submit(new Date(), secondResult);
    // Kết quả vẫn phải giữ nguyên là 8
    expect(session.result?.totalScoreAwarded).toBe(8);
  });

  it('7. Answer Logs: Ghi vết thời gian trả lời của từng câu hỏi', () => {
    const session = new QuizSession({
      ...baseProps,
      status: 'IN_PROGRESS',
    });

    const time = new Date('2026-09-02T10:02:00Z');
    session.answerQuestion('q1', 'A', time);

    const logs = session.answerLogs;
    expect(logs['q1']).toBeDefined();
    expect(logs['q1'].answer).toBe('A');
    expect(logs['q1'].answeredAt.toISOString()).toBe(time.toISOString());
  });
});
