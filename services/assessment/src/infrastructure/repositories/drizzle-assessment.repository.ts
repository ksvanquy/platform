import { eq, and, sql, ilike, desc } from 'drizzle-orm';
import type {
  AssessmentRepositoryPort,
  AssessmentFilterQuery,
} from '../../domain/ports/assessment.repository.port.js';
import { Assessment, Blueprint } from '../../domain/entities/assessment.entity.js';
import {
  assessments,
  blueprints,
  type AssessmentRow,
  type BlueprintRow,
} from '../db/schema.js';
import { getAssessmentDb } from '../db/connection.js';

export class DrizzleAssessmentRepository implements AssessmentRepositoryPort {
  private db: any;

  constructor(db?: any) {
    this.db = db || getAssessmentDb();
  }

  private mapBlueprintToDomain(row: BlueprintRow): Blueprint {
    return new Blueprint({
      id: row.id,
      assessmentId: row.assessmentId,
      versionNumber: row.versionNumber,
      durationMinutes: row.durationMinutes,
      passingPercentage: row.passingPercentage,
      maxAttempts: row.maxAttempts,
      criteria: (row.criteria as any) || [],
      scoringPolicy: (row.scoringPolicy as any) || { strategyType: 'STANDARD', roundingDecimal: 2 },
      isLocked: row.isLocked,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapAssessmentToDomain(row: AssessmentRow, bpRow?: BlueprintRow | null): Assessment {
    const bp = bpRow ? this.mapBlueprintToDomain(bpRow) : undefined;
    return new Assessment({
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description || undefined,
      ownerId: row.ownerId,
      primaryTopicNodeId: row.primaryTopicNodeId,
      gradeNodeId: row.gradeNodeId,
      status: row.status as any,
      currentBlueprintId: row.currentBlueprintId,
      currentBlueprint: bp,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async saveAssessment(assessment: Assessment, blueprint?: Blueprint): Promise<Assessment> {
    const bpToSave = blueprint || assessment.currentBlueprint;

    await this.db
      .insert(assessments)
      .values({
        id: assessment.id,
        code: assessment.code,
        title: assessment.title,
        description: assessment.description,
        ownerId: assessment.ownerId,
        primaryTopicNodeId: assessment.primaryTopicNodeId,
        gradeNodeId: assessment.gradeNodeId,
        status: assessment.status,
        currentBlueprintId: bpToSave ? bpToSave.id : assessment.currentBlueprintId,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
      })
      .onConflictDoUpdate({
        target: assessments.id,
        set: {
          code: assessment.code,
          title: assessment.title,
          description: assessment.description,
          status: assessment.status,
          primaryTopicNodeId: assessment.primaryTopicNodeId,
          gradeNodeId: assessment.gradeNodeId,
          currentBlueprintId: bpToSave ? bpToSave.id : assessment.currentBlueprintId,
          updatedAt: new Date(),
        },
      });

    if (bpToSave) {
      await this.saveBlueprint(bpToSave);
    }

    return (await this.findAssessmentById(assessment.id))!;
  }

  async findAssessmentById(id: string): Promise<Assessment | null> {
    const rows = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const aRow = rows[0];

    let bpRow: BlueprintRow | null = null;
    if (aRow.currentBlueprintId) {
      const bpRows = await this.db
        .select()
        .from(blueprints)
        .where(eq(blueprints.id, aRow.currentBlueprintId))
        .limit(1);
      if (bpRows.length > 0) bpRow = bpRows[0];
    }

    return this.mapAssessmentToDomain(aRow, bpRow);
  }

  async findAssessmentByCode(code: string): Promise<Assessment | null> {
    const rows = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.code, code.trim()))
      .limit(1);

    if (rows.length === 0) return null;
    const aRow = rows[0];

    let bpRow: BlueprintRow | null = null;
    if (aRow.currentBlueprintId) {
      const bpRows = await this.db
        .select()
        .from(blueprints)
        .where(eq(blueprints.id, aRow.currentBlueprintId))
        .limit(1);
      if (bpRows.length > 0) bpRow = bpRows[0];
    }

    return this.mapAssessmentToDomain(aRow, bpRow);
  }

  async listAssessments(filter: AssessmentFilterQuery = {}): Promise<{ assessments: Assessment[]; total: number }> {
    const conditions = [];

    if (filter.status) {
      conditions.push(eq(assessments.status, filter.status));
    }
    if (filter.primaryTopicNodeId) {
      conditions.push(eq(assessments.primaryTopicNodeId, filter.primaryTopicNodeId));
    }
    if (filter.gradeNodeId) {
      conditions.push(eq(assessments.gradeNodeId, filter.gradeNodeId));
    }
    if (filter.ownerId) {
      conditions.push(eq(assessments.ownerId, filter.ownerId));
    }
    if (filter.search) {
      const pattern = `%${filter.search.trim()}%`;
      conditions.push(
        sql`(${assessments.title} ILIKE ${pattern} OR ${assessments.code} ILIKE ${pattern})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countRes = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(assessments)
      .where(whereClause);

    const total = Number(countRes[0]?.count || 0);

    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset && filter.offset >= 0 ? filter.offset : 0;

    const rows = await this.db
      .select()
      .from(assessments)
      .where(whereClause)
      .orderBy(desc(assessments.createdAt))
      .limit(limit)
      .offset(offset);

    const blueprintIds = rows
      .map((r: AssessmentRow) => r.currentBlueprintId)
      .filter((id: string | null): id is string => Boolean(id));

    const bpMap = new Map<string, BlueprintRow>();
    if (blueprintIds.length > 0) {
      const bpRows = await this.db
        .select()
        .from(blueprints)
        .where(sql`${blueprints.id} IN ${blueprintIds}`);
      for (const bp of bpRows) {
        bpMap.set(bp.id, bp);
      }
    }

    const domainAssessments = rows.map((r: AssessmentRow) =>
      this.mapAssessmentToDomain(r, r.currentBlueprintId ? bpMap.get(r.currentBlueprintId) : null)
    );

    return { assessments: domainAssessments, total };
  }

  async deleteAssessment(id: string): Promise<boolean> {
    await this.db.delete(assessments).where(eq(assessments.id, id));
    return true;
  }

  async saveBlueprint(blueprint: Blueprint): Promise<Blueprint> {
    await this.db
      .insert(blueprints)
      .values({
        id: blueprint.id,
        assessmentId: blueprint.assessmentId,
        versionNumber: blueprint.versionNumber,
        durationMinutes: blueprint.durationMinutes,
        passingPercentage: blueprint.passingPercentage,
        maxAttempts: blueprint.maxAttempts,
        criteria: blueprint.criteria as any,
        scoringPolicy: blueprint.scoringPolicy as any,
        isLocked: blueprint.isLocked,
        createdAt: blueprint.createdAt,
        updatedAt: blueprint.updatedAt,
      })
      .onConflictDoUpdate({
        target: [blueprints.assessmentId, blueprints.versionNumber],
        set: {
          durationMinutes: blueprint.durationMinutes,
          passingPercentage: blueprint.passingPercentage,
          maxAttempts: blueprint.maxAttempts,
          criteria: blueprint.criteria as any,
          scoringPolicy: blueprint.scoringPolicy as any,
          isLocked: blueprint.isLocked,
          updatedAt: new Date(),
        },
      });

    return (await this.findBlueprintById(blueprint.id))!;
  }

  async findBlueprintById(id: string): Promise<Blueprint | null> {
    const rows = await this.db
      .select()
      .from(blueprints)
      .where(eq(blueprints.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapBlueprintToDomain(rows[0]);
  }

  async findLatestBlueprintByAssessmentId(assessmentId: string): Promise<Blueprint | null> {
    const rows = await this.db
      .select()
      .from(blueprints)
      .where(eq(blueprints.assessmentId, assessmentId))
      .orderBy(desc(blueprints.versionNumber))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapBlueprintToDomain(rows[0]);
  }

  async listBlueprintsByAssessmentId(assessmentId: string): Promise<Blueprint[]> {
    const rows = await this.db
      .select()
      .from(blueprints)
      .where(eq(blueprints.assessmentId, assessmentId))
      .orderBy(desc(blueprints.versionNumber));

    return rows.map((r: BlueprintRow) => this.mapBlueprintToDomain(r));
  }
}
