export type MediaType = 'text' | 'audio' | 'video' | 'image';

export interface MediaItem {
  type: MediaType;
  url?: string;
  content?: string;
}

export type RichContent = string | MediaItem[];

// Question Generic: Dữ liệu phụ thuộc loại câu hỏi nằm trong metadata
export interface Question<TMetadata = Record<string, unknown>> {
  id: string;
  type: string;
  prompt: RichContent;
  points?: number; // Trọng số điểm (mặc định: 1)
  correctAnswer?: unknown; // Dữ liệu đáp án an toàn (chỉ ở Server)
  metadata?: TMetadata; // Chứa options, pairs, blanks, code limits...
}

export type PublicQuestion<TMetadata = Record<string, unknown>> = Omit<Question<TMetadata>, 'correctAnswer'>;

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  passingPercentage?: number; // Tỷ lệ điểm tối thiểu để Đạt (ví dụ: 80%)
  questions: Question[];
}

export type UserAnswerValue = unknown;
export type UserAnswers = Record<string, UserAnswerValue>;