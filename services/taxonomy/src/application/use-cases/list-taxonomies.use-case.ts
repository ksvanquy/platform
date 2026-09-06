import type { TaxonomyRepositoryPort } from '../../domain/ports/taxonomy.repository.port.js';
import type { TaxonomyDTO } from '@platform/contracts';

export class ListTaxonomiesUseCase {
  constructor(private readonly taxonomyRepo: TaxonomyRepositoryPort) {}

  async execute(): Promise<TaxonomyDTO[]> {
    const list = await this.taxonomyRepo.findTaxonomies();
    return list.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      isHierarchical: t.isHierarchical,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  }
}
