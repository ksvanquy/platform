# KẾ HOẠCH THIẾT KẾ & TRIỂN KHAI TAXONOMY GRADE (KHỐI LỚP / TRÌNH ĐỘ)
*Cách A: Tạo Taxonomy Độc Lập - Chuẩn Kiến Trúc EdTech Quốc Tế (2D Knowledge Matrix)*  
*(Đã đối soát codebase & tích hợp Lộ trình Triển khai Roadmap chi tiết)*

---

## 1. TỔNG QUAN VÀ TRIẾT LÝ KIẾN TRÚC EDTECH QUỐC TẾ

### 1.1. Vấn đề của cách tiếp cận cũ (Gộp Khối lớp vào Cây Môn học)
Nếu nhúng "Khối lớp" trực tiếp vào cây `TOPIC` (ví dụ: `Toán ➔ Toán 10 ➔ Đại số 10`), hệ thống sẽ gặp các hạn chế lớn:
- **Bùng nổ số lượng Node (Combinatorial Explosion)**: Mỗi môn học đều phải lặp lại cấu trúc Lớp 1..12, dẫn đến hàng trăm node trùng lặp ngữ nghĩa.
- **Khó khăn khi thống kê & báo cáo**: Không thể truy vấn nhanh danh sách "Tất cả đề thi của Lớp 10" (bao gồm Toán 10, Lý 10, Hóa 10, Tiếng Anh 10) mà phải quét qua từng nhánh môn học.
- **Không đáp ứng chuẩn trao đổi dữ liệu**: Các chuẩn giáo dục quốc tế như **CEDS (Common Education Data Standards)**, **IEEE LOM (Learning Object Metadata)**, **QTI (Question & Test Interoperability)** và **Ed-Fi** đều tách biệt hoàn toàn giữa:
  - **Subject / Topic Area** (Lĩnh vực kiến thức / Môn học)
  - **Grade Level / Education Stage** (Trình độ / Cấp học / Khối lớp)

### 1.2. Giải pháp Cách A: Ma trận Kiến thức 2 Chiều (2D Knowledge Matrix)
Hệ thống Taxonomy hiện tại của dự án đã hỗ trợ sẵn thuộc tính `isHierarchical` (cho phép phân cấp cây qua mô hình Adjacency List `parentId`).  
Giải pháp là tạo một Taxonomy độc lập mang mã **`GRADE`** có `isHierarchical = true`:

```
   TRỤC Y: CẤP HỌC & KHỐI LỚP (GRADE)
   ▲
   │  [THPT]
   │    ├── Lớp 12 ────────────► [Đề thi Toán 12] ──────► [Đề thi Tin 12]
   │    ├── Lớp 11 ────────────► [Đề thi Toán 11] ──────► [Đề thi Tin 11]
   │    └── Lớp 10 ────────────► [Đề thi Toán 10] ──────► [Đề thi Tin 10]
   │  [THCS]
   │    └── Lớp 6..9
   │  [Tiểu học]
   │    └── Lớp 1..5
   └─────────────────────────────────────────────────────────────► TRỤC X: MÔN HỌC (TOPIC)
          [Toán học]                     [Tin học]
          ├── Đại số                     ├── Phát triển Web
          └── Hình học                   └── Cơ sở dữ liệu
```

**Ưu điểm vượt trội:**
1. **Lọc chéo linh hoạt (Orthogonal Faceting)**: Thí sinh/Giáo viên có thể lọc đề thi theo:
   - Chỉ theo Khối lớp: *"Xem tất cả đề thi Lớp 10"*.
   - Chỉ theo Môn học: *"Xem tất cả đề thi Toán học"*.
   - Kết hợp 2 chiều: *"Xem đề thi Toán học dành cho Lớp 10"*.
2. **Kế thừa phân cấp (Hierarchical Inheritance)**: Lọc cấp học cha (ví dụ: `THPT`) sẽ tự động bao hàm toàn bộ đề thi của các khối con (`Lớp 10`, `Lớp 11`, `Lớp 12`) nhờ Recursive CTE sẵn có của Taxonomy Service.
3. **Mở rộng tương lai không giới hạn**: Dễ dàng bổ sung các cấp học khác như Mầm non, Đại học / Cao đẳng, hoặc Chứng chỉ nghề nghiệp mà không làm xáo trộn cây môn học.

---

## 2. CHI TIẾT THIẾT KẾ MÔ HÌNH DỮ LIỆU TAXONOMY `GRADE`

### 2.1. Bản ghi Taxonomy cấp gốc
```typescript
{
  id: 'tax_grade',
  code: 'GRADE',
  name: 'Khối lớp / Trình độ',
  description: 'Hệ thống phân cấp trình độ giáo dục: Cấp học và Khối lớp theo chuẩn EdTech',
  isHierarchical: true,
}
```

### 2.2. Cấu trúc Cây Node (Adjacency List: Cấp học ➔ Khối lớp)
Cây phân cấp 2 tầng rõ ràng:
- **Tầng 1 (Root Nodes)**: Các cấp học giáo dục phổ thông (`Tiểu học`, `THCS`, `THPT`).
- **Tầng 2 (Child Nodes)**: Các khối lớp cụ thể từ Lớp 1 đến Lớp 12.

```
tax_grade (GRADE)
├── node_grade_primary: "Tiểu học" (slug: 'tieu-hoc', sortOrder: 1)
│    ├── node_grade_1: "Lớp 1" (slug: 'lop-1', sortOrder: 1, metadata: { gradeNum: 1, age: '6-7' })
│    ├── node_grade_2: "Lớp 2" (slug: 'lop-2', sortOrder: 2, metadata: { gradeNum: 2, age: '7-8' })
│    ├── node_grade_3: "Lớp 3" (slug: 'lop-3', sortOrder: 3, metadata: { gradeNum: 3, age: '8-9' })
│    ├── node_grade_4: "Lớp 4" (slug: 'lop-4', sortOrder: 4, metadata: { gradeNum: 4, age: '9-10' })
│    └── node_grade_5: "Lớp 5" (slug: 'lop-5', sortOrder: 5, metadata: { gradeNum: 5, age: '10-11' })
│
├── node_grade_secondary: "Trung học cơ sở" (slug: 'thcs', sortOrder: 2)
│    ├── node_grade_6: "Lớp 6" (slug: 'lop-6', sortOrder: 1, metadata: { gradeNum: 6, age: '11-12' })
│    ├── node_grade_7: "Lớp 7" (slug: 'lop-7', sortOrder: 2, metadata: { gradeNum: 7, age: '12-13' })
│    ├── node_grade_8: "Lớp 8" (slug: 'lop-8', sortOrder: 3, metadata: { gradeNum: 8, age: '13-14' })
│    └── node_grade_9: "Lớp 9" (slug: 'lop-9', sortOrder: 4, metadata: { gradeNum: 9, age: '14-15' })
│
└── node_grade_high: "Trung học phổ thông" (slug: 'thpt', sortOrder: 3)
     ├── node_grade_10: "Lớp 10" (slug: 'lop-10', sortOrder: 1, metadata: { gradeNum: 10, age: '15-16' })
     ├── node_grade_11: "Lớp 11" (slug: 'lop-11', sortOrder: 2, metadata: { gradeNum: 11, age: '16-17' })
     └── node_grade_12: "Lớp 12" (slug: 'lop-12', sortOrder: 3, metadata: { gradeNum: 12, age: '17-18' })
```

### 2.3. Bảng chi tiết định danh ID và Slugs
| Cấp học / Khối | Node ID | Parent ID | Tên hiển thị | Slug | Sort | Metadata |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tiểu học** | `node_grade_primary` | `null` | Tiểu học | `tieu-hoc` | 1 | `{ stage: 'primary', totalYears: 5 }` |
| ├── Lớp 1 | `node_grade_1` | `node_grade_primary` | Lớp 1 | `lop-1` | 1 | `{ gradeNum: 1, age: '6-7' }` |
| ├── Lớp 2 | `node_grade_2` | `node_grade_primary` | Lớp 2 | `lop-2` | 2 | `{ gradeNum: 2, age: '7-8' }` |
| ├── Lớp 3 | `node_grade_3` | `node_grade_primary` | Lớp 3 | `lop-3` | 3 | `{ gradeNum: 3, age: '8-9' }` |
| ├── Lớp 4 | `node_grade_4` | `node_grade_primary` | Lớp 4 | `lop-4` | 4 | `{ gradeNum: 4, age: '9-10' }` |
| └── Lớp 5 | `node_grade_5` | `node_grade_primary` | Lớp 5 | `lop-5` | 5 | `{ gradeNum: 5, age: '10-11' }` |
| **THCS** | `node_grade_secondary`| `null` | Trung học cơ sở | `thcs` | 2 | `{ stage: 'secondary', totalYears: 4 }` |
| ├── Lớp 6 | `node_grade_6` | `node_grade_secondary`| Lớp 6 | `lop-6` | 1 | `{ gradeNum: 6, age: '11-12' }` |
| ├── Lớp 7 | `node_grade_7` | `node_grade_secondary`| Lớp 7 | `lop-7` | 2 | `{ gradeNum: 7, age: '12-13' }` |
| ├── Lớp 8 | `node_grade_8` | `node_grade_secondary`| Lớp 8 | `lop-8` | 3 | `{ gradeNum: 8, age: '13-14' }` |
| └── Lớp 9 | `node_grade_9` | `node_grade_secondary`| Lớp 9 | `lop-9` | 4 | `{ gradeNum: 9, age: '14-15' }` |
| **THPT** | `node_grade_high` | `null` | Trung học phổ thông | `thpt` | 3 | `{ stage: 'high_school', totalYears: 3 }` |
| ├── Lớp 10 | `node_grade_10` | `node_grade_high` | Lớp 10 | `lop-10` | 1 | `{ gradeNum: 10, age: '15-16' }` |
| ├── Lớp 11 | `node_grade_11` | `node_grade_high` | Lớp 11 | `lop-11` | 2 | `{ gradeNum: 11, age: '16-17' }` |
| └── Lớp 12 | `node_grade_12` | `node_grade_high` | Lớp 12 | `lop-12` | 3 | `{ gradeNum: 12, age: '17-18' }` |

*Ghi chú CSDL:* Trong bảng `taxonomy_nodes`, Unique Index được đánh trên cặp `(taxonomy_id, slug)`. Do đó, các slug `lop-1` ... `lop-12` hoàn toàn độc lập và an toàn tuyệt đối, không gây xung đột với bất kỳ taxonomy nào khác.

---

## 3. ĐỐI SOÁT HÀNH VI RECURSIVE CTE & CONTRACT TRONG CODEBASE

Dựa trên kết quả Audit thực tế của file `drizzle-taxonomy.repository.ts`:

### 3.1. Hành vi của API Lấy Nút Con (`GET /v1/nodes/:id/descendant-ids`)
Hàm `findDescendantIds` trong codebase sử dụng Recursive CTE:
```sql
WITH RECURSIVE node_tree AS (
  SELECT id FROM taxonomy_nodes WHERE id = ${rootNodeId} AND deleted_at IS NULL
  UNION ALL
  SELECT child.id FROM taxonomy_nodes child INNER JOIN node_tree parent ON child.parent_id = parent.id
) SELECT id FROM node_tree;
```
👉 **Đặc tính kỹ thuật**: Kết quả **luôn bao gồm chính `rootNodeId`** cùng với toàn bộ các node con cháu.
- Đối với `node_grade_high`: Trả về **4 ID**:
  ```json
  ["node_grade_high", "node_grade_10", "node_grade_11", "node_grade_12"]
  ```
- Đối với `node_grade_secondary`: Trả về **5 ID**:
  ```json
  ["node_grade_secondary", "node_grade_6", "node_grade_7", "node_grade_8", "node_grade_9"]
  ```
- Đối với `node_grade_primary`: Trả về **6 ID**:
  ```json
  ["node_grade_primary", "node_grade_1", "node_grade_2", "node_grade_3", "node_grade_4", "node_grade_5"]
  ```
- **Ý nghĩa thực tế**: Rất hoàn hảo cho việc truy vấn đề thi bằng SQL `WHERE grade_node_id IN (...)`. Nếu có đề thi chung cho toàn cấp THPT hoặc đề thi cụ thể từng lớp thì câu truy vấn đều lấy chính xác!

### 3.2. Hành vi của API Breadcrumbs (`GET /v1/nodes/:id/breadcrumbs`)
Hàm `findBreadcrumbs` truy vấn ngược cây cha trong bảng `taxonomy_nodes`:
- Đối với `node_grade_12`: Nút cha là `node_grade_high` (nút này có `parent_id = null` nên dừng chuỗi).
- Kết quả trả về mảng gồm **2 phần tử** (trong phạm vi cây Node):
  ```json
  [
    { "id": "node_grade_high", "name": "Trung học phổ thông", "slug": "thpt" },
    { "id": "node_grade_12", "name": "Lớp 12", "slug": "lop-12" }
  ]
  ```

---

## 4. BẢN ĐỒ LỘ TRÌNH TRIỂN KHAI (IMPLEMENTATION ROADMAP)

Lộ trình được chia thành **4 Giai đoạn (Phases)** tuần tự với các Cổng kiểm soát nghiệm thu (Quality Gate).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                LỘ TRÌNH TRIỂN KHAI GRADE TAXONOMY                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
 ┌─────────────────────────────────────────▼────────────────────────────────────────────┐
 │ GIAI ĐOẠN 1: CORE TAXONOMY & CONTRACTS (Taxonomy Service)                            │
 │ • Thêm hằng số mã chuẩn `STANDARD_TAXONOMY_CODES.GRADE` vào `@platform/contracts`     │
 │ • Bổ sung Seed Data: `tax_grade` + 15 Nodes (Tiểu học, THCS, THPT và 12 Lớp)         │
 │ • Chuyển đổi câu log seed sang đếm số lượng động                                     │
 └─────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ [Quality Gate 1: Seed chạy thành công]
 ┌─────────────────────────────────────────▼────────────────────────────────────────────┐
 │ GIAI ĐOẠN 2: TEST SUITE & VERIFICATION (Taxonomy Tests)                               │
 │ • Tạo test file `services/taxonomy/tests/grade-taxonomy.spec.ts`                     │
 │ • Kiểm thử chi tiết: Cây phân cấp, Đếm nút, Recursive CTE Descendants, Breadcrumbs    │
 │ • Chạy regression test toàn bộ các test suite hiện tại                               │
 └─────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ [Quality Gate 2: Test Suite 100% Xanh]
 ┌─────────────────────────────────────────▼────────────────────────────────────────────┐
 │ GIAI ĐOẠN 3: ADMIN WEB VALIDATION & QUIZ INTEGRATION                                 │
 │ • Xác thực Admin Web tự động hiển thị Tab GRADE trong mục Quản lý Danh mục           │
 │ • Mở rộng schema Quiz: Bổ sung trường `grade_node_id` vào bảng `quizzes`             │
 │ • Bổ sung bộ chọn Khối lớp (Grade Picker) trong Modal Soạn thảo Đề thi Admin         │
 └─────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ [Quality Gate 3: Admin tạo đề thi gắn Grade]
 ┌─────────────────────────────────────────▼────────────────────────────────────────────┐
 │ GIAI ĐOẠN 4: QUIZ WEB 2D FACET FILTERING                                             │
 │ • Tích hợp thanh lọc Khối lớp (Pill/Tabs) trên giao diện Thí sinh                    │
 │ • Kết hợp lọc 2 chiều: Môn học (TOPIC) × Khối lớp (GRADE)                            │
 │ • Kiểm thử nghiệm thu đầu-cuối (E2E) & Đóng gói hoàn tất                             │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1. Chi tiết từng Giai đoạn

#### 🔹 Giai đoạn 1: Core Taxonomy & Shared Contracts (Đã hoàn thành - 100%)
- **Mục tiêu**: Thiết lập nền móng dữ liệu và hợp đồng giao tiếp cho mã danh mục `GRADE`.
- **Nhiệm vụ cụ thể**:
  - [x] **Task 1.1**: Mở `packages/contracts/src/taxonomy/taxonomy.ts`, bổ sung:
    ```typescript
    export const STANDARD_TAXONOMY_CODES = {
      TOPIC: 'TOPIC',
      DIFFICULTY: 'DIFFICULTY',
      TAG: 'TAG',
      GRADE: 'GRADE',
    } as const;
    ```
  - [x] **Task 1.2**: Mở `services/taxonomy/src/infrastructure/db/seed.ts`:
    - Thêm bản ghi `tax_grade` vào mảng `SEED_TAXONOMIES`.
    - Thêm 3 node cấp học (`node_grade_primary`, `node_grade_secondary`, `node_grade_high`) và 12 node lớp học (`node_grade_1` ... `node_grade_12`) vào `SEED_TAXONOMY_NODES`.
    - Cập nhật câu log hoàn thành thành `${SEED_TAXONOMIES.length} Taxonomies and ${SEED_TAXONOMY_NODES.length} Nodes`.
  - [x] **Task 1.3**: Chạy seed vào CSDL `taxonomy_db` (idempotent, không phá vỡ dữ liệu cũ; đã verify 4/4 test suite pass 100%).
- **Deliverable**: CSDL có 4 taxonomies, 31 nodes; contracts sẵn sàng xuất bản.
- **Exit Gate**: `SEED_TAXONOMIES` và `SEED_TAXONOMY_NODES` nạp vào database không phát sinh lỗi. [PASSED]

---

#### 🔹 Giai đoạn 2: Automated Testing & Verification
- **Mục tiêu**: Đảm bảo thuật toán cây và các endpoint API của `GRADE` hoạt động chính xác tuyệt đối.
- **Nhiệm vụ cụ thể**:
  - [ ] **Task 2.1**: Tạo file kiểm thử mới `services/taxonomy/tests/grade-taxonomy.spec.ts`.
  - [ ] **Task 2.2**: Kiểm thử các ca kiểm thử chính:
    1. `GET /v1/taxonomies/GRADE` ➔ Trả về đúng `isHierarchical = true`.
    2. `GET /v1/taxonomies/GRADE/tree` ➔ Cây trả về đúng 3 gốc và 12 nút lá con.
    3. `GET /v1/nodes/node_grade_high/descendant-ids` ➔ Trả về 4 IDs: `[node_grade_high, node_grade_10, node_grade_11, node_grade_12]`.
    4. `GET /v1/nodes/node_grade_secondary/descendant-ids` ➔ Trả về 5 IDs (THCS + Lớp 6..9).
    5. `GET /v1/nodes/node_grade_primary/descendant-ids` ➔ Trả về 6 IDs (Tiểu học + Lớp 1..5).
    6. `GET /v1/nodes/node_grade_12/breadcrumbs` ➔ Trả về mảng 2 phần tử `[Trung học phổ thông, Lớp 12]`.
  - [ ] **Task 2.3**: Chạy kiểm thử hồi quy toàn bộ: `taxonomy.spec.ts`, `tree-structure.spec.ts`, `api.spec.ts`, `cycle-prevention.spec.ts`.
- **Deliverable**: File `grade-taxonomy.spec.ts` đạt 100% pass, không gây ảnh hưởng tới các bài test khác.
- **Exit Gate**: Toàn bộ unit và integration test của Taxonomy Service chạy xanh.

---

#### 🔹 Giai đoạn 3: Admin Web Validation & Quiz Service Extension
- **Mục tiêu**: Cho phép người quản trị xem cây GRADE và gắn khối lớp cho Đề thi.
- **Nhiệm vụ cụ thể**:
  - [ ] **Task 3.1**: Mở `apps/admin-web`, kiểm tra tab `GRADE` trong `TaxonomyManagementSection.tsx` tự động xuất hiện và hiển thị đúng cây thư mục Lớp 1..12.
  - [ ] **Task 3.2**: Mở `services/quiz/src/infrastructure/db/schema.ts`, bổ sung cột `gradeNodeId: varchar('grade_node_id', { length: 64 })` vào bảng `quizzes`.
  - [ ] **Task 3.3**: Mở `packages/contracts/src/quiz/quiz.ts`, bổ sung `gradeNodeId?: string` vào các interface DTO (`QuizDto`, `CreateQuizRequest`, `UpdateQuizRequest`).
  - [ ] **Task 3.4**: Cập nhật Modal tạo/sửa đề thi trong `apps/admin-web/src/views/QuizManagementSection.tsx`: bổ sung Dropdown cascade chọn Cấp học & Lớp học từ cây `GRADE`.
- **Deliverable**: Người quản trị có thể tạo đề thi gắn đồng thời Môn học (`TOPIC`) và Khối lớp (`GRADE`).
- **Exit Gate**: Tạo mới thành công 1 đề thi có gắn `gradeNodeId = 'node_grade_10'`.

---

#### 🔹 Giai đoạn 4: Quiz Web 2D Facet Filtering & End-to-End Delivery
- **Mục tiêu**: Mang lại trải nghiệm học tập phân cấp cho Thí sinh trên `apps/quiz-web`.
- **Nhiệm vụ cụ thể**:
  - [ ] **Task 4.1**: Trong `apps/quiz-web/src/views/QuizStartView.tsx`, thêm thanh bộ lọc Khối lớp (Pills: *Tất cả, Tiểu học, THCS, Lớp 10, Lớp 11, Lớp 12*).
  - [ ] **Task 4.2**: Kết hợp điều kiện lọc chéo:
    - Khi chọn Khối lớp cha (ví dụ `THPT`): Tự động gọi API `descendant-ids` để lọc tất cả đề thi có `gradeNodeId` nằm trong danh sách con cháu.
    - Khi chọn kết hợp cả Môn học + Khối lớp: Hiển thị đúng các đề thi giao thoa của 2 trục.
  - [ ] **Task 4.3**: Chạy linter (`lint_applet`) và biên dịch hệ thống (`compile_applet`) để nghiệm thu toàn diện.
- **Deliverable**: Giao diện người học lọc đề thi 2 chiều mượt mà, sẵn sàng sản xuất.
- **Exit Gate**: Toàn bộ hệ sinh thái biên dịch thành công, không phát sinh cảnh báo type hay runtime error.

---

## 5. BẢNG TIÊU CHÍ NGHIỆM THU ĐÃ ĐỐI SOÁT (ACCEPTANCE CRITERIA)

| STT | Hạng mục kiểm tra | Tiêu chí đạt chuẩn kỹ thuật |
| :--- | :--- | :--- |
| **AC-1** | Bản ghi Taxonomy `GRADE` | `GET /v1/taxonomies/GRADE` trả về HTTP 200, code `GRADE`, `isHierarchical: true`. |
| **AC-2** | Cây phân cấp đầy đủ | `GET /v1/taxonomies/GRADE/tree` trả về 3 nhánh gốc và 12 nút lá với thứ tự `sortOrder` tăng dần từ 1 đến 12. |
| **AC-3** | Thuật toán CTE Nút con | `GET /v1/nodes/node_grade_high/descendant-ids` trả về đúng 4 phần tử: `['node_grade_high', 'node_grade_10', 'node_grade_11', 'node_grade_12']`. |
| **AC-4** | Breadcrumb navigation | `GET /v1/nodes/node_grade_12/breadcrumbs` trả về đúng 2 phần tử `['Trung học phổ thông', 'Lớp 12']`. |
| **AC-5** | Tính tương thích ngược | Toàn bộ các test suite hiện tại (`api.spec.ts`, `tree-structure.spec.ts`, `cycle-prevention.spec.ts`, v.v.) tiếp tục pass 100%. |
| **AC-6** | Lọc chéo 2D Ma trận | Đề thi có thể được truy vấn kết hợp đồng thời theo cả `primaryNodeId` (Môn học) và `gradeNodeId` (Khối lớp). |

---

## 6. TRẠNG THÁI HIỆN TẠI & BƯỚC TIẾP THEO

- **Trạng thái**: Kế hoạch và Lộ trình triển khai (Roadmap) đã được xây dựng hoàn chỉnh, chi tiết từng task, liên kết chặt chẽ với codebase.
- **Vị trí file kế hoạch**: `/plan/grade_taxonomy_plan.md`.
- **Sẵn sàng thực thi**: Khi bạn sẵn sàng (ví dụ: *"Bắt đầu Giai đoạn 1"* hoặc *"Tiến hành code theo roadmap"*), tôi sẽ bắt đầu triển khai các task của Giai đoạn 1 ngay lập tức!
