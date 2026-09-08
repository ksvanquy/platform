import { describe, it, expect } from 'vitest';
import {
  // Question contracts
  type QuestionType,
  type QuestionDifficulty,
  type QuestionStatus,
  type QuestionOption,
  type MatchingPair,
  type QuestionRevisionDTO,
  type QuestionDTO,
  type CreateQuestionInput,
  type UpdateQuestionInput,
  type QuestionFilterQuery,

  // Assessment contracts
  type AssessmentStatus,
  type ScoringStrategyType,
  type ScoringPolicyConfig,
  type AttemptPolicyConfig,
  type BlueprintCriterion,
  type BlueprintDTO,
  type AssessmentDTO,
  type CreateAssessmentInput,
  type UpdateAssessmentInput,
  type UpdateBlueprintInput,

  // Exam contracts
  type ExamStatus,
  type SanitizedOption,
  type SanitizedQuestionItem,
  type SanitizedExamManifest,
  type FrozenQuestionItem,
  type ExamSnapshotDTO,
  type ExamDTO,
  type GenerateExamInput,

  // Attempt contracts
  type AttemptStatus,
  type CandidateAnswerRecord,
  type QuestionScoreBreakdown,
  type AttemptScoreResult,
  type AntiCheatEventType,
  type AntiCheatEventDTO,
  type RecordAntiCheatEventInput,
  type StartAttemptInput,
  type AutosaveAnswerInput,
  type SubmitAttemptInput,
  type AttemptDTO,
  type TimeSyncResponse,

  // Auth & Taxonomy
  type Principal,
  type ApiResponse,
} from '../src/index.js';

describe('Giai đoạn 1: Chuẩn hóa Contracts & DTOs (@platform/contracts)', () => {
  it('should correctly export and type Question Service contracts', () => {
    const option: QuestionOption = {
      id: 'opt_1',
      content: 'LaTeX equation: $$\\int_{0}^{1} x dx$$',
      isCorrect: true,
      explanation: 'Integrating x yields 0.5',
    };

    const pair: MatchingPair = {
      leftId: 'left_1',
      leftText: 'Newton',
      rightId: 'right_1',
      rightText: 'Force & Motion',
    };

    const revision: QuestionRevisionDTO = {
      id: 'qrev_1001',
      questionId: 'q_2001',
      revisionNumber: 1,
      prompt: 'What is the integral of $$x$$ from 0 to 1?',
      options: [option],
      pairs: [pair],
      createdBy: 'usr_teacher_01',
      createdAt: new Date().toISOString(),
    };

    const question: QuestionDTO = {
      id: 'q_2001',
      code: 'MATH10-CALC-001',
      type: 'SINGLE' as QuestionType,
      topicNodeId: 'node_calculus',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as QuestionDifficulty,
      defaultPoints: 2,
      status: 'ACTIVE' as QuestionStatus,
      currentRevisionId: revision.id,
      ownerId: 'usr_teacher_01',
      currentRevision: revision,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(question.code).toBe('MATH10-CALC-001');
    expect(question.difficulty).toBe('APPLY');
    expect(question.currentRevision?.options[0].isCorrect).toBe(true);
  });

  it('should correctly export and type Assessment Service contracts', () => {
    const scoringPolicy: ScoringPolicyConfig = {
      strategyType: 'PARTIAL' as ScoringStrategyType,
      negativeMarkingPenalty: 0.25,
      roundingDecimal: 2,
    };

    const criterion: BlueprintCriterion = {
      topicNodeId: 'node_algebra',
      difficulty: 'UNDERSTAND',
      questionCount: 10,
      pointsPerQuestion: 1,
    };

    const blueprint: BlueprintDTO = {
      id: 'bp_101',
      assessmentId: 'asm_201',
      versionNumber: 1,
      durationMinutes: 45,
      passingPercentage: 60,
      maxAttempts: 2,
      criteria: [criterion],
      scoringPolicy,
      isLocked: false,
      createdAt: new Date().toISOString(),
    };

    const assessment: AssessmentDTO = {
      id: 'asm_201',
      code: 'ASM-MATH-MIDTERM',
      title: 'Math Midterm Exam 2026',
      ownerId: 'usr_teacher_01',
      status: 'APPROVED' as AssessmentStatus,
      currentBlueprint: blueprint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(assessment.code).toBe('ASM-MATH-MIDTERM');
    expect(assessment.currentBlueprint?.criteria.length).toBe(1);
    expect(assessment.currentBlueprint?.scoringPolicy.negativeMarkingPenalty).toBe(0.25);
  });

  it('should correctly export and type Exam Service contracts (Frozen & Sanitized)', () => {
    const sanitizedOption: SanitizedOption = {
      id: 'opt_1',
      content: 'Euler formula: $$e^{i\\pi} + 1 = 0$$',
    };

    const sanitizedQuestion: SanitizedQuestionItem = {
      id: 'q_301',
      type: 'SINGLE',
      prompt: 'Which formula is known as Euler identity?',
      options: [sanitizedOption],
      points: 1,
    };

    const manifest: SanitizedExamManifest = {
      examId: 'exm_401',
      variantCode: '101',
      title: 'Advanced Mathematics Exam',
      durationMinutes: 60,
      totalQuestions: 1,
      totalPoints: 1,
      questions: [sanitizedQuestion],
      serverTimestamp: Date.now(),
    };

    // Verify sanitization guarantee: Sanitized option MUST NOT have isCorrect or explanation
    expect((manifest.questions[0].options[0] as Record<string, unknown>).isCorrect).toBeUndefined();
    expect((manifest.questions[0].options[0] as Record<string, unknown>).explanation).toBeUndefined();

    const frozenQuestion: FrozenQuestionItem = {
      id: 'q_301',
      revisionId: 'qrev_301',
      type: 'SINGLE',
      prompt: sanitizedQuestion.prompt,
      options: [{ id: 'opt_1', content: 'Option 1', isCorrect: true, explanation: 'Detailed reason' }],
      points: 1,
    };

    const snapshot: ExamSnapshotDTO = {
      id: 'snp_501',
      examId: 'exm_401',
      variantCode: '101',
      contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      frozenPayload: {
        questions: [frozenQuestion],
        scoringPolicy: { strategyType: 'STANDARD' },
      },
      sanitizedManifest: manifest,
      createdAt: new Date().toISOString(),
    };

    expect(snapshot.contentHash).toHaveLength(64);
    expect(snapshot.frozenPayload.questions[0].options[0].isCorrect).toBe(true);
  });

  it('should correctly export and type Attempt Service contracts (Autosave & Anti-cheat)', () => {
    const answerRecord: CandidateAnswerRecord = {
      answer: 'opt_1',
      answeredAt: new Date().toISOString(),
      sequenceNumber: 42,
      clientTimestamp: Date.now(),
    };

    const breakdown: QuestionScoreBreakdown = {
      questionId: 'q_301',
      isCorrect: true,
      scoreAwarded: 1,
      maxScore: 1,
      candidateAnswer: 'opt_1',
      feedback: 'Good job!',
    };

    const scoreResult: AttemptScoreResult = {
      score: 10,
      maxScore: 10,
      percentage: 100,
      passed: true,
      evaluatedAt: new Date().toISOString(),
      breakdown: {
        q_301: breakdown,
      },
    };

    const antiCheatEvent: AntiCheatEventDTO = {
      id: 'evt_701',
      attemptId: 'att_801',
      userId: 'usr_student_01',
      eventType: 'FULLSCREEN_EXIT' as AntiCheatEventType,
      clientTimestamp: new Date().toISOString(),
      serverTimestamp: new Date().toISOString(),
      metadata: { reason: 'User minimized browser window' },
    };

    const attempt: AttemptDTO = {
      id: 'att_801',
      userId: 'usr_student_01',
      examId: 'exm_401',
      snapshotId: 'snp_501',
      variantCode: '101',
      status: 'IN_PROGRESS' as AttemptStatus,
      durationMinutes: 60,
      answers: {
        q_301: answerRecord,
      },
      scoreResult,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(attempt.status).toBe('IN_PROGRESS');
    expect(attempt.answers['q_301'].sequenceNumber).toBe(42);
    expect(antiCheatEvent.eventType).toBe('FULLSCREEN_EXIT');
  });
});
