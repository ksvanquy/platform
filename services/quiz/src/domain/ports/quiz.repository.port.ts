import { Quiz, Question } from '../entities/quiz.js';
import { QuizSession } from '../state-machine/quiz-session.js';

export interface QuizRepositoryPort {
  findQuizById(id: string): Promise<Quiz | null>;
  findQuestionById(questionId: string): Promise<Question | null>;
  saveSession(session: QuizSession): Promise<void>;
  findSessionById(sessionId: string): Promise<QuizSession | null>;
}