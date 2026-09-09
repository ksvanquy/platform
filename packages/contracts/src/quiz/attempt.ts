type AttemptStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'SUBMITTED' | 'EXPIRED';

export interface QuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt?: string;
  durationMinutes: number;
}
