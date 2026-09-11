import { getAttemptDb, isAttemptDbConfigured } from './connection.js';
export { isAttemptDbConfigured };
import { runAttemptMigrations } from './migrate.js';
import { attempts, attemptEvents } from './schema.js';
import { DirectExamClientAdapter } from '../adapters/direct-exam-client.adapter.js';

export async function seedAttemptDatabase(): Promise<void> {
  if (isAttemptDbConfigured()) {
    try {
      await runAttemptMigrations();
    } catch (err: any) {
      console.warn('⚠️ [attempt_db] Pre-seed migration notice:', err?.message || err);
    }
  }

  const db = getAttemptDb();

  const existing = await db.select().from(attempts).limit(1);
  if (existing.length > 0) {
    console.log('✅ [attempt_db] Attempt database already contains runtime records.');
    return;
  }

  console.log('🌱 [attempt_db] Checking exam snapshots to seed demo completed attempt...');
  try {
    const examClient = new DirectExamClientAdapter();
    const exam = await examClient.getExam('EXM_TOAN10_HK1');
    if (exam) {
      const variantCode = exam.variants && exam.variants.length > 0 ? exam.variants[0].variantCode : 'DEFAULT';
      const snapshot = await examClient.getExamSnapshot(exam.id, variantCode);
      if (snapshot) {
        const now = new Date();
        const startedAt = new Date(now.getTime() - 40 * 60 * 1000);
        const submittedAt = new Date(now.getTime() - 5 * 60 * 1000);
        const deadline = new Date(startedAt.getTime() + 45 * 60 * 1000);

        const demoAttemptId = 'att_demo_student01_graded';
        await (db.insert(attempts) as any).values({
          id: demoAttemptId,
          userId: 'usr_student_01',
          examId: exam.id,
          snapshotId: snapshot.id,
          variantCode: snapshot.variantCode,
          status: 'GRADED',
          startedAt,
          deadline,
          submittedAt,
          durationMinutes: 45,
          answers: {
            q_math10_quad_001: {
              questionId: 'q_math10_quad_001',
              selectedOptionId: 'opt_1',
              sequenceNumber: 1,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_003: {
              questionId: 'q_math10_quad_003',
              selectedOptionId: 'opt_31',
              sequenceNumber: 2,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_004: {
              questionId: 'q_math10_quad_004',
              selectedOptionId: 'opt_41',
              sequenceNumber: 3,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_005: {
              questionId: 'q_math10_quad_005',
              selectedOptionId: 'opt_51',
              sequenceNumber: 4,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_006: {
              questionId: 'q_math10_quad_006',
              selectedOptionId: 'opt_61',
              sequenceNumber: 5,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_007: {
              questionId: 'q_math10_quad_007',
              selectedOptionIds: ['opt_71', 'opt_73'],
              sequenceNumber: 6,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_008: {
              questionId: 'q_math10_quad_008',
              selectedOptionId: 'opt_81',
              sequenceNumber: 7,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_009: {
              questionId: 'q_math10_quad_009',
              selectedOptionId: 'opt_91',
              sequenceNumber: 8,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_002: {
              questionId: 'q_math10_quad_002',
              selectedOptionId: 'opt_21',
              sequenceNumber: 9,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
            q_math10_quad_012: {
              questionId: 'q_math10_quad_012',
              numericValue: 9,
              sequenceNumber: 10,
              clientTimestamp: startedAt.toISOString(),
              serverTimestamp: startedAt.toISOString(),
            },
          },
          scoreResult: {
            attemptId: demoAttemptId,
            examId: exam.id,
            userId: 'usr_student_01',
            earnedScore: 10,
            maxScore: 10,
            percentage: 100,
            isPassed: true,
            gradingMode: 'AUTOMATIC',
            gradedAt: submittedAt.toISOString(),
            questionBreakdowns: [],
          },
        });

        await db.insert(attemptEvents).values({
          id: 'evt_demo_blur_01',
          attemptId: demoAttemptId,
          userId: 'usr_student_01',
          eventType: 'BLUR',
          clientTimestamp: new Date(startedAt.getTime() + 10 * 60 * 1000),
          serverTimestamp: new Date(startedAt.getTime() + 10 * 60 * 1000),
          metadata: { durationMs: 1200, windowFocused: false },
        });

        console.log('✅ [attempt_db] Demo graded attempt seeded for usr_student_01.');
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [attempt_db] Could not seed demo attempt:', err?.message || err);
  }

  console.log('✅ [attempt_db] Attempt database ready.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  if (isAttemptDbConfigured()) {
    seedAttemptDatabase()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Skipping Attempt DB seed: ATTEMPT_DATABASE_URL not configured.');
  }
}
