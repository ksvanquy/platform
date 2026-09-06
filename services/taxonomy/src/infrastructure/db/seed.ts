import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTaxonomyDb, closeTaxonomyDb, isTaxonomyDbConfigured } from './connection.js';
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

  // 3. Danh sách Độ khó (Flat)
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
];

export async function seedTaxonomyDatabase(customDb?: any): Promise<void> {
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

  console.log('✅ [taxonomy_db] Seed completed successfully: 3 Taxonomies and 11 Nodes created/updated.');
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
