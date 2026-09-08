import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestQuestionDb, TestQuestionContext } from './helpers/test-db.helper.js';
import { CreateQuestionUseCase } from '../src/application/use-cases/create-question.use-case.js';
import { GetQuestionUseCase } from '../src/application/use-cases/get-question.use-case.js';
import { UpdateQuestionUseCase } from '../src/application/use-cases/update-question.use-case.js';
import { ListQuestionsUseCase } from '../src/application/use-cases/list-questions.use-case.js';
import { DeleteQuestionUseCase } from '../src/application/use-cases/delete-question.use-case.js';
import { ManageRevisionsUseCase } from '../src/application/use-cases/add-revision.use-case.js';

describe('Question Service: CRUD, Revisions & Bloom Filtering', () => {
  let ctx: TestQuestionContext;
  let createUseCase: CreateQuestionUseCase;
  let getUseCase: GetQuestionUseCase;
  let updateUseCase: UpdateQuestionUseCase;
  let listUseCase: ListQuestionsUseCase;
  let deleteUseCase: DeleteQuestionUseCase;
  let revisionsUseCase: ManageRevisionsUseCase;

  beforeAll(async () => {
    ctx = await setupTestQuestionDb();
    createUseCase = new CreateQuestionUseCase(ctx.repo);
    getUseCase = new GetQuestionUseCase(ctx.repo);
    updateUseCase = new UpdateQuestionUseCase(ctx.repo);
    listUseCase = new ListQuestionsUseCase(ctx.repo);
    deleteUseCase = new DeleteQuestionUseCase(ctx.repo);
    revisionsUseCase = new ManageRevisionsUseCase(ctx.repo);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should seed default questions and allow querying them by code', async () => {
    const q = await getUseCase.executeByCode('MATH10-QUAD-001');
    expect(q).toBeDefined();
    expect(q.code).toBe('MATH10-QUAD-001');
    expect(q.difficulty).toBe('REMEMBER');
    expect(q.type).toBe('SINGLE');
    expect(q.currentRevision?.prompt).toContain('ax^2 + bx + c = 0');
  });

  it('should create a new question with rich LaTeX prompt and initial revision', async () => {
    const created = await createUseCase.execute(
      {
        code: 'PHYS10-FORCE-001',
        type: 'SINGLE',
        topicNodeId: 'node_phys_newton',
        gradeNodeId: 'node_grade_10',
        difficulty: 'UNDERSTAND',
        defaultPoints: 2,
        prompt: 'Định luật II Newton được biểu diễn qua công thức nào sau đây?',
        options: [
          { id: 'o1', content: '$$\\vec{F} = m\\vec{a}$$', isCorrect: true, explanation: 'Định luật II Newton' },
          { id: 'o2', content: '$$\\vec{F} = -k\\vec{x}$$', isCorrect: false },
          { id: 'o3', content: '$$P = mg$$', isCorrect: false },
        ],
        explanation: 'Định luật II Newton: Gia tốc của một vật cùng hướng với lực tác dụng lên vật: $\\vec{a} = \\frac{\\vec{F}}{m} \\iff \\vec{F} = m\\vec{a}$.',
      },
      'usr_test_author'
    );

    expect(created.id).toMatch(/^q_/);
    expect(created.code).toBe('PHYS10-FORCE-001');
    expect(created.currentRevision?.revisionNumber).toBe(1);
    expect(created.currentRevision?.options.length).toBe(3);

    const fetched = await getUseCase.executeById(created.id);
    expect(fetched.code).toBe('PHYS10-FORCE-001');
  });

  it('should prevent creating questions with duplicate codes', async () => {
    await expect(
      createUseCase.execute(
        {
          code: 'MATH10-QUAD-001',
          type: 'SINGLE',
          difficulty: 'APPLY',
          prompt: 'Duplicate code test',
          options: [],
        },
        'usr_test_author'
      )
    ).rejects.toThrow(/already exists/);
  });

  it('should increment revision when content is updated', async () => {
    const q = await getUseCase.executeByCode('PHYS10-FORCE-001');

    const updated = await updateUseCase.execute(
      q.id,
      {
        prompt: 'Định luật II Newton: Biểu thức véctơ gia tốc là gì?',
        options: [
          { id: 'o1_v2', content: '$$\\vec{a} = \\frac{\\vec{F}}{m}$$', isCorrect: true },
          { id: 'o2_v2', content: '$$\\vec{a} = m\\vec{F}$$', isCorrect: false },
        ],
      },
      'usr_test_author',
      'INSTRUCTOR'
    );

    expect(updated.currentRevision?.revisionNumber).toBe(2);
    expect(updated.currentRevision?.prompt).toBe('Định luật II Newton: Biểu thức véctơ gia tốc là gì?');

    const allRevs = await revisionsUseCase.listRevisions(q.id);
    expect(allRevs.length).toBe(2);
    expect(allRevs[0].revisionNumber).toBe(2);
    expect(allRevs[1].revisionNumber).toBe(1);
  });

  it('should filter questions by topic, grade and difficulty', async () => {
    const filterByTopic = await listUseCase.execute({
      topicNodeId: 'node_math_quad_eq',
    });
    expect(filterByTopic.items.length).toBeGreaterThanOrEqual(2);

    const filterByDifficulty = await listUseCase.execute({
      difficulty: 'APPLY',
    });
    expect(filterByDifficulty.items.some((i) => i.code === 'MATH10-QUAD-002')).toBe(true);
  });

  it('should delete question cleanly', async () => {
    const created = await createUseCase.execute(
      {
        code: 'TEMP-DEL-001',
        type: 'SINGLE',
        difficulty: 'REMEMBER',
        prompt: 'Will be deleted',
        options: [],
      },
      'usr_test_author'
    );

    const delSuccess = await deleteUseCase.execute(created.id, 'usr_test_author');
    expect(delSuccess).toBe(true);

    await expect(getUseCase.executeById(created.id)).rejects.toThrow(/not found/);
  });
});
