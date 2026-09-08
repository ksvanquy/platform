import crypto from 'node:crypto';

/**
 * Deterministic Pseudo-Random Number Generator using Mulberry32 algorithm.
 * Guarantees 100% reproducible question ordering & option shuffling across all variants and audit replays.
 */
export class DeterministicPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /**
   * Generates a 32-bit pseudo-random float in the interval [0, 1).
   */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates an integer in range [min, max] inclusive.
   */
  nextInt(min: number, max: number): number {
    const r = this.next();
    return Math.floor(r * (max - min + 1)) + min;
  }

  /**
   * Shuffles an array in place using the Fisher-Yates algorithm driven by this deterministic PRNG.
   */
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  /**
   * Computes a deterministic SHA-256 hexadecimal hash for frozen exam payloads.
   */
  static computeContentHash(payload: unknown): string {
    const canonicalString = DeterministicPRNG.canonicalJsonStringify(payload);
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  private static canonicalJsonStringify(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(DeterministicPRNG.canonicalJsonStringify).join(',') + ']';
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys.map(
      (k) =>
        `${JSON.stringify(k)}:${DeterministicPRNG.canonicalJsonStringify(
          (obj as Record<string, unknown>)[k]
        )}`
    );
    return '{' + pairs.join(',') + '}';
  }
}
