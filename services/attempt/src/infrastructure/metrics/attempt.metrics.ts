/**
 * Metrics & Observability Registry for Attempt Service Concurrency & Lock Health
 */
export class AttemptMetrics {
  private static occConflictsTotal = 0;
  private static doubleSubmitsTotal = 0;
  private static sweeperLockedSkipsTotal = 0;
  private static atomicPatchTotal = 0;
  private static submissionsTotal = 0;
  private static sweeperRunsTotal = 0;

  static incrementOccConflicts(): void {
    this.occConflictsTotal++;
  }

  static incrementDoubleSubmits(): void {
    this.doubleSubmitsTotal++;
  }

  static incrementSweeperLockedSkips(): void {
    this.sweeperLockedSkipsTotal++;
  }

  static incrementAtomicPatch(): void {
    this.atomicPatchTotal++;
  }

  static incrementSubmissions(): void {
    this.submissionsTotal++;
  }

  static incrementSweeperRuns(): void {
    this.sweeperRunsTotal++;
  }

  static getSnapshot(): {
    attempt_occ_conflicts_total: number;
    attempt_double_submits_total: number;
    attempt_sweeper_locked_skips_total: number;
    attempt_atomic_patch_total: number;
    attempt_submissions_total: number;
    attempt_sweeper_runs_total: number;
    feature_flag_atomic_autosave: boolean;
  } {
    return {
      attempt_occ_conflicts_total: this.occConflictsTotal,
      attempt_double_submits_total: this.doubleSubmitsTotal,
      attempt_sweeper_locked_skips_total: this.sweeperLockedSkipsTotal,
      attempt_atomic_patch_total: this.atomicPatchTotal,
      attempt_submissions_total: this.submissionsTotal,
      attempt_sweeper_runs_total: this.sweeperRunsTotal,
      feature_flag_atomic_autosave: process.env.FEATURE_FLAG_ATOMIC_AUTOSAVE !== 'false',
    };
  }

  static resetForTesting(): void {
    this.occConflictsTotal = 0;
    this.doubleSubmitsTotal = 0;
    this.sweeperLockedSkipsTotal = 0;
    this.atomicPatchTotal = 0;
    this.submissionsTotal = 0;
    this.sweeperRunsTotal = 0;
  }
}
