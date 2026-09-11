import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTaxonomyDb, closeTaxonomyDb, isTaxonomyDbConfigured } from './connection.js';
export { isTaxonomyDbConfigured };
import { runTaxonomyMigrations } from './migrate.js';
import { taxonomies, taxonomyNodes, type NewTaxonomyRow, type NewTaxonomyNodeRow } from './schema.js';

export const SEED_TAXONOMIES: NewTaxonomyRow[] = [
  {
    id: 'tax_topic',
    code: 'TOPIC',
    name: 'Chủ đề kiến thức',
    description: 'Cây phân cấp môn học, chuyên đề và bài học khảo thí',
    isHierarchical: true,
  },
  {
    id: 'tax_difficulty',
    code: 'DIFFICULTY',
    name: 'Mức độ đánh giá',
    description: 'Thang đo năng lực và độ phức tạp câu hỏi / đề thi',
    isHierarchical: false,
  },
  {
    id: 'tax_tag',
    code: 'TAG',
    name: 'Thẻ phân loại',
    description: 'Nhãn gắn kèm tự do phục vụ tìm kiếm và chuyên đề thi',
    isHierarchical: false,
  },
  {
    id: 'tax_grade',
    code: 'GRADE',
    name: 'Khối lớp / Trình độ',
    description: 'Hệ thống phân cấp trình độ giáo dục: Cấp học và Khối lớp theo chuẩn EdTech',
    isHierarchical: true,
  },
];

export const SEED_TAXONOMY_NODES: NewTaxonomyNodeRow[] = [
  // 1. Cây Chủ đề: Toán học
  {
    id: 'node_topic_math',
    taxonomyId: 'tax_topic',
    parentId: null,
    name: 'Toán học',
    slug: 'toan-hoc',
    description: 'Chương trình toán học phổ thông và nâng cao',
    sortOrder: 1,
    status: 'PUBLISHED',
  },
  {
    id: 'node_topic_math_algebra',
    taxonomyId: 'tax_topic',
    parentId: 'node_topic_math',
    name: 'Đại số',
    slug: 'dai-so',
    description: 'Đại số tuyến tính, phương trình và hàm số',
    sortOrder: 1,
    status: 'PUBLISHED',
  },
  {
    id: 'node_topic_math_algebra_10',
    taxonomyId: 'tax_topic',
    parentId: 'node_topic_math_algebra',
    name: 'Đại số 10',
    slug: 'dai-so-10',
    description: 'Mệnh đề, tập hợp, bất phương trình và hàm số bậc hai',
    sortOrder: 1,
    status: 'PUBLISHED',
  },
  {
    id: 'node_math_quad_eq',
    taxonomyId: 'tax_topic',
    parentId: 'node_topic_math_algebra_10',
    name: 'Phương trình bậc hai',
    slug: 'phuong-trinh-bac-hai',
    description: 'Phương trình bậc hai, định lý Vi-ét và tam thức bậc hai',
    sortOrder: 1,
    status: 'PUBLISHED',
  },
  {
    id: 'node_phys_kinematics',
    taxonomyId: 'tax_topic',
    parentId: null,
    name: 'Vật lý: Động học chất điểm',
    slug: 'vat-ly-dong-hoc',
    description: 'Chuyển động thẳng đều và biến đổi đều',
    sortOrder: 4,
    status: 'PUBLISHED',
  },
  {
    id: 'node_topic_math_geometry',
    taxonomyId: 'tax_topic',
    parentId: 'node_topic_math',
    name: 'Hình học',
    slug: 'hinh-hoc',
    description: 'Hình học không gian và vector',
    sortOrder: 2,
    status: 'PUBLISHED',
  },

  // 2. Cây Chủ đề: Tin học & Công nghệ
  {
    id: 'node_topic_it',
    taxonomyId: 'tax_topic',
    parentId: null,
    name: 'Tin học & Lập trình',
    slug: 'tin-hoc-lap-trinh',
    description: 'Khoa học máy tính, lập trình phần mềm',
    sortOrder: 2,
    status: 'PUBLISHED',
  },
  {
    id: 'node_topic_it_web',
    taxonomyId: 'tax_topic',
    parentId: 'node_topic_it',
    name: 'Phát triển Web',
    slug: 'phat-trien-web',
    description: 'HTML, CSS, JavaScript, TypeScript, React',
    sortOrder: 1,
    status: 'PUBLISHED',
  },
  {
    id: 'node_topic_it_db',
    taxonomyId: 'tax_topic',
    parentId: 'node_topic_it',
    name: 'Cơ sở dữ liệu',
    slug: 'co-so-du-lieu',
    description: 'SQL, PostgreSQL, Thiết kế chuẩn hóa quan hệ',
    sortOrder: 2,
    status: 'PUBLISHED',
  },

  // 3. Cây Chủ đề: Ngoại ngữ
  {
    id: 'node_topic_lang',
    taxonomyId: 'tax_topic',
    parentId: null,
    name: 'Ngoại ngữ',
    slug: 'ngoai-ngu',
    description: 'Ngôn ngữ quốc tế & chứng chỉ học thuật',
    sortOrder: 3,
    status: 'PUBLISHED',
  },
  {
    id: 'node_topic_lang_en',
    taxonomyId: 'tax_topic',
    parentId: 'node_topic_lang',
    name: 'Tiếng Anh',
    slug: 'tieng-anh',
    description: 'Ngữ pháp, từ vựng và chứng chỉ tiếng Anh (IELTS, TOEIC, B2)',
    sortOrder: 1,
    status: 'PUBLISHED',
  },

  // 4. Danh sách Độ khó (Flat)
  {
    id: 'node_diff_easy',
    taxonomyId: 'tax_difficulty',
    parentId: null,
    name: 'Nhận biết (Dễ)',
    slug: 'nhan-biet',
    description: 'Tái hiện lại định nghĩa, khái niệm cơ bản',
    sortOrder: 1,
    status: 'PUBLISHED',
  },
  {
    id: 'node_diff_medium',
    taxonomyId: 'tax_difficulty',
    parentId: null,
    name: 'Thông hiểu (Trung bình)',
    slug: 'thong-hieu',
    description: 'Hiểu bản chất và giải thích được vấn đề',
    sortOrder: 2,
    status: 'PUBLISHED',
  },
  {
    id: 'node_diff_hard',
    taxonomyId: 'tax_difficulty',
    parentId: null,
    name: 'Vận dụng (Khó)',
    slug: 'van-dung',
    description: 'Áp dụng kiến thức giải bài tập phức hợp',
    sortOrder: 3,
    status: 'PUBLISHED',
  },
  {
    id: 'node_diff_expert',
    taxonomyId: 'tax_difficulty',
    parentId: null,
    name: 'Vận dụng cao (Cực khó)',
    slug: 'van-dung-cao',
    description: 'Bài toán tư duy nâng cao, phân loại học sinh giỏi',
    sortOrder: 4,
    status: 'PUBLISHED',
  },

  // 4. Danh sách Thẻ phân loại (Flat)
  {
    id: 'node_tag_midterm',
    taxonomyId: 'tax_tag',
    parentId: null,
    name: 'Kiểm tra Giữa kỳ',
    slug: 'kiem-tra-giua-ky',
    description: 'Đề thi khảo sát chất lượng giữa học kỳ',
    sortOrder: 1,
    status: 'PUBLISHED',
  },
  {
    id: 'node_tag_final',
    taxonomyId: 'tax_tag',
    parentId: null,
    name: 'Thi Học kỳ',
    slug: 'thi-hoc-ky',
    description: 'Đề thi tổng hợp kết thúc học phần',
    sortOrder: 2,
    status: 'PUBLISHED',
  },
  {
    id: 'node_tag_olympiad',
    taxonomyId: 'tax_tag',
    parentId: null,
    name: 'Bồi dưỡng Học sinh giỏi',
    slug: 'boi-duong-hsg',
    description: 'Chuyên đề bồi dưỡng đội tuyển thi Olympic',
    sortOrder: 3,
    status: 'PUBLISHED',
  },

  // 5. Cây Khối lớp / Trình độ giáo dục (GRADE)
  // Cấp 1: Tiểu học (Lớp 1 - 5)
  {
    id: 'node_grade_primary',
    taxonomyId: 'tax_grade',
    parentId: null,
    name: 'Tiểu học',
    slug: 'tieu-hoc',
    description: 'Bậc giáo dục tiểu học (Lớp 1 đến Lớp 5)',
    sortOrder: 1,
    status: 'PUBLISHED',
    metadata: { stage: 'primary', totalYears: 5 },
  },
  {
    id: 'node_grade_1',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_primary',
    name: 'Lớp 1',
    slug: 'lop-1',
    description: 'Chương trình giáo dục Lớp 1 (6-7 tuổi)',
    sortOrder: 1,
    status: 'PUBLISHED',
    metadata: { gradeNum: 1, age: '6-7' },
  },
  {
    id: 'node_grade_2',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_primary',
    name: 'Lớp 2',
    slug: 'lop-2',
    description: 'Chương trình giáo dục Lớp 2 (7-8 tuổi)',
    sortOrder: 2,
    status: 'PUBLISHED',
    metadata: { gradeNum: 2, age: '7-8' },
  },
  {
    id: 'node_grade_3',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_primary',
    name: 'Lớp 3',
    slug: 'lop-3',
    description: 'Chương trình giáo dục Lớp 3 (8-9 tuổi)',
    sortOrder: 3,
    status: 'PUBLISHED',
    metadata: { gradeNum: 3, age: '8-9' },
  },
  {
    id: 'node_grade_4',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_primary',
    name: 'Lớp 4',
    slug: 'lop-4',
    description: 'Chương trình giáo dục Lớp 4 (9-10 tuổi)',
    sortOrder: 4,
    status: 'PUBLISHED',
    metadata: { gradeNum: 4, age: '9-10' },
  },
  {
    id: 'node_grade_5',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_primary',
    name: 'Lớp 5',
    slug: 'lop-5',
    description: 'Chương trình giáo dục Lớp 5 (10-11 tuổi)',
    sortOrder: 5,
    status: 'PUBLISHED',
    metadata: { gradeNum: 5, age: '10-11' },
  },

  // Cấp 2: Trung học cơ sở (Lớp 6 - 9)
  {
    id: 'node_grade_secondary',
    taxonomyId: 'tax_grade',
    parentId: null,
    name: 'Trung học cơ sở',
    slug: 'thcs',
    description: 'Bậc giáo dục trung học cơ sở (Lớp 6 đến Lớp 9)',
    sortOrder: 2,
    status: 'PUBLISHED',
    metadata: { stage: 'secondary', totalYears: 4 },
  },
  {
    id: 'node_grade_6',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_secondary',
    name: 'Lớp 6',
    slug: 'lop-6',
    description: 'Chương trình giáo dục Lớp 6 (11-12 tuổi)',
    sortOrder: 1,
    status: 'PUBLISHED',
    metadata: { gradeNum: 6, age: '11-12' },
  },
  {
    id: 'node_grade_7',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_secondary',
    name: 'Lớp 7',
    slug: 'lop-7',
    description: 'Chương trình giáo dục Lớp 7 (12-13 tuổi)',
    sortOrder: 2,
    status: 'PUBLISHED',
    metadata: { gradeNum: 7, age: '12-13' },
  },
  {
    id: 'node_grade_8',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_secondary',
    name: 'Lớp 8',
    slug: 'lop-8',
    description: 'Chương trình giáo dục Lớp 8 (13-14 tuổi)',
    sortOrder: 3,
    status: 'PUBLISHED',
    metadata: { gradeNum: 8, age: '13-14' },
  },
  {
    id: 'node_grade_9',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_secondary',
    name: 'Lớp 9',
    slug: 'lop-9',
    description: 'Chương trình giáo dục Lớp 9 (14-15 tuổi)',
    sortOrder: 4,
    status: 'PUBLISHED',
    metadata: { gradeNum: 9, age: '14-15' },
  },

  // Cấp 3: Trung học phổ thông (Lớp 10 - 12)
  {
    id: 'node_grade_high',
    taxonomyId: 'tax_grade',
    parentId: null,
    name: 'Trung học phổ thông',
    slug: 'thpt',
    description: 'Bậc giáo dục trung học phổ thông (Lớp 10 đến Lớp 12)',
    sortOrder: 3,
    status: 'PUBLISHED',
    metadata: { stage: 'high_school', totalYears: 3 },
  },
  {
    id: 'node_grade_10',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_high',
    name: 'Lớp 10',
    slug: 'lop-10',
    description: 'Chương trình giáo dục Lớp 10 (15-16 tuổi)',
    sortOrder: 1,
    status: 'PUBLISHED',
    metadata: { gradeNum: 10, age: '15-16' },
  },
  {
    id: 'node_grade_11',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_high',
    name: 'Lớp 11',
    slug: 'lop-11',
    description: 'Chương trình giáo dục Lớp 11 (16-17 tuổi)',
    sortOrder: 2,
    status: 'PUBLISHED',
    metadata: { gradeNum: 11, age: '16-17' },
  },
  {
    id: 'node_grade_12',
    taxonomyId: 'tax_grade',
    parentId: 'node_grade_high',
    name: 'Lớp 12',
    slug: 'lop-12',
    description: 'Chương trình giáo dục Lớp 12 và Ôn thi Tốt nghiệp THPT (17-18 tuổi)',
    sortOrder: 3,
    status: 'PUBLISHED',
    metadata: { gradeNum: 12, age: '17-18' },
  },
];

export async function seedTaxonomyDatabase(customDb?: any): Promise<void> {
  if (!customDb && isTaxonomyDbConfigured()) {
    await runTaxonomyMigrations();
  }

  const db = customDb || (isTaxonomyDbConfigured() ? getTaxonomyDb() : null);

  if (!db) {
    console.warn('⚠️ TAXONOMY_DATABASE_URL is not configured. Skipping Taxonomy Service seeding.');
    return;
  }

  console.log('🌱 [taxonomy_db] Seeding default taxonomies and nodes into PostgreSQL...');

  // 1. Seed Taxonomies
  for (const item of SEED_TAXONOMIES) {
    await db
      .insert(taxonomies)
      .values(item)
      .onConflictDoUpdate({
        target: taxonomies.id,
        set: {
          name: item.name,
          description: item.description,
          isHierarchical: item.isHierarchical,
          updatedAt: new Date(),
        },
      });
  }

  // 2. Seed Nodes
  for (const node of SEED_TAXONOMY_NODES) {
    await db
      .insert(taxonomyNodes)
      .values(node)
      .onConflictDoUpdate({
        target: taxonomyNodes.id,
        set: {
          name: node.name,
          slug: node.slug,
          description: node.description,
          parentId: node.parentId,
          sortOrder: node.sortOrder,
          status: node.status,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`✅ [taxonomy_db] Seed completed successfully: ${SEED_TAXONOMIES.length} Taxonomies and ${SEED_TAXONOMY_NODES.length} Nodes created/updated.`);
}

// Allow direct execution
const isDirectRun = Boolean(
  process.argv[1] &&
  (
    path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
      path.normalize(path.resolve(process.argv[1])).toLowerCase() ||
    process.argv[1].replace(/\\/g, '/').endsWith('seed.ts') ||
    process.argv[1].replace(/\\/g, '/').endsWith('seed.js')
  )
);

if (isDirectRun) {
  seedTaxonomyDatabase()
    .then(() => closeTaxonomyDb())
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
