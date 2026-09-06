import type { TaxonomyRepositoryPort } from '../../domain/ports/taxonomy.repository.port.js';
import { TaxonomyNotFoundError } from '../../domain/errors/taxonomy-domain.errors.js';
import type { TaxonomyTreeDTO, TaxonomyTreeNodeDTO } from '@platform/contracts';
import type { TaxonomyNode } from '../../domain/entities/taxonomy.entity.js';

export class GetTaxonomyTreeUseCase {
  constructor(private readonly taxonomyRepo: TaxonomyRepositoryPort) {}

  async execute(codeOrId: string): Promise<TaxonomyTreeDTO> {
    const taxonomy = await this.taxonomyRepo.findTaxonomyByIdOrCode(codeOrId);
    if (!taxonomy) {
      throw new TaxonomyNotFoundError(codeOrId);
    }

    const nodes = await this.taxonomyRepo.findNodesByTaxonomyId(taxonomy.id, false);

    const tree = this.buildNestedTree(nodes);

    return {
      taxonomy: {
        id: taxonomy.id,
        code: taxonomy.code,
        name: taxonomy.name,
        description: taxonomy.description,
        isHierarchical: taxonomy.isHierarchical,
        createdAt: taxonomy.createdAt.toISOString(),
        updatedAt: taxonomy.updatedAt.toISOString(),
      },
      tree,
    };
  }

  private buildNestedTree(nodes: TaxonomyNode[]): TaxonomyTreeNodeDTO[] {
    const map = new Map<string, TaxonomyTreeNodeDTO>();
    const roots: TaxonomyTreeNodeDTO[] = [];

    // Bước 1: Khởi tạo tất cả các node vào map kèm mảng children rỗng
    for (const n of nodes) {
      map.set(n.id, {
        id: n.id,
        taxonomyId: n.taxonomyId,
        parentId: n.parentId,
        name: n.name,
        slug: n.slug,
        description: n.description,
        sortOrder: n.sortOrder,
        status: n.status,
        metadata: n.metadata,
        deletedAt: n.deletedAt ? n.deletedAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        children: [],
      });
    }

    // Bước 2: Nối con vào cha, các nút không có cha hoặc cha ngoài danh sách sẽ là root
    for (const n of nodes) {
      const item = map.get(n.id)!;
      if (n.parentId && map.has(n.parentId)) {
        map.get(n.parentId)!.children.push(item);
      } else {
        roots.push(item);
      }
    }

    return roots;
  }
}
