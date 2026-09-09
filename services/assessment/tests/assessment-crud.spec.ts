import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestAssessmentDb, TestAssessmentContext } from './helpers/test-db.helper.js';
import { CreateAssessmentUseCase } from '../src/application/use-cases/create-assessment.use-case.js';
import { GetAssessmentUseCase } from '../src/application/use-cases/get-assessment.use-case.js';
import { UpdateAssessmentUseCase } from '../src/application/use-cases/update-assessment.use-case.js';
import { UpdateBlueprintUseCase } from '../src/application/use-cases/update-blueprint.use-case.js';
import { ListAssessmentsUseCase } from '../src/application/use-cases/list-assessments.use-case.js';
import { ChangeAssessmentStatusUseCase } from '../src/application/use-cases/change-assessment-status.use-case.js';

describe('Assessment Service: Blueprints, Criteria Matrix & Lifecycle', () => {
  let ctx: TestAssessmentContext;
  let createUseCase: CreateAssessmentUseCase;
  let getUseCase: GetAssessmentUseCase;
  let updateUseCase: UpdateAssessmentUseCase;
  let updateBpUseCase: UpdateBlueprintUseCase;
  let listUseCase: ListAssessmentsUseCase;
  let changeStatusUseCase: ChangeAssessmentStatusUseCase;

  beforeAll(async () => {
    ctx = await setupTestAssessmentDb();
    createUseCase = new CreateAssessmentUseCase(ctx.repo);
    getUseCase = new GetAssessmentUseCase(ctx.repo);
    updateUseCase = new UpdateAssessmentUseCase(ctx.repo);
    updateBpUseCase = new UpdateBlueprintUseCase(ctx.repo);
    listUseCase = new ListAssessmentsUseCase(ctx.repo);
    changeStatusUseCase = new ChangeAssessmentStatusUseCase(ctx.repo);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should seed default assessments and query by code', async () => {
    const asm = await getUseCase.executeByCode('MATH10-MIDTERM-2026');
    expect(asm).toBeDefined();
    expect(asm.code).toBe('MATH10-MIDTERM-2026');
    expect(asm.status).toBe('APPROVED');
    expect(asm.currentBlueprint?.isLocked).toBe(true);
    expect(asm.currentBlueprint?.criteria.length).toBe(3);
    expect(asm.currentBlueprint?.durationMinutes).toBe(45);
  });

  it('should create a new assessment with Bloom taxonomy criteria and scoring policy', async () => {
    const created = await createUseCase.execute(
      {
        code: 'CHEM10-TEST-001',
        title: 'Kiểm tra Hóa học 10: Bảng tuần hoàn nguyên tố hóa học',
        description: 'Đánh giá mức độ nhận biết và thông hiểu cấu hình electron và xu hướng biến đổi tuần hoàn.',
        primaryTopicNodeId: 'node_chem_periodic',
        gradeNodeId: 'node_grade_10',
        durationMinutes: 40,
        passingPercentage: 60,
        maxAttempts: 2,
        criteria: [
          {
            topicNodeId: 'node_chem_periodic',
            difficulty: 'REMEMBER',
            questionCount: 10,
            pointsPerQuestion: 0.5,
          },
          {
            topicNodeId: 'node_chem_periodic',
            difficulty: 'UNDERSTAND',
            questionCount: 10,
            pointsPerQuestion: 0.5,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD',
          roundingDecimal: 2,
        },
      },
      'usr_instructor_chem'
    );

    expect(created.id).toMatch(/^asm_/);
    expect(created.status).toBe('DRAFT');
    expect(created.currentBlueprint?.id).toMatch(/^bp_/);
    expect(created.currentBlueprint?.criteria.length).toBe(2);
    expect(created.currentBlueprint?.isLocked).toBe(false);

    const fetched = await getUseCase.executeById(created.id);
    expect(fetched.code).toBe('CHEM10-TEST-001');
  });

  it('should reject creating assessment with duplicate code', async () => {
    await expect(
      createUseCase.execute(
        {
          code: 'MATH10-MIDTERM-2026',
          title: 'Duplicate code test',
        },
        'usr_test'
      )
    ).rejects.toThrow(/already exists/);
  });

  it('should update blueprint criteria when not locked', async () => {
    const created = await createUseCase.execute(
      {
        code: 'BIO10-QUIZ-001',
        title: 'Sinh học tế bào',
        durationMinutes: 20,
        criteria: [
          {
            topicNodeId: 'node_bio_cell',
            difficulty: 'REMEMBER',
            questionCount: 5,
            pointsPerQuestion: 1,
          },
        ],
      },
      'usr_bio_author'
    );

    const updatedBp = await updateBpUseCase.execute(
      created.id,
      {
        durationMinutes: 25,
        criteria: [
          {
            topicNodeId: 'node_bio_cell',
            difficulty: 'REMEMBER',
            questionCount: 5,
            pointsPerQuestion: 1,
          },
          {
            topicNodeId: 'node_bio_cell',
            difficulty: 'APPLY',
            questionCount: 5,
            pointsPerQuestion: 1,
          },
        ],
      },
      'usr_bio_author'
    );

    expect(updatedBp.durationMinutes).toBe(25);
    expect(updatedBp.criteria.length).toBe(2);
  });

  it('should prevent modifying locked blueprint', async () => {
    const seeded = await getUseCase.executeByCode('MATH10-MIDTERM-2026');
    expect(seeded.currentBlueprint?.isLocked).toBe(true);

    await expect(
      updateBpUseCase.execute(
        seeded.id,
        {
          durationMinutes: 60,
        },
        seeded.ownerId
      )
    ).rejects.toThrow(/Blueprint is locked/);
  });

  it('should lock blueprint when status is transitioned to APPROVED', async () => {
    let draft = await getUseCase.executeByCode('PHYS10-REV-001');
    if (draft.status !== 'DRAFT') {
      draft.changeStatus('DRAFT');
      if (draft.currentBlueprint) {
        draft.currentBlueprint.unlock();
      }
      await ctx.repo.saveAssessment(draft, draft.currentBlueprint);
      draft = await getUseCase.executeByCode('PHYS10-REV-001');
    }

    expect(draft.status).toBe('DRAFT');
    expect(draft.currentBlueprint?.isLocked).toBe(false);

    const approved = await changeStatusUseCase.execute(
      draft.id,
      'APPROVED',
      draft.ownerId
    );

    expect(approved.status).toBe('APPROVED');
    expect(approved.currentBlueprint?.isLocked).toBe(true);
  });

  it('should filter assessments by status, gradeNodeId, and search keyword', async () => {
    const approvedList = await listUseCase.execute({ status: 'APPROVED' });
    expect(approvedList.items.length).toBeGreaterThanOrEqual(1);

    const searchList = await listUseCase.execute({ search: 'Toán 10' });
    expect(searchList.items.some((a) => a.code === 'MATH10-MIDTERM-2026')).toBe(true);
  });
});
