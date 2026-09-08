import { describe, it, expect } from 'vitest';
import { DeterministicPRNG } from '../src/domain/services/prng.service.js';

describe('DeterministicPRNG (Mulberry32 Engine)', () => {
  it('should generate identical float sequences for the same seed', () => {
    const prng1 = new DeterministicPRNG(1337);
    const prng2 = new DeterministicPRNG(1337);

    const seq1 = [prng1.next(), prng1.next(), prng1.next(), prng1.next()];
    const seq2 = [prng2.next(), prng2.next(), prng2.next(), prng2.next()];

    expect(seq1).toEqual(seq2);
    expect(seq1.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('should generate different float sequences for different seeds', () => {
    const prng1 = new DeterministicPRNG(101);
    const prng2 = new DeterministicPRNG(102);

    const seq1 = [prng1.next(), prng1.next(), prng1.next()];
    const seq2 = [prng2.next(), prng2.next(), prng2.next()];

    expect(seq1).not.toEqual(seq2);
  });

  it('should deterministically shuffle an array with Fisher-Yates PRNG', () => {
    const original = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'];

    const prngA = new DeterministicPRNG(42);
    const shuffledA1 = prngA.shuffle(original);

    const prngB = new DeterministicPRNG(42);
    const shuffledA2 = prngB.shuffle(original);

    expect(shuffledA1).toEqual(shuffledA2);
    expect(shuffledA1).toHaveLength(original.length);
    expect(new Set(shuffledA1)).toEqual(new Set(original));
  });

  it('should compute consistent SHA-256 content hashes for tamper detection', () => {
    const payload = {
      examId: 'exm_001',
      questions: [{ id: 'q_1', answer: 'A' }, { id: 'q_2', answer: 'B' }],
    };

    const hash1 = DeterministicPRNG.computeContentHash(payload);
    const hash2 = DeterministicPRNG.computeContentHash(payload);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);

    const modifiedPayload = {
      examId: 'exm_001',
      questions: [{ id: 'q_1', answer: 'C' }, { id: 'q_2', answer: 'B' }],
    };
    const modifiedHash = DeterministicPRNG.computeContentHash(modifiedPayload);
    expect(modifiedHash).not.toBe(hash1);
  });
});
