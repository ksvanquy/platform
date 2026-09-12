import type { Exam, ExamSnapshot } from '../entities/exam.entity.js';
import type {
  ExamStatus,
  QuestionDTO,
  AssessmentDTO,
  BlueprintDTO,
  ExamMasterPayload,
} from '@platform/contracts';

export interface ExamFilterQuery {
  assessmentId?: string;
  status?: ExamStatus;
  search?: string;
  isPublished?: boolean;
  limit?: number;
  offset?: number;
}

export interface ExamRepositoryPort {
  saveExam(exam: Exam): Promise<Exam>;
  findExamById(id: string): Promise<Exam | null>;
  findExamByCode(code: string): Promise<Exam | null>;
  listExams(filter?: ExamFilterQuery): Promise<{ exams: Exam[]; total: number }>;
  deleteExam(id: string): Promise<boolean>;

  saveMasterPayload?(examId: string, masterPayload: ExamMasterPayload): Promise<void>;
  findMasterPayload?(examId: string): Promise<ExamMasterPayload | null>;
  saveSnapshot(snapshot: ExamSnapshot): Promise<ExamSnapshot>;
  saveSnapshots?(snapshots: ExamSnapshot[], masterPayload?: ExamMasterPayload): Promise<ExamSnapshot[]>;
  findSnapshotById(id: string): Promise<ExamSnapshot | null>;
  findSnapshotByExamAndVariant(examId: string, variantCode: string): Promise<ExamSnapshot | null>;
  listSnapshotsByExamId(examId: string): Promise<ExamSnapshot[]>;
  deleteSnapshotsByExamId(examId: string): Promise<number>;
}

export interface QuestionClientPort {
  getQuestions(filter?: {
    topicNodeId?: string;
    gradeNodeId?: string;
    difficulty?: string;
    status?: string;
  }): Promise<QuestionDTO[]>;
}

export interface AssessmentClientPort {
  getAssessmentWithBlueprint(assessmentIdOrCode: string): Promise<{
    assessment: AssessmentDTO;
    blueprint: BlueprintDTO;
  } | null>;
  getAssessment?(assessmentIdOrCode: string): Promise<AssessmentDTO | null>;
}
