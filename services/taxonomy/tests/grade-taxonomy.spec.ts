import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestTaxonomyDb, TestTaxonomyContext } from './helpers/test-db.helper.js';
import { startTaxonomyServer, StandaloneTaxonomyServer } from '../src/presentation/server.js';
import { createApiClient, ApiClient } from '../../../packages/api-client/src/index.js';
import { STANDARD_TAXONOMY_CODES } from '../../../packages/contracts/src/taxonomy/taxonomy.js';

describe('Grade Taxonomy & Educational Hierarchy Specification (@platform/taxonomy-service)', () => {
  let context: TestTaxonomyContext;
  let serverInstance: StandaloneTaxonomyServer;
  let client: ApiClient;
  let testPort: number;

  beforeAll(async () => {
    context = await setupTestTaxonomyDb();

    // Use dedicated test port for isolated testing
    testPort = 3093;
    serverInstance = await startTaxonomyServer(testPort, context.repo);

    client = createApiClient({
      baseUrl: `http://127.0.0.1:${testPort}`,
      headers: {
        'x-user-id': 'admin_grade_tester',
        'x-user-roles': 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await serverInstance.close();
    await context.cleanup();
  });

  describe('1. GRADE Taxonomy Entity Metadata', () => {
    it('STANDARD_TAXONOMY_CODES includes GRADE', () => {
      expect(STANDARD_TAXONOMY_CODES.GRADE).toBe('GRADE');
    });

    it('GET /v1/taxonomies/GRADE returns 200 with hierarchical configuration', async () => {
      const res = await request(serverInstance.app).get('/v1/taxonomies/GRADE');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('tax_grade');
      expect(res.body.data.code).toBe('GRADE');
      expect(res.body.data.name).toBe('Khối lớp / Trình độ');
      expect(res.body.data.isHierarchical).toBe(true);
    });

    it('client.taxonomies.get("GRADE") returns valid taxonomy object', async () => {
      const res = await client.taxonomies.get('GRADE');
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data!.code).toBe('GRADE');
      expect(res.data!.isHierarchical).toBe(true);
    });
  });

  describe('2. Two-Tier Educational Hierarchy Tree (Cấp học ➔ Khối lớp)', () => {
    it('GET /v1/taxonomies/GRADE/tree returns 3 educational stage roots', async () => {
      const res = await request(serverInstance.app).get('/v1/taxonomies/GRADE/tree');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const tree = res.body.data.tree;
      expect(Array.isArray(tree)).toBe(true);
      expect(tree.length).toBe(3);

      // Verify roots order: Tiểu học (1), THCS (2), THPT (3)
      expect(tree[0].id).toBe('node_grade_primary');
      expect(tree[0].name).toBe('Tiểu học');
      expect(tree[0].sortOrder).toBe(1);

      expect(tree[1].id).toBe('node_grade_secondary');
      expect(tree[1].name).toBe('Trung học cơ sở');
      expect(tree[1].sortOrder).toBe(2);

      expect(tree[2].id).toBe('node_grade_high');
      expect(tree[2].name).toBe('Trung học phổ thông');
      expect(tree[2].sortOrder).toBe(3);
    });

    it('Tiểu học branch contains 5 grades (Lớp 1 đến Lớp 5) in ascending sort order', async () => {
      const res = await client.taxonomies.getTree('GRADE');
      expect(res.success).toBe(true);

      const primaryStage = res.data!.tree.find((n) => n.id === 'node_grade_primary');
      expect(primaryStage).toBeDefined();
      expect(primaryStage!.children.length).toBe(5);

      const gradeSlugs = primaryStage!.children.map((c) => c.slug);
      expect(gradeSlugs).toEqual(['lop-1', 'lop-2', 'lop-3', 'lop-4', 'lop-5']);

      // Check metadata
      primaryStage!.children.forEach((child, index) => {
        expect(child.metadata).toBeDefined();
        expect((child.metadata as any)?.gradeNum).toBe(index + 1);
      });
    });

    it('Trung học cơ sở branch contains 4 grades (Lớp 6 đến Lớp 9)', async () => {
      const res = await client.taxonomies.getTree('GRADE');
      expect(res.success).toBe(true);

      const secondaryStage = res.data!.tree.find((n) => n.id === 'node_grade_secondary');
      expect(secondaryStage).toBeDefined();
      expect(secondaryStage!.children.length).toBe(4);

      const gradeNames = secondaryStage!.children.map((c) => c.name);
      expect(gradeNames).toEqual(['Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9']);
    });

    it('Trung học phổ thông branch contains 3 grades (Lớp 10 đến Lớp 12)', async () => {
      const res = await client.taxonomies.getTree('GRADE');
      expect(res.success).toBe(true);

      const highStage = res.data!.tree.find((n) => n.id === 'node_grade_high');
      expect(highStage).toBeDefined();
      expect(highStage!.children.length).toBe(3);

      const gradeNames = highStage!.children.map((c) => c.name);
      expect(gradeNames).toEqual(['Lớp 10', 'Lớp 11', 'Lớp 12']);
    });
  });

  describe('3. Recursive CTE Descendant IDs Retrieval', () => {
    it('THPT node returns 4 IDs: [node_grade_high, node_grade_10, node_grade_11, node_grade_12]', async () => {
      const res = await request(serverInstance.app).get('/v1/nodes/node_grade_high/descendant-ids');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rootId).toBe('node_grade_high');

      const ids: string[] = res.body.data.descendantIds;
      expect(ids.length).toBe(4);
      expect(ids).toContain('node_grade_high');
      expect(ids).toContain('node_grade_10');
      expect(ids).toContain('node_grade_11');
      expect(ids).toContain('node_grade_12');
    });

    it('THCS node returns 5 IDs: [node_grade_secondary, node_grade_6, node_grade_7, node_grade_8, node_grade_9]', async () => {
      const res = await client.taxonomies.getDescendantIds('node_grade_secondary');
      expect(res.success).toBe(true);
      expect(res.data!.rootId).toBe('node_grade_secondary');

      const ids = res.data!.descendantIds;
      expect(ids.length).toBe(5);
      expect(ids).toEqual(
        expect.arrayContaining([
          'node_grade_secondary',
          'node_grade_6',
          'node_grade_7',
          'node_grade_8',
          'node_grade_9',
        ])
      );
    });

    it('Tiểu học node returns 6 IDs: [node_grade_primary, node_grade_1..5]', async () => {
      const res = await client.taxonomies.getDescendantIds('node_grade_primary');
      expect(res.success).toBe(true);

      const ids = res.data!.descendantIds;
      expect(ids.length).toBe(6);
      expect(ids).toEqual(
        expect.arrayContaining([
          'node_grade_primary',
          'node_grade_1',
          'node_grade_2',
          'node_grade_3',
          'node_grade_4',
          'node_grade_5',
        ])
      );
    });

    it('Leaf grade node returns only its own ID', async () => {
      const res = await client.taxonomies.getDescendantIds('node_grade_12');
      expect(res.success).toBe(true);
      expect(res.data!.descendantIds).toEqual(['node_grade_12']);
    });
  });

  describe('4. Breadcrumb Invariant Navigation', () => {
    it('Lớp 12 breadcrumbs returns 2 items in ancestor-to-descendant order', async () => {
      const res = await request(serverInstance.app).get('/v1/nodes/node_grade_12/breadcrumbs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const breadcrumbs = res.body.data;
      expect(Array.isArray(breadcrumbs)).toBe(true);
      expect(breadcrumbs.length).toBe(2);

      expect(breadcrumbs[0]).toMatchObject({
        id: 'node_grade_high',
        name: 'Trung học phổ thông',
        slug: 'thpt',
      });
      expect(breadcrumbs[1]).toMatchObject({
        id: 'node_grade_12',
        name: 'Lớp 12',
        slug: 'lop-12',
      });
    });

    it('Lớp 10 breadcrumbs via client SDK returns [THPT, Lớp 10]', async () => {
      const res = await client.taxonomies.getBreadcrumbs('node_grade_10');
      expect(res.success).toBe(true);
      expect(res.data!.length).toBe(2);
      expect(res.data![0].name).toBe('Trung học phổ thông');
      expect(res.data![1].name).toBe('Lớp 10');
    });

    it('Root stage node breadcrumbs returns 1 item containing itself', async () => {
      const res = await client.taxonomies.getBreadcrumbs('node_grade_primary');
      expect(res.success).toBe(true);
      expect(res.data!.length).toBe(1);
      expect(res.data![0].id).toBe('node_grade_primary');
      expect(res.data![0].name).toBe('Tiểu học');
    });
  });
});
