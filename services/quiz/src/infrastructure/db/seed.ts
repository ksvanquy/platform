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

  // 1. Đề thi Kiến Trúc Core
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
    status: 'PUBLISHED',
    currentPublishedVersionId: versionId,
  });

  await repo.saveQuiz(quiz);
  await repo.saveVersion(version);

  // 2. Đề thi Tiếng Anh B2
  const foreignQuizId = 'quiz_foreign';
  const foreignVersionId = 'ver_foreign_v1';

  const foreignVersion = new QuizVersion({
    id: foreignVersionId,
    quizId: foreignQuizId,
    versionNumber: 1,
    durationMinutes: 20,
    passingScore: 2,
    maxAttempts: 2,
    questions: [
      {
        id: 'q_eng_1',
        type: 'single-choice',
        prompt: 'Choose the correct synonym for "resilient":',
        points: 2,
        options: [
          { id: 'opt_a', text: 'Adaptable and strong', isCorrect: true },
          { id: 'opt_b', text: 'Fragile and weak', isCorrect: false },
          { id: 'opt_c', text: 'Hesitant and slow', isCorrect: false },
        ],
      },
      {
        id: 'q_eng_2',
        type: 'true-false',
        prompt: '"I look forward to hear from you" is grammatically correct.',
        points: 1,
        correctAnswer: false,
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
  });

  const foreignQuiz = new Quiz({
    id: foreignQuizId,
    code: 'ENGLISH_B2',
    title: 'Đề Thi Tiếng Anh B2',
    description: 'Đánh giá năng lực ngoại ngữ học thuật',
    ownerId: 'usr_inst_c',
    status: 'PUBLISHED',
    currentPublishedVersionId: foreignVersionId,
  });

  await repo.saveQuiz(foreignQuiz);
  await repo.saveVersion(foreignVersion);

  // 3. Đề thi Cấu Trúc Dữ Liệu & Giải Thuật
  const polyQuizId = 'quiz_poly';
  const polyVersionId = 'ver_poly_v1';

  const polyVersion = new QuizVersion({
    id: polyVersionId,
    quizId: polyQuizId,
    versionNumber: 1,
    durationMinutes: 25,
    passingScore: 2,
    maxAttempts: 3,
    questions: [
      {
        id: 'q_poly_1',
        type: 'single-choice',
        prompt: 'Độ phức tạp thời gian trung bình của thuật toán QuickSort là gì?',
        points: 2,
        options: [
          { id: 'opt_p1', text: 'O(N log N)', isCorrect: true },
          { id: 'opt_p2', text: 'O(N^2)', isCorrect: false },
          { id: 'opt_p3', text: 'O(1)', isCorrect: false },
        ],
      },
      {
        id: 'q_poly_2',
        type: 'true-false',
        prompt: 'Cấu trúc dữ liệu Stack hoạt động theo nguyên tắc LIFO (Last In First Out).',
        points: 1,
        correctAnswer: true,
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
  });

  const polyQuiz = new Quiz({
    id: polyQuizId,
    code: 'ALGO_DATA',
    title: 'Đề Thi Cấu Trúc Dữ Liệu & Giải Thuật',
    description: 'Kiểm tra giải thuật cơ sở',
    ownerId: 'admin_master',
    status: 'PUBLISHED',
    currentPublishedVersionId: polyVersionId,
  });

  await repo.saveQuiz(polyQuiz);
  await repo.saveVersion(polyVersion);

  // 4. Đề thi công khai (isPublic: true)
  const publicQuizId = 'quiz_public';
  const publicVersionId = 'ver_public_v1';

  const publicVersion = new QuizVersion({
    id: publicVersionId,
    quizId: publicQuizId,
    versionNumber: 1,
    durationMinutes: 10,
    passingScore: 1,
    maxAttempts: 5,
    questions: [
      {
        id: 'q_pub_1',
        type: 'single-choice',
        prompt: 'Giao thức bảo mật kết nối web phổ biến hiện nay là gì?',
        points: 2,
        options: [
          { id: 'opt_ssl', text: 'HTTPS / TLS', isCorrect: true },
          { id: 'opt_ftp', text: 'FTP không mã hóa', isCorrect: false },
          { id: 'opt_telnet', text: 'Telnet', isCorrect: false },
        ],
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
  });

  const publicQuiz = new Quiz({
    id: publicQuizId,
    code: 'PUBLIC_SURVEY',
    title: 'Bài Khảo Sát Kiến Thức Mở',
    description: 'Đề thi tự do cho phép mọi thí sinh tham gia',
    ownerId: 'admin_master',
    isPublic: true,
    status: 'PUBLISHED',
    currentPublishedVersionId: publicVersionId,
  });

  await repo.saveQuiz(publicQuiz);
  await repo.saveVersion(publicVersion);

  console.log('✅ [quiz_db] Seeding completed: 4 quizzes initialized in PostgreSQL (Single-Tenant).');
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
