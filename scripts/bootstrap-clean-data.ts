/**
 * Unified Master Clean Bootstrap Script
 * Giai đoạn 6: Khởi tạo Dữ liệu Mới (Clean Bootstrap/Seed)
 * Thứ tự khởi tạo: Auth -> Taxonomy -> Question -> Assessment -> Exam -> Attempt
 */

import { seedAuthDb, isAuthDbConfigured } from '../services/auth/src/infrastructure/db/seed.js';
import { seedTaxonomyDatabase, isTaxonomyDbConfigured } from '../services/taxonomy/src/infrastructure/db/seed.js';
import { seedQuestionDatabase, isQuestionDbConfigured } from '../services/question/src/infrastructure/db/seed.js';
import { seedAssessmentDatabase, isAssessmentDbConfigured } from '../services/assessment/src/infrastructure/db/seed.js';
import { seedExamDatabase, isExamDbConfigured } from '../services/exam/src/infrastructure/db/seed.js';
import { seedAttemptDatabase, isAttemptDbConfigured } from '../services/attempt/src/infrastructure/db/seed.js';

async function bootstrapAllServices(): Promise<void> {
  console.log('================================================================');
  console.log('🚀 GIAI ĐOẠN 6: BẮT ĐẦU KHỞI TẠO DỮ LIỆU SẠCH (CLEAN BOOTSTRAP)');
  console.log('   Nguyên tắc: 100% dữ liệu mới chuẩn mực, không tái sử dụng schema cũ');
  console.log('================================================================\n');

  const startTime = Date.now();

  // 1. Auth Service Bootstrap
  console.log('👉 [1/6] Bootstrapping Auth Service (Users, Roles, Permissions)...');
  try {
    if (isAuthDbConfigured()) {
      await seedAuthDb();
      console.log('   ✅ Auth Service seeded successfully.\n');
    } else {
      console.log('   ℹ️ AUTH_DATABASE_URL not set, skipping Auth DB seed.\n');
    }
  } catch (err: any) {
    console.error('   ❌ Auth Service seed failed:', err?.message || err);
  }

  // 2. Taxonomy Service Bootstrap
  console.log('👉 [2/6] Bootstrapping Taxonomy Service (Categories, Nodes, Trees)...');
  try {
    if (isTaxonomyDbConfigured()) {
      await seedTaxonomyDatabase();
      console.log('   ✅ Taxonomy Service seeded successfully.\n');
    } else {
      console.log('   ℹ️ TAXONOMY_DATABASE_URL not set, skipping Taxonomy DB seed.\n');
    }
  } catch (err: any) {
    console.error('   ❌ Taxonomy Service seed failed:', err?.message || err);
  }

  // 3. Question Bank Service Bootstrap
  console.log('👉 [3/6] Bootstrapping Question Bank Service (Bloom Taxonomy Questions)...');
  try {
    if (isQuestionDbConfigured()) {
      await seedQuestionDatabase();
      console.log('   ✅ Question Bank Service seeded successfully.\n');
    } else {
      console.log('   ℹ️ QUESTION_DATABASE_URL not set, skipping Question DB seed.\n');
    }
  } catch (err: any) {
    console.error('   ❌ Question Bank Service seed failed:', err?.message || err);
  }

  // 4. Assessment Service Bootstrap
  console.log('👉 [4/6] Bootstrapping Assessment Service (Blueprints & Criteria Matrices)...');
  try {
    if (isAssessmentDbConfigured()) {
      await seedAssessmentDatabase();
      console.log('   ✅ Assessment Service seeded successfully.\n');
    } else {
      console.log('   ℹ️ ASSESSMENT_DATABASE_URL not set, skipping Assessment DB seed.\n');
    }
  } catch (err: any) {
    console.error('   ❌ Assessment Service seed failed:', err?.message || err);
  }

  // 5. Exam Engine Service Bootstrap
  console.log('👉 [5/6] Bootstrapping Exam Engine Service (MatrixSolver, Variants 101-104, Snapshots)...');
  try {
    if (isExamDbConfigured()) {
      await seedExamDatabase();
      console.log('   ✅ Exam Engine Service seeded successfully.\n');
    } else {
      console.log('   ℹ️ EXAM_DATABASE_URL not set, skipping Exam DB seed.\n');
    }
  } catch (err: any) {
    console.error('   ❌ Exam Engine Service seed failed:', err?.message || err);
  }

  // 6. Attempt Service Bootstrap
  console.log('👉 [6/6] Bootstrapping Attempt Service (Runtime Sessions & Telemetry Logs)...');
  try {
    if (isAttemptDbConfigured()) {
      await seedAttemptDatabase();
      console.log('   ✅ Attempt Service seeded successfully.\n');
    } else {
      console.log('   ℹ️ ATTEMPT_DATABASE_URL not set, skipping Attempt DB seed.\n');
    }
  } catch (err: any) {
    console.error('   ❌ Attempt Service seed failed:', err?.message || err);
  }

  const elapsed = Date.now() - startTime;
  console.log('================================================================');
  console.log(`🎉 HOÀN TẤT KHỞI TẠO DỮ LIỆU SẠCH 6 DỊCH VỤ TRONG ${elapsed}ms`);
  console.log('================================================================');
}

bootstrapAllServices()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
