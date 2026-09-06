import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestTaxonomyDb, TestTaxonomyContext } from './helpers/test-db.helper.js';
import { ManageNodeUseCase } from '../src/application/use-cases/manage-node.use-case.js';
import {
  CycleDetectedError,
  InvalidHierarchyError,
  TaxonomyNodeNotFoundError,
  DuplicateNodeSlugError,
} from '../src/domain/errors/taxonomy-domain.errors.js';

describe('Cycle Prevention & Hierarchy Invariant Specification', () => {
  let context: TestTaxonomyContext;
  let useCase: ManageNodeUseCase;

  beforeAll(async () => {
    context = await setupTestTaxonomyDb();
    useCase = new ManageNodeUseCase(context.repo);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  describe('1. Direct Self-Reference Cycle Prevention', () => {
    it('should reject moving a node to be its own parent', async () => {
      await expect(
        useCase.moveNode('node_topic_math', { newParentId: 'node_topic_math' })
      ).rejects.toThrow(CycleDetectedError);
    });

    it('should allow moving a node to root (newParentId = null)', async () => {
      // Algebra is currently a child of Math, let's test moving to root
      const moved = await useCase.moveNode('node_topic_math_geometry', { newParentId: null });
      expect(moved.parentId).toBeNull();

      // Move it back under Math
      const restored = await useCase.moveNode('node_topic_math_geometry', {
        newParentId: 'node_topic_math',
      });
      expect(restored.parentId).toBe('node_topic_math');
    });
  });

  describe('2. Transitive / Descendant Subtree Cycle Prevention', () => {
    it('should reject reparenting an ancestor node into its own descendant subtree', async () => {
      // Math -> Algebra -> Algebra 10
      // Moving Math under Algebra 10 would create an infinite loop
      await expect(
        useCase.moveNode('node_topic_math', { newParentId: 'node_topic_math_algebra_10' })
      ).rejects.toThrow(CycleDetectedError);
    });

    it('should reject reparenting an ancestor node into its immediate child', async () => {
      // Moving Math under Algebra
      await expect(
        useCase.moveNode('node_topic_math', { newParentId: 'node_topic_math_algebra' })
      ).rejects.toThrow(CycleDetectedError);
    });

    it('should allow moving a child node to another branch in the same taxonomy', async () => {
      // Create a test child under Web Dev
      const testNode = await useCase.createNode('TOPIC', {
        name: 'React Fundamentals',
        slug: 'react-fundamentals',
        parentId: 'node_topic_it_web',
      });
      expect(testNode.parentId).toBe('node_topic_it_web');

      // Move it under Database branch
      const moved = await useCase.moveNode(testNode.id, {
        newParentId: 'node_topic_it_db',
      });
      expect(moved.parentId).toBe('node_topic_it_db');
    });
  });

  describe('3. Hierarchy Invariants & Flat Taxonomy Guard', () => {
    it('should reject creating a node with a parent inside a flat taxonomy', async () => {
      await expect(
        useCase.createNode('DIFFICULTY', {
          name: 'Super Easy',
          slug: 'super-easy',
          parentId: 'node_diff_easy',
        })
      ).rejects.toThrow(InvalidHierarchyError);
    });

    it('should reject moving a node to have a parent in a flat taxonomy', async () => {
      await expect(
        useCase.moveNode('node_diff_hard', { newParentId: 'node_diff_easy' })
      ).rejects.toThrow(InvalidHierarchyError);
    });

    it('should reject reparenting to a non-existent parent node ID', async () => {
      await expect(
        useCase.moveNode('node_topic_math_algebra', { newParentId: 'node_non_existent_999' })
      ).rejects.toThrow(TaxonomyNodeNotFoundError);
    });
  });

  describe('4. Slug Uniqueness Within Taxonomy', () => {
    it('should reject creating duplicate slug within the same taxonomy', async () => {
      await expect(
        useCase.createNode('TOPIC', {
          name: 'Toán Học Trùng',
          slug: 'toan-hoc', // already exists for node_topic_math
        })
      ).rejects.toThrow(DuplicateNodeSlugError);
    });

    it('should allow identical slug in a different taxonomy', async () => {
      // TAG taxonomy does not have 'toan-hoc'
      const tagNode = await useCase.createNode('TAG', {
        name: 'Toán Học Tag',
        slug: 'toan-hoc',
      });
      expect(tagNode.slug).toBe('toan-hoc');
      expect(tagNode.taxonomyId).toBe('tax_tag');
    });
  });
});
