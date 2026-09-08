import { describe, it, expect } from 'vitest';
import {
  sanitizePostgresUrl,
  getAssessmentDb,
} from '../src/infrastructure/db/connection.js';

describe('Assessment Service: PostgreSQL Persistence & Connection Rules', () => {
  it('should throw fatal error when ASSESSMENT_DATABASE_URL is not set', () => {
    const originalUrl = process.env.ASSESSMENT_DATABASE_URL;
    delete process.env.ASSESSMENT_DATABASE_URL;

    try {
      expect(() => getAssessmentDb()).toThrow(
        /FATAL ERROR: ASSESSMENT_DATABASE_URL is not defined/
      );
    } finally {
      if (originalUrl) process.env.ASSESSMENT_DATABASE_URL = originalUrl;
    }
  });

  it('should sanitize schema parameters from postgres urls', () => {
    const raw = 'postgres://postgres:pass@localhost:5432/assessment_db?schema=public';
    const sanitized = sanitizePostgresUrl(raw);
    expect(sanitized).not.toContain('schema=public');
    expect(sanitized).toBe('postgres://postgres:pass@localhost:5432/assessment_db');
  });
});
