import { describe, it, expect } from 'vitest';
import {
  sanitizePostgresUrl,
  getQuestionDb,
} from '../src/infrastructure/db/connection.js';

describe('Question Service: PostgreSQL Persistence & Connection Rules', () => {
  it('should throw fatal error when QUESTION_DATABASE_URL is not set', () => {
    const originalUrl = process.env.QUESTION_DATABASE_URL;
    delete process.env.QUESTION_DATABASE_URL;

    try {
      expect(() => getQuestionDb()).toThrow(
        /FATAL ERROR: QUESTION_DATABASE_URL is not defined/
      );
    } finally {
      if (originalUrl) process.env.QUESTION_DATABASE_URL = originalUrl;
    }
  });

  it('should sanitize schema parameters from postgres urls', () => {
    const raw = 'postgres://postgres:pass@localhost:5432/question_db?schema=public';
    const sanitized = sanitizePostgresUrl(raw);
    expect(sanitized).not.toContain('schema=public');
    expect(sanitized).toBe('postgres://postgres:pass@localhost:5432/question_db');
  });
});
