import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/presentation/server.js';

describe('Server Timing Hardening: Precision Clock API & Headers', () => {
  it('should include X-Server-Time and X-Server-Timestamp headers on all responses', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-server-time']).toBeDefined();
    expect(res.headers['x-server-timestamp']).toBeDefined();

    // Must be valid ISO string
    const date = new Date(res.headers['x-server-time']);
    expect(isNaN(date.getTime())).toBe(false);

    // Timestamp must match parsed date within reasonable delta
    const timestamp = parseInt(res.headers['x-server-timestamp'], 10);
    expect(Math.abs(date.getTime() - timestamp)).toBeLessThan(100);
  });

  it('should expose timing headers in Access-Control-Expose-Headers for browser client consumption', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['access-control-expose-headers']).toContain('X-Server-Time');
    expect(res.headers['access-control-expose-headers']).toContain('X-Server-Timestamp');
  });

  it('should serve dedicated synchronization endpoint at GET /v1/time', async () => {
    const beforeReq = Date.now();
    const res = await request(app).get('/v1/time');
    const afterReq = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.serverTime).toBeDefined();
    expect(res.body.timestampMs).toBeDefined();

    expect(res.body.timestampMs).toBeGreaterThanOrEqual(beforeReq - 50);
    expect(res.body.timestampMs).toBeLessThanOrEqual(afterReq + 50);
  });

  it('should list /v1/time in API root discovery', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    const endpoints = res.body.endpoints;
    const timeEndpoint = endpoints.find((e: any) => e.path === '/v1/time');
    expect(timeEndpoint).toBeDefined();
    expect(timeEndpoint.method).toBe('GET');
  });
});
