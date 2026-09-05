import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getQuizDb, closeQuizDb, isQuizDbConfigured } from './connection.js';
import { DrizzleAuthoringRepository } from '../repositories/drizzle-authoring.repository.js';
import { Quiz } from '../../domain/authoring/quiz.entity.js';
import { QuizVersion } from '../../domain/authoring/quiz-version.entity.js';

export async function seedQuizDatabase(customDb?: any): Promise<void> {
  if (!customDb && !isQuizDbConfigured()) {
    console.warn('⚠️ QUIZ_DATABASE_URL is not configured. Skipping Quiz Service seeding.');
    return;
  }

  console.log('🌱 [quiz_db] Seeding default quizzes and versions into PostgreSQL...');
  const repo = new DrizzleAuthoringRepository(customDb);

  const quizId = 'quiz_demo';
  const versionId = 'ver_demo_v1';

  const version = new QuizVersion({
    id: versionId,
    quizId,
    versionNumber: 1,
    durationMinutes: 15,
    passingScore: 3,
    maxAttempts: 3,
    questions: [
      {
        id: 'q1',
        type: 'single-choice',
        prompt: 'ReactJS là gì?',
        points: 2,
        options: [
          { id: 'opt_1', text: 'Thư viện UI', isCorrect: true },
          { id: 'opt_2', text: 'Database', isCorrect: false },
          { id: 'opt_3', text: 'Hệ điều hành', isCorrect: false },
        ],
      },
      {
        id: 'q2',
        type: 'multiple-choice',
        prompt: 'Những từ khóa nào được dùng khai báo biến trong JS hiện đại?',
        points: 2,
        options: [
          { id: 'opt_let', text: 'let', isCorrect: true },
          { id: 'opt_const', text: 'const', isCorrect: true },
          { id: 'opt_goto', text: 'goto', isCorrect: false },
        ],
      },
      {
        id: 'q3',
        type: 'true-false',
        prompt: 'TypeScript hỗ trợ Type System tại thời điểm compile-time',
        points: 1,
        correctAnswer: true,
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
  });

  const quiz = new Quiz({
    id: quizId,
    code: 'REACT_CORE',
    title: 'Bài Thi Thử Kiến Trúc Core',
    description: 'Kiểm tra tổng hợp các loại câu hỏi',
    ownerId: 'admin_master',
    tenantId: 'tenant_default',
    status: 'PUBLISHED',
    currentPublishedVersionId: versionId,
  });

  await repo.saveQuiz(quiz);
  await repo.saveVersion(version);

  console.log('✅ [quiz_db] Seeding completed: 1 quiz, 1 published version initialized in PostgreSQL.');
}

// Allow direct execution via CLI
const isDirectRun = Boolean(
  process.argv[1] &&
  (
    path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
      path.normalize(path.resolve(process.argv[1])).toLowerCase() ||
    process.argv[1].replace(/\\/g, '/').endsWith('seed.ts') ||
    process.argv[1].replace(/\\/g, '/').endsWith('seed.js')
  )
);

if (isDirectRun) {
  seedQuizDatabase()
    .then(async () => {
      await closeQuizDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ [quiz_db] Seeding failed:', err);
      await closeQuizDb();
      process.exit(1);
    });
}
