export interface QuizSummary {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  passingPercentage?: number;
  totalQuestions?: number;
}
