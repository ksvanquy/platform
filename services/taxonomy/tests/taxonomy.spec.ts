import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { setupTestTaxonomyDb, TestTaxonomyContext } from './helpers/test-db.helper.js';
import { createTaxonomyModule } from '../src/presentation/routes/index.js';
import { CycleDetectedError, InvalidHierarchyError } from '../src/domain/errors/taxonomy-domain.errors.js';

describe('Taxonomy Service Specification (@platform/taxonomy-service)', () => {
  let context: TestTaxonomyContext;
  let app: Express;
  let module: ReturnType<typeof createTaxonomyModule>;

  beforeAll(async () => {
    context = await setupTestTaxonomyDb();
    module = createTaxonomyModule(context.repo);

    app = express();
    app.use(express.json());
    app.use('/v1', module.combinedRouter);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  describe('1. Domain & Seed Verification', () => {
    it('should have seeded 3 taxonomies (TOPIC, DIFFICULTY, TAG)', async () => {
      const taxonomies = await context.repo.findTaxonomies();
      expect(taxonomies.length).toBeGreaterThanOrEqual(3);

      const codes = taxonomies.map((t) => t.code);
      expect(codes).toContain('TOPIC');
      expect(codes).toContain('DIFFICULTY');
      expect(codes).toContain('TAG');
    });

    it('should retrieve seeded nodes for TOPIC with parent-child links', async () => {
      const nodes = await context.repo.findNodesByTaxonomyId('tax_topic');
      expect(nodes.length).toBeGreaterThanOrEqual(7);

      const math = nodes.find((n) => n.id === 'node_topic_math');
      const algebra = nodes.find((n) => n.id === 'node_topic_math_algebra');
      const algebra10 = nodes.find((n) => n.id === 'node_topic_math_algebra_10');

      expect(math).toBeDefined();
      expect(math?.parentId).toBeNull();
      expect(algebra?.parentId).toBe('node_topic_math');
      expect(algebra10?.parentId).toBe('node_topic_math_algebra');
    });
  });

  describe('2. Use Cases: Nested Tree & Recursive CTE', () => {
    it('should build a nested tree in O(N) with correct hierarchy', async () => {
      const { GetTaxonomyTreeUseCase } = await import('../src/application/use-cases/get-taxonomy-tree.use-case.js');
      const useCase = new GetTaxonomyTreeUseCase(context.repo);

      const result = await useCase.execute('TOPIC');
      expect(result.taxonomy.code).toBe('TOPIC');
      expect(result.tree.length).toBeGreaterThanOrEqual(2); // Math and IT roots

      const mathRoot = result.tree.find((n) => n.id === 'node_topic_math');
      expect(mathRoot).toBeDefined();
      expect(mathRoot?.children.length).toBeGreaterThanOrEqual(2); // Algebra, Geometry

      const algebraNode = mathRoot?.children.find((n) => n.id === 'node_topic_math_algebra');
      expect(algebraNode).toBeDefined();
      expect(algebraNode?.children.length).toBeGreaterThanOrEqual(1);

      const algebra10Node = algebraNode?.children.find((n) => n.id === 'node_topic_math_algebra_10');
      expect(algebra10Node).toBeDefined();
      expect(algebra10Node?.name).toBe('Đại số 10');
    });

    it('should return all descendant IDs using Recursive CTE (findDescendantIds)', async () => {
      const descendants = await context.repo.findDescendantIds('node_topic_math');
      expect(descendants).toContain('node_topic_math');
      expect(descendants).toContain('node_topic_math_algebra');
      expect(descendants).toContain('node_topic_math_algebra_10');
      expect(descendants).toContain('node_topic_math_geometry');
      expect(descendants).not.toContain('node_topic_it');
    });

    it('should return breadcrumbs from root to leaf using reverse Recursive CTE', async () => {
      const breadcrumbs = await context.repo.findBreadcrumbs('node_topic_math_algebra_10');
      expect(breadcrumbs.length).toBe(3);
      expect(breadcrumbs[0].name).toBe('Toán học');
      expect(breadcrumbs[1].name).toBe('Đại số');
      expect(breadcrumbs[2].name).toBe('Đại số 10');
    });
  });

  describe('3. Cycle Prevention & Hierarchy Validation', () => {
    it('should reject moving a node to be a child of itself', async () => {
      const { ManageNodeUseCase } = await import('../src/application/use-cases/manage-node.use-case.js');
      const useCase = new ManageNodeUseCase(context.repo);

      await expect(
        useCase.moveNode('node_topic_math', { newParentId: 'node_topic_math' })
      ).rejects.toThrow(CycleDetectedError);
    });

    it('should reject moving a root node to be a child of its own descendant (cycle prevention)', async () => {
      const { ManageNodeUseCase } = await import('../src/application/use-cases/manage-node.use-case.js');
      const useCase = new ManageNodeUseCase(context.repo);

      // Attempting to make Math a child of Algebra 10 (which is its grandchild)
      await expect(
        useCase.moveNode('node_topic_math', { newParentId: 'node_topic_math_algebra_10' })
      ).rejects.toThrow(CycleDetectedError);
    });

    it('should reject creating a node with a parent in a flat (non-hierarchical) taxonomy', async () => {
      const { ManageNodeUseCase } = await import('../src/application/use-cases/manage-node.use-case.js');
      const useCase = new ManageNodeUseCase(context.repo);

      await expect(
        useCase.createNode('DIFFICULTY', {
          name: 'Invalid Child Difficulty',
          parentId: 'node_diff_easy',
        })
      ).rejects.toThrow(InvalidHierarchyError);
    });
  });

  describe('4. REST API Integration Endpoints', () => {
    it('GET /v1/taxonomies should be public and return 200 with list', async () => {
      const res = await request(app).get('/v1/taxonomies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('GET /v1/taxonomies/:code/tree should return full nested tree', async () => {
      const res = await request(app).get('/v1/taxonomies/TOPIC/tree');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.taxonomy.code).toBe('TOPIC');
      expect(Array.isArray(res.body.data.tree)).toBe(true);
    });

    it('GET /v1/nodes/:id/descendant-ids should return descendant IDs list', async () => {
      const res = await request(app).get('/v1/nodes/node_topic_math/descendant-ids');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rootId).toBe('node_topic_math');
      expect(res.body.data.descendantIds).toContain('node_topic_math_algebra_10');
    });

    it('GET /v1/nodes/:id/breadcrumbs should return path to root', async () => {
      const res = await request(app).get('/v1/nodes/node_topic_math_algebra_10/breadcrumbs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].name).toBe('Toán học');
    });

    it('POST /v1/taxonomies should require ADMIN role and reject unauthorized', async () => {
      const res = await request(app)
        .post('/v1/taxonomies')
        .send({ code: 'CUSTOM_TEST', name: 'Custom Test' });
      expect(res.status).toBe(401);
    });

    it('POST /v1/taxonomies should succeed with ADMIN credentials', async () => {
      const res = await request(app)
        .post('/v1/taxonomies')
        .set('x-user-id', 'admin_tester')
        .set('x-user-roles', 'ADMIN')
        .send({
          code: 'CERTIFICATION',
          name: 'Chứng chỉ nghề nghiệp',
          description: 'Các chứng chỉ kỹ sư và chuyên gia',
          isHierarchical: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('CERTIFICATION');
      expect(res.body.data.name).toBe('Chứng chỉ nghề nghiệp');
    });

    it('POST /v1/taxonomies/:code/nodes should create node when ADMIN', async () => {
      const res = await request(app)
        .post('/v1/taxonomies/CERTIFICATION/nodes')
        .set('x-user-id', 'admin_tester')
        .set('x-user-roles', 'ADMIN')
        .send({
          name: 'Cloud Architect',
          slug: 'cloud-architect',
          description: 'Chứng chỉ kiến trúc sư đám mây',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Cloud Architect');
      expect(res.body.data.slug).toBe('cloud-architect');
    });
  });

  describe('5. Standalone Server Operation (@platform/taxonomy-service)', () => {
    it('GET /health on standalone server returns 200 with service name', async () => {
      const { createTaxonomyServer } = await import('../src/presentation/server.js');
      const standaloneApp = createTaxonomyServer(context.repo);

      const res = await request(standaloneApp).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('@platform/taxonomy-service');
      expect(res.body.timestamp).toBeDefined();
    });

    it('OPTIONS /health on standalone server responds with CORS 204', async () => {
      const { createTaxonomyServer } = await import('../src/presentation/server.js');
      const standaloneApp = createTaxonomyServer(context.repo);

      const res = await request(standaloneApp).options('/health');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('GET /v1/taxonomies on standalone server delivers taxonomy catalog', async () => {
      const { createTaxonomyServer } = await import('../src/presentation/server.js');
      const standaloneApp = createTaxonomyServer(context.repo);

      const res = await request(standaloneApp).get('/v1/taxonomies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});

