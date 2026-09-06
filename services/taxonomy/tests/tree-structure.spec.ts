import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestTaxonomyDb, TestTaxonomyContext } from './helpers/test-db.helper.js';
import { GetTaxonomyTreeUseCase } from '../src/application/use-cases/get-taxonomy-tree.use-case.js';
import { ManageNodeUseCase } from '../src/application/use-cases/manage-node.use-case.js';

describe('Tree Structure Specification (Recursive CTE & Nested Hierarchy)', () => {
  let context: TestTaxonomyContext;
  let getTreeUseCase: GetTaxonomyTreeUseCase;
  let manageNodeUseCase: ManageNodeUseCase;

  beforeAll(async () => {
    context = await setupTestTaxonomyDb();
    getTreeUseCase = new GetTaxonomyTreeUseCase(context.repo);
    manageNodeUseCase = new ManageNodeUseCase(context.repo);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  describe('1. In-Memory O(N) Nested Tree Reconstruction', () => {
    it('should construct a multi-level nested tree respecting parent-child relationships', async () => {
      const treeResult = await getTreeUseCase.execute('TOPIC');

      expect(treeResult.taxonomy.code).toBe('TOPIC');
      expect(treeResult.taxonomy.isHierarchical).toBe(true);

      // Root level nodes
      const rootNames = treeResult.tree.map((n) => n.name);
      expect(rootNames).toContain('Toán học');
      expect(rootNames).toContain('Tin học & Lập trình');

      // Check nested children under 'Toán học'
      const mathNode = treeResult.tree.find((n) => n.id === 'node_topic_math');
      expect(mathNode).toBeDefined();
      expect(mathNode!.children.length).toBeGreaterThanOrEqual(2);

      const mathChildrenNames = mathNode!.children.map((c) => c.name);
      expect(mathChildrenNames).toContain('Đại số');
      expect(mathChildrenNames).toContain('Hình học');

      // Check grandchild under 'Đại số'
      const algebraNode = mathNode!.children.find((c) => c.id === 'node_topic_math_algebra');
      expect(algebraNode).toBeDefined();
      expect(algebraNode!.children.length).toBeGreaterThanOrEqual(1);
      expect(algebraNode!.children[0].id).toBe('node_topic_math_algebra_10');
      expect(algebraNode!.children[0].name).toBe('Đại số 10');
    });

    it('should preserve sort_order when building child nodes', async () => {
      const treeResult = await getTreeUseCase.execute('TOPIC');
      const itNode = treeResult.tree.find((n) => n.id === 'node_topic_it');
      expect(itNode).toBeDefined();

      // Javascript (sortOrder: 1), Python (sortOrder: 2)
      expect(itNode!.children.length).toBeGreaterThanOrEqual(2);
      expect(itNode!.children[0].sortOrder).toBeLessThanOrEqual(itNode!.children[1].sortOrder);
    });

    it('should represent flat taxonomy with all nodes as roots', async () => {
      const treeResult = await getTreeUseCase.execute('DIFFICULTY');
      expect(treeResult.taxonomy.isHierarchical).toBe(false);

      // All difficulty nodes are roots (Easy, Medium, Hard, Expert)
      expect(treeResult.tree.length).toBe(4);
      for (const node of treeResult.tree) {
        expect(node.parentId).toBeNull();
        expect(node.children.length).toBe(0);
      }
    });
  });

  describe('2. Recursive CTE Descendant Identification', () => {
    it('should find all descendant IDs for a root node across multiple levels', async () => {
      const result = await manageNodeUseCase.getDescendantIds('node_topic_math');

      expect(result.rootId).toBe('node_topic_math');
      expect(result.descendantIds).toContain('node_topic_math'); // self
      expect(result.descendantIds).toContain('node_topic_math_algebra'); // level 1 child
      expect(result.descendantIds).toContain('node_topic_math_algebra_10'); // level 2 grandchild
      expect(result.descendantIds).toContain('node_topic_math_geometry'); // level 1 sibling child
      expect(result.descendantIds).not.toContain('node_topic_it'); // outside subtree
    });

    it('should return only self for a leaf node with no children', async () => {
      const result = await manageNodeUseCase.getDescendantIds('node_topic_math_algebra_10');
      expect(result.rootId).toBe('node_topic_math_algebra_10');
      expect(result.descendantIds).toEqual(['node_topic_math_algebra_10']);
    });
  });

  describe('3. Reverse Recursive CTE Breadcrumb Path Construction', () => {
    it('should generate ordered breadcrumb from root to leaf', async () => {
      const breadcrumbs = await manageNodeUseCase.getBreadcrumbs('node_topic_math_algebra_10');

      expect(breadcrumbs.length).toBe(3);
      expect(breadcrumbs[0]).toEqual({
        id: 'node_topic_math',
        name: 'Toán học',
        slug: 'toan-hoc',
      });
      expect(breadcrumbs[1]).toEqual({
        id: 'node_topic_math_algebra',
        name: 'Đại số',
        slug: 'dai-so',
      });
      expect(breadcrumbs[2]).toEqual({
        id: 'node_topic_math_algebra_10',
        name: 'Đại số 10',
        slug: 'dai-so-10',
      });
    });

    it('should return a single item breadcrumb for a root node', async () => {
      const breadcrumbs = await manageNodeUseCase.getBreadcrumbs('node_topic_math');
      expect(breadcrumbs.length).toBe(1);
      expect(breadcrumbs[0].id).toBe('node_topic_math');
    });
  });
});
