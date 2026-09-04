export type AttemptStatus =
  | 'CREATED'           // Khởi tạo, chưa tính giờ
  | 'IN_PROGRESS'       // Đang làm bài, đồng hồ đếm ngược server-side
  | 'SUBMITTED'         // Đã nộp bài, khóa chỉnh sửa
  | 'GRADED'            // Đã hoàn tất chấm điểm
  | 'TIMED_OUT_GRADED'; // Hết giờ, tự động thu bài và chấm điểm các câu đã lưu

const VALID_TRANSITIONS: Record<AttemptStatus, readonly AttemptStatus[]> = {
  CREATED: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED', 'TIMED_OUT_GRADED'],
  SUBMITTED: ['GRADED'],
  TIMED_OUT_GRADED: ['TIMED_OUT_GRADED'], // idempotent update result
  GRADED: ['GRADED'],                     // terminal state
};

export class AttemptStateMachine {
  static canTransition(from: AttemptStatus, to: AttemptStatus): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  static isTerminal(status: AttemptStatus): boolean {
    return status === 'GRADED' || status === 'TIMED_OUT_GRADED';
  }

  static isInteractive(status: AttemptStatus): boolean {
    return status === 'IN_PROGRESS';
  }
}
