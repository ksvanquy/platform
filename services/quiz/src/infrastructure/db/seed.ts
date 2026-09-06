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
    primaryNodeId: 'node_topic_it_web',
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
    primaryNodeId: 'node_topic_lang_en',
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
    primaryNodeId: 'node_topic_it',
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
    primaryNodeId: 'node_topic_it_web',
    isPublic: true,
    status: 'PUBLISHED',
    currentPublishedVersionId: publicVersionId,
  });

  await repo.saveQuiz(publicQuiz);
  await repo.saveVersion(publicVersion);

  // 5. Đề thi Toán học - Đại số 10
  const mathAlgebraQuizId = 'quiz_math_algebra_10';
  const mathAlgebraVersionId = 'ver_math_alg_v1';

  const mathAlgebraVersion = new QuizVersion({
    id: mathAlgebraVersionId,
    quizId: mathAlgebraQuizId,
    versionNumber: 1,
    durationMinutes: 45,
    passingScore: 5,
    maxAttempts: 3,
    questions: [
      {
        id: 'q_math_alg_1',
        type: 'single-choice',
        prompt: 'Tập nghiệm của bất phương trình x^2 - 4x + 3 < 0 là khoảng nào?',
        points: 2.5,
        options: [
          { id: 'opt_m1', text: '(1; 3)', isCorrect: true },
          { id: 'opt_m2', text: '(-infinity; 1)', isCorrect: false },
          { id: 'opt_m3', text: '(3; +infinity)', isCorrect: false },
          { id: 'opt_m4', text: '[1; 3]', isCorrect: false },
        ],
      },
      {
        id: 'q_math_alg_2',
        type: 'true-false',
        prompt: 'Mệnh đề "Mọi số nguyên tố đều là số lẻ" là một mệnh đề đúng.',
        points: 2.5,
        correctAnswer: false,
      },
      {
        id: 'q_math_alg_3',
        type: 'single-choice',
        prompt: 'Đỉnh của parabol y = x^2 - 2x + 3 có tọa độ là:',
        points: 5,
        options: [
          { id: 'opt_v1', text: 'I(1; 2)', isCorrect: true },
          { id: 'opt_v2', text: 'I(-1; 6)', isCorrect: false },
          { id: 'opt_v3', text: 'I(2; 3)', isCorrect: false },
        ],
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: true, shuffleOptions: true },
  });

  const mathAlgebraQuiz = new Quiz({
    id: mathAlgebraQuizId,
    code: 'MATH_10',
    title: 'Đề Thi Đại Số 10 - Mệnh Đề & Hàm Số',
    description: 'Kiểm tra kiến thức đại số chương trình lớp 10',
    ownerId: 'admin_master',
    primaryNodeId: 'node_topic_math_algebra_10',
    status: 'PUBLISHED',
    currentPublishedVersionId: mathAlgebraVersionId,
  });

  await repo.saveQuiz(mathAlgebraQuiz);
  await repo.saveVersion(mathAlgebraVersion);

  // 6. Đề thi Toán học - Hình học
  const mathGeoQuizId = 'quiz_math_geometry';
  const mathGeoVersionId = 'ver_math_geo_v1';

  const mathGeoVersion = new QuizVersion({
    id: mathGeoVersionId,
    quizId: mathGeoQuizId,
    versionNumber: 1,
    durationMinutes: 30,
    passingScore: 5,
    maxAttempts: 3,
    questions: [
      {
        id: 'q_math_geo_1',
        type: 'single-choice',
        prompt: 'Cho hai vectơ cùng hướng và khác vectơ-không. Góc giữa hai vectơ đó bằng bao nhiêu?',
        points: 5,
        options: [
          { id: 'opt_g1', text: '0 độ', isCorrect: true },
          { id: 'opt_g2', text: '90 độ', isCorrect: false },
          { id: 'opt_g3', text: '180 độ', isCorrect: false },
        ],
      },
      {
        id: 'q_math_geo_2',
        type: 'true-false',
        prompt: 'Hai vectơ cùng phương thì luôn cùng hướng.',
        points: 5,
        correctAnswer: false,
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
  });

  const mathGeoQuiz = new Quiz({
    id: mathGeoQuizId,
    code: 'MATH_GEO',
    title: 'Đề Thi Hình Học - Vectơ & Tọa Độ',
    description: 'Đánh giá kiến thức hình học phẳng và giải tích tọa độ',
    ownerId: 'admin_master',
    primaryNodeId: 'node_topic_math_geometry',
    status: 'PUBLISHED',
    currentPublishedVersionId: mathGeoVersionId,
  });

  await repo.saveQuiz(mathGeoQuiz);
  await repo.saveVersion(mathGeoVersion);

  // 7. Đề thi Tin học - Cơ sở dữ liệu & SQL
  const dbQuizId = 'quiz_database_sql';
  const dbVersionId = 'ver_db_v1';

  const dbVersion = new QuizVersion({
    id: dbVersionId,
    quizId: dbQuizId,
    versionNumber: 1,
    durationMinutes: 20,
    passingScore: 5,
    maxAttempts: 3,
    questions: [
      {
        id: 'q_db_1',
        type: 'single-choice',
        prompt: 'Mệnh đề nào trong SQL dùng để lọc các nhóm sau khi GROUP BY?',
        points: 5,
        options: [
          { id: 'opt_h1', text: 'HAVING', isCorrect: true },
          { id: 'opt_h2', text: 'WHERE', isCorrect: false },
          { id: 'opt_h3', text: 'FILTER', isCorrect: false },
        ],
      },
      {
        id: 'q_db_2',
        type: 'true-false',
        prompt: 'Khóa chính (PRIMARY KEY) chấp nhận giá trị NULL.',
        points: 5,
        correctAnswer: false,
      },
    ],
    scoringPolicy: { strategyType: 'exact-match' },
    randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
  });

  const dbQuiz = new Quiz({
    id: dbQuizId,
    code: 'SQL_DB',
    title: 'Đề Thi Cơ Sở Dữ Liệu & Thiết Kế SQL',
    description: 'Kiểm tra kiến thức chuẩn hóa dữ liệu quan hệ và truy vấn SQL',
    ownerId: 'admin_master',
    primaryNodeId: 'node_topic_it_db',
    status: 'PUBLISHED',
    currentPublishedVersionId: dbVersionId,
  });

  await repo.saveQuiz(dbQuiz);
  await repo.saveVersion(dbVersion);

  console.log('✅ [quiz_db] Seeding completed: 7 quizzes initialized across Math, IT & English topics.');
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
