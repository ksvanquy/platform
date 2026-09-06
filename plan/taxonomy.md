Single-Tenant DDL Schema (PostgreSQL)

-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS ltree;

-- =============================================================================
-- 2. TAXONOMIES TABLE
-- Định nghĩa các loại phân loại (Category, Tag, Brand, Attribute...)
-- =============================================================================
CREATE TABLE taxonomies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE, -- Code duy nhất trên toàn hệ thống
    is_hierarchical BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Identity Key đơn giản hóa cho FK từ taxonomy_nodes
    CONSTRAINT uq_taxonomies_identity UNIQUE (id, is_hierarchical)
);

-- =============================================================================
-- 3. TAXONOMY NODES TABLE
-- Lưu trữ các nút/giá trị phân loại
-- =============================================================================
CREATE TABLE taxonomy_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    taxonomy_id UUID NOT NULL,
    is_hierarchical BOOLEAN NOT NULL,
    parent_id UUID NULL,
    
    node_path LTREE NOT NULL, 
    depth INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    
    -- Optimistic Locking & Soft Delete
    version INT NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ NULL,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite Identity Key gọn nhẹ cho translations & relations FK
    CONSTRAINT uq_nodes_identity UNIQUE (id, taxonomy_id),

    -- FK 1: Bắt buộc kế thừa đúng đặc tính is_hierarchical từ taxonomy
    CONSTRAINT fk_nodes_taxonomy FOREIGN KEY (taxonomy_id, is_hierarchical) 
        REFERENCES taxonomies(id, is_hierarchical) ON DELETE CASCADE,

    -- FK 2: Parent phải thuộc CÙNG taxonomy
    CONSTRAINT fk_nodes_parent FOREIGN KEY (parent_id, taxonomy_id) 
        REFERENCES taxonomy_nodes(id, taxonomy_id) ON DELETE RESTRICT,

    CONSTRAINT chk_nodes_depth CHECK (depth >= 0),
    CONSTRAINT chk_nodes_non_hierarchical CHECK (
        is_hierarchical = true OR (parent_id IS NULL AND depth = 0)
    )
);

-- Indexes tối ưu cho Soft Delete & LTREE
CREATE INDEX idx_nodes_ltree_gist ON taxonomy_nodes USING GIST (node_path) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_parent ON taxonomy_nodes(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_taxonomy ON taxonomy_nodes(taxonomy_id) WHERE deleted_at IS NULL;

-- =============================================================================
-- 4. TRANSLATIONS TABLE
-- Lưu trữ Đa ngôn ngữ & SEO Slug
-- =============================================================================
CREATE TABLE taxonomy_node_translations (
    node_id UUID NOT NULL,
    taxonomy_id UUID NOT NULL,
    locale VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    
    PRIMARY KEY (node_id, locale),

    CONSTRAINT fk_translations_node FOREIGN KEY (node_id, taxonomy_id) 
        REFERENCES taxonomy_nodes(id, taxonomy_id) ON DELETE CASCADE,

    -- Constraint: SLUG DUY NHẤT trong cùng 1 Loại Taxonomy và Ngôn ngữ
    CONSTRAINT uq_translations_taxonomy_locale_slug UNIQUE (taxonomy_id, locale, slug)
);

CREATE INDEX idx_translations_slug_search ON taxonomy_node_translations(locale, slug);

-- =============================================================================
-- 5. RELATIONS TABLE (PIVOT)
-- Gắn kết các Node phân loại vào Entity (Product, Article, Media...)
-- =============================================================================
CREATE TABLE taxonomy_node_relations (
    node_id UUID NOT NULL,
    taxonomy_id UUID NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (taxonomy_id, node_id, entity_type, entity_id),

    CONSTRAINT fk_relations_node_identity FOREIGN KEY (node_id, taxonomy_id) 
        REFERENCES taxonomy_nodes(id, taxonomy_id) ON DELETE CASCADE
);

-- Unique 1 Primary Node cho MỖI TAXONOMY của 1 Entity
CREATE UNIQUE INDEX uq_relations_single_primary_per_taxonomy 
ON taxonomy_node_relations(taxonomy_id, entity_type, entity_id) 
WHERE (is_primary = true);

CREATE INDEX idx_relations_entity_lookup 
ON taxonomy_node_relations(entity_type, entity_id);

Triggers & Stored Procedures (Single-Tenant Refactored)
1. Trigger Đồng Bộ updated_at

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_taxonomies_updated_at 
    BEFORE UPDATE ON taxonomies FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_nodes_updated_at 
    BEFORE UPDATE ON taxonomy_nodes FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

    2. Helper Format UUID cho ltree Label

    CREATE OR REPLACE FUNCTION fn_format_ltree_label(p_id UUID) 
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'n_' || REPLACE(p_id::text, '-', '_');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

3. Safe Move Subtree Procedure (Optimistic Lock + Atomic Update)

CREATE OR REPLACE FUNCTION fn_move_taxonomy_subtree(
    p_node_id UUID,
    p_new_parent_id UUID,
    p_expected_version INT
) RETURNS VOID AS $$
DECLARE
    v_node_label VARCHAR;
    v_old_path LTREE;
    v_old_depth INT;
    v_current_version INT;
    v_new_parent_path LTREE;
    v_new_parent_depth INT;
    v_new_path LTREE;
    v_depth_delta INT;
BEGIN
    -- 1. Lock Row & Check Version
    SELECT node_path, depth, version 
    INTO v_old_path, v_old_depth, v_current_version
    FROM taxonomy_nodes
    WHERE id = p_node_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Node not found or already deleted';
    END IF;

    IF v_current_version != p_expected_version THEN
        RAISE EXCEPTION 'Concurrency Conflict: Expected version %, got %', 
            p_expected_version, v_current_version;
    END IF;

    v_node_label := fn_format_ltree_label(p_node_id);

    -- 2. Tính toán New Path
    IF p_new_parent_id IS NOT NULL THEN
        SELECT node_path, depth INTO v_new_parent_path, v_new_parent_depth
        FROM taxonomy_nodes
        WHERE id = p_new_parent_id AND deleted_at IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target parent node not found';
        END IF;

        IF v_new_parent_path <@ v_old_path THEN
            RAISE EXCEPTION 'Cannot move a node into one of its own descendants';
        END IF;

        v_new_path := v_new_parent_path || v_node_label::ltree;
        v_depth_delta := (v_new_parent_depth + 1) - v_old_depth;
    ELSE
        v_new_path := v_node_label::ltree;
        v_depth_delta := 0 - v_old_depth;
    END IF;

    -- 3. Atomic Batch Update
    UPDATE taxonomy_nodes
    SET 
        node_path = v_new_path || subpath(node_path, nlevel(v_old_path)),
        depth = depth + v_depth_delta,
        parent_id = CASE WHEN id = p_node_id THEN p_new_parent_id ELSE parent_id END,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE node_path <@ v_old_path
      AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

4. Soft Delete Subtree Procedure

CREATE OR REPLACE FUNCTION fn_soft_delete_taxonomy_subtree(
    p_node_id UUID
) RETURNS VOID AS $$
DECLARE
    v_target_path LTREE;
BEGIN
    SELECT node_path INTO v_target_path
    FROM taxonomy_nodes
    WHERE id = p_node_id AND deleted_at IS NULL;

    IF FOUND THEN
        UPDATE taxonomy_nodes
        SET deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE node_path <@ v_target_path
          AND deleted_at IS NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;