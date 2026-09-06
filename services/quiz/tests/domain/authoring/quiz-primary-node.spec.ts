import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Quiz } from '../../../src/domain/authoring/quiz.entity.js';
import { AuthoringUseCases } from '../../../src/application/use-cases/authoring/authoring.use-cases.js';
import { setupTestQuizDb, TestQuizDbContext } from '../../helpers/test-db.helper.js';
import { AuthPrincipal } from '../../../src/domain/types/auth-principal.type.js';

describe('Quiz Primary Node ID (Taxonomy Association - Phase 6)', () => {
  let dbCtx: TestQuizDbContext;
  let authoringUseCases: AuthoringUseCases;

  const mockAdminPrincipal: AuthPrincipal = {
    id: 'usr_admin',
    email: 'admin@platform.local',
    roles: ['ADMIN'],
    permissions: ['quiz:create', 'quiz:read', 'quiz:update', 'quiz:publish', 'quiz:manage_all'],
  };

  beforeEach(async () => {
    dbCtx = await setupTestQuizDb();
    authoringUseCases = new AuthoringUseCases(dbCtx.authoringRepo);
  });

  afterEach(async () => {
    await dbCtx.cleanup();
  });

  it('should initialize a Quiz entity with primaryNodeId and serialize it to JSON', () => {
    const quiz = new Quiz({
      id: 'quiz_tax_1',
      code: 'CS_INTRO',
      title: 'Introduction to Computer Science',
      ownerId: 'usr_admin',
      primaryNodeId: 'node_topic_it',
      status: 'DRAFT',
    });

    expect(quiz.primaryNodeId).toBe('node_topic_it');
    const json = quiz.toJSON();
    expect(json.primaryNodeId).toBe('node_topic_it');
  });

  it('should update primaryNodeId using updateDetails', () => {
    const quiz = new Quiz({
      id: 'quiz_tax_2',
      code: 'CS_WEB',
      title: 'Web Programming',
      ownerId: 'usr_admin',
      primaryNodeId: 'node_topic_it',
      status: 'DRAFT',
    });

    quiz.updateDetails('Web Programming Advanced', undefined, undefined, 'node_topic_it_web');

    expect(quiz.primaryNodeId).toBe('node_topic_it_web');
    expect(quiz.toJSON().primaryNodeId).toBe('node_topic_it_web');
  });

  it('should create and persist quiz with primaryNodeId via AuthoringUseCases', async () => {
    const created = await authoringUseCases.createQuiz(
      {
        code: 'PYTHON_BASIC',
        title: 'Python for Beginners',
        ownerId: 'usr_admin',
        primaryNodeId: 'node_topic_python',
      },
      mockAdminPrincipal
    );

    expect(created.id).toBeDefined();
    expect(created.primaryNodeId).toBe('node_topic_python');

    const details = await authoringUseCases.getQuizDetails(created.id, mockAdminPrincipal);
    expect(details.quiz.primaryNodeId).toBe('node_topic_python');
  });

  it('should update quiz primaryNodeId via AuthoringUseCases', async () => {
    const created = await authoringUseCases.createQuiz(
      {
        code: 'DATABASE_SQL',
        title: 'Database & SQL',
        ownerId: 'usr_admin',
      },
      mockAdminPrincipal
    );

    expect(created.primaryNodeId).toBeFalsy();

    const updated = await authoringUseCases.updateQuiz(
      {
        quizId: created.id,
        primaryNodeId: 'node_topic_db',
      },
      mockAdminPrincipal
    );

    expect(updated.primaryNodeId).toBe('node_topic_db');
  });

  it('should filter published quizzes by primaryNodeId and primaryNodeIds', async () => {
    // 1. Create and publish Quiz A (node_web)
    const qA = await authoringUseCases.createQuiz(
      {
        code: 'QUIZ_A',
        title: 'Web Quiz',
        ownerId: 'usr_admin',
        primaryNodeId: 'node_web',
      },
      mockAdminPrincipal
    );
    const dummyQuestion = {
      id: 'q_test_1',
      prompt: 'Sample Question?',
      type: 'MULTIPLE_CHOICE' as const,
      order: 1,
      weight: 1,
      options: [
        { id: 'opt_1', content: 'Option A', isCorrect: true },
        { id: 'opt_2', content: 'Option B', isCorrect: false },
      ],
    };

    const verA = await authoringUseCases.addVersion(
      {
        quizId: qA.id,
        durationMinutes: 15,
        passingScore: 1,
        maxAttempts: 1,
        questions: [dummyQuestion],
        scoringPolicy: { strategyType: 'exact-match' },
        randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
      },
      mockAdminPrincipal
    );
    await authoringUseCases.publishQuiz(
      { quizId: qA.id, versionId: verA.id },
      mockAdminPrincipal
    );

    // 2. Create and publish Quiz B (node_db)
    const qB = await authoringUseCases.createQuiz(
      {
        code: 'QUIZ_B',
        title: 'DB Quiz',
        ownerId: 'usr_admin',
        primaryNodeId: 'node_db',
      },
      mockAdminPrincipal
    );
    const verB = await authoringUseCases.addVersion(
      {
        quizId: qB.id,
        durationMinutes: 15,
        passingScore: 1,
        maxAttempts: 1,
        questions: [{ ...dummyQuestion, id: 'q_test_2' }],
        scoringPolicy: { strategyType: 'exact-match' },
        randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
      },
      mockAdminPrincipal
    );
    await authoringUseCases.publishQuiz(
      { quizId: qB.id, versionId: verB.id },
      mockAdminPrincipal
    );

    // 3. Filter single node
    const filteredA = await authoringUseCases.getPublishedQuizzes({ primaryNodeId: 'node_web' });
    expect(filteredA.some((q) => q.id === qA.id)).toBe(true);
    expect(filteredA.every((q) => q.primaryNodeId === 'node_web')).toBe(true);

    // 4. Filter multiple descendant nodes
    const filteredDescendants = await authoringUseCases.getPublishedQuizzes({
      primaryNodeIds: ['node_web', 'node_other'],
    });
    expect(filteredDescendants.some((q) => q.id === qA.id)).toBe(true);
    expect(filteredDescendants.some((q) => q.id === qB.id)).toBe(false);

    // 5. All published
    const all = await authoringUseCases.getPublishedQuizzes();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
