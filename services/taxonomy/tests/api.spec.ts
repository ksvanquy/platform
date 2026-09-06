import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestTaxonomyDb, TestTaxonomyContext } from './helpers/test-db.helper.js';
import { startTaxonomyServer, StandaloneTaxonomyServer } from '../src/presentation/server.js';
import { createApiClient, ApiClient } from '../../../packages/api-client/src/index.js';

describe('Microservice Autonomy & API Endpoints Specification (@platform/taxonomy-service)', () => {
  let context: TestTaxonomyContext;
  let serverInstance: StandaloneTaxonomyServer;
  let client: ApiClient;
  let adminToken: string;
  let testPort: number;

  beforeAll(async () => {
    context = await setupTestTaxonomyDb();

    // Pick a test port for standalone server (3092 to avoid conflicts)
    testPort = 3092;
    serverInstance = await startTaxonomyServer(testPort, context.repo);

    // Setup ApiClient pointing to standalone server
    client = createApiClient({
      baseUrl: `http://127.0.0.1:${testPort}`,
      headers: {
        'x-user-id': 'admin_autonomous_tester',
        'x-user-roles': 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await serverInstance.close();
    await context.cleanup();
  });

  describe('1. Standalone Taxonomy Server Lifecycle & Observability', () => {
    it('GET /health returns 200 with service metadata and status', async () => {
      const res = await request(serverInstance.app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('@platform/taxonomy-service');
      expect(res.body.port).toBe(testPort);
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET / and GET /api return Discovery metadata of all taxonomy endpoints', async () => {
      const res = await request(serverInstance.app).get('/api');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('@platform/taxonomy-service');
      expect(Array.isArray(res.body.endpoints)).toBe(true);

      const paths = res.body.endpoints.map((e: any) => e.path);
      expect(paths).toContain('/health');
      expect(paths).toContain('/v1/taxonomies');
      expect(paths).toContain('/v1/taxonomies/:codeOrId/tree');
      expect(paths).toContain('/v1/nodes/:id/descendant-ids');
    });

    it('OPTIONS requests respond with CORS 204 and allowed headers', async () => {
      const res = await request(serverInstance.app)
        .options('/v1/taxonomies')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-methods']).toContain('GET');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });

    it('GET /v1/taxonomies/:code/tree supports ETag and responds 304 on cache hit', async () => {
      const res1 = await request(serverInstance.app).get('/v1/taxonomies/TOPIC/tree');
      expect(res1.status).toBe(200);
      const etag = res1.headers['etag'];
      expect(etag).toBeDefined();

      // Second request with If-None-Match
      const res2 = await request(serverInstance.app)
        .get('/v1/taxonomies/TOPIC/tree')
        .set('If-None-Match', etag);

      expect(res2.status).toBe(304);
    });
  });

  describe('2. Public Endpoints via Client SDK (@platform/api-client)', () => {
    it('client.taxonomies.list() retrieves all seeded taxonomies', async () => {
      const res = await client.taxonomies.list();
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data!.length).toBeGreaterThanOrEqual(3);

      const codes = res.data!.map((t) => t.code);
      expect(codes).toContain('TOPIC');
      expect(codes).toContain('DIFFICULTY');
      expect(codes).toContain('TAG');
    });

    it('client.taxonomies.get(code) retrieves taxonomy metadata', async () => {
      const res = await client.taxonomies.get('TOPIC');
      expect(res.success).toBe(true);
      expect(res.data!.code).toBe('TOPIC');
      expect(res.data!.name).toBe('Chủ đề kiến thức');
      expect(res.data!.isHierarchical).toBe(true);
    });

    it('client.taxonomies.getTree(code) retrieves hierarchical node structure', async () => {
      const res = await client.taxonomies.getTree('TOPIC');
      expect(res.success).toBe(true);
      expect(res.data!.taxonomy.code).toBe('TOPIC');
      expect(Array.isArray(res.data!.tree)).toBe(true);

      const mathRoot = res.data!.tree.find((n) => n.id === 'node_topic_math');
      expect(mathRoot).toBeDefined();
      expect(mathRoot!.children.length).toBeGreaterThanOrEqual(2);
    });

    it('client.taxonomies.getDescendantIds(nodeId) returns subtree node IDs', async () => {
      const res = await client.taxonomies.getDescendantIds('node_topic_math');
      expect(res.success).toBe(true);
      expect(res.data!.rootId).toBe('node_topic_math');
      expect(res.data!.descendantIds).toContain('node_topic_math');
      expect(res.data!.descendantIds).toContain('node_topic_math_algebra');
      expect(res.data!.descendantIds).toContain('node_topic_math_algebra_10');
    });

    it('client.taxonomies.getBreadcrumbs(nodeId) returns reverse path to root', async () => {
      const res = await client.taxonomies.getBreadcrumbs('node_topic_math_algebra_10');
      expect(res.success).toBe(true);
      expect(res.data!.length).toBe(3);
      expect(res.data![0].name).toBe('Toán học');
      expect(res.data![1].name).toBe('Đại số');
      expect(res.data![2].name).toBe('Đại số 10');
    });
  });

  describe('3. Admin Operations & Role-Based Authorization Guard', () => {
    it('unauthenticated requests to write endpoints should return 401', async () => {
      const unauthRes = await request(serverInstance.app)
        .post('/v1/taxonomies')
        .send({ code: 'UNAUTH_TEST', name: 'Unauth Test' });

      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.success).toBe(false);
    });

    it('non-admin user (STUDENT) requests to write endpoints should return 403 Forbidden', async () => {
      const forbiddenRes = await request(serverInstance.app)
        .post('/v1/taxonomies')
        .set('x-user-id', 'student_user_1')
        .set('x-user-roles', 'STUDENT')
        .send({ code: 'STUDENT_TEST', name: 'Student Test' });

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.success).toBe(false);
      expect(forbiddenRes.body.errorCode).toBe('FORBIDDEN');
    });

    it('admin user can create, update, and manage taxonomies & nodes', async () => {
      // 1. Create taxonomy
      const createTaxRes = await client.taxonomies.create({
        code: 'COMPETENCY',
        name: 'Khung năng lực',
        description: 'Đánh giá kỹ năng chuẩn',
        isHierarchical: true,
      });
      expect(createTaxRes.success).toBe(true);
      expect(createTaxRes.data!.code).toBe('COMPETENCY');

      // 2. Create node under COMPETENCY
      const createNodeRes = await client.taxonomies.createNode('COMPETENCY', {
        name: 'Tư duy logic',
        slug: 'tu-duy-logic',
        description: 'Năng lực suy luận logic và phân tích',
      });
      expect(createNodeRes.success).toBe(true);
      expect(createNodeRes.data!.name).toBe('Tư duy logic');
      const nodeId = createNodeRes.data!.id;

      // 3. Update node
      const updateNodeRes = await client.taxonomies.updateNode(nodeId, {
        name: 'Tư duy logic nâng cao',
      });
      expect(updateNodeRes.success).toBe(true);
      expect(updateNodeRes.data!.name).toBe('Tư duy logic nâng cao');

      // 4. Delete node (Soft delete)
      const deleteNodeRes = await client.taxonomies.deleteNode(nodeId);
      expect(deleteNodeRes.success).toBe(true);

      // Verify node is no longer returned in active tree
      const treeRes = await client.taxonomies.getTree('COMPETENCY');
      expect(treeRes.data!.tree.find((n) => n.id === nodeId)).toBeUndefined();
    });
  });
});
