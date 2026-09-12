import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/index.js';
import type { TaxonomyDTO, TaxonomyTreeNodeDTO } from '@platform/contracts';

export const TaxonomyManagementSection: React.FC = () => {
  const [taxonomies, setTaxonomies] = useState<TaxonomyDTO[]>([]);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<string>('TOPIC');
  const [treeNodes, setTreeNodes] = useState<TaxonomyTreeNodeDTO[]>([]);
  const [flatNodes, setFlatNodes] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Modal / Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createSortOrder, setCreateSortOrder] = useState<number>(0);

  const [moveNode, setMoveNode] = useState<TaxonomyTreeNodeDTO | null>(null);
  const [targetParentId, setTargetParentId] = useState<string>('');

  const flattenTree = (nodes: TaxonomyTreeNodeDTO[]): { id: string; name: string; parentId: string | null }[] => {
    const res: { id: string; name: string; parentId: string | null }[] = [];
    const traverse = (items: TaxonomyTreeNodeDTO[]) => {
      for (const item of items) {
        res.push({ id: item.id, name: item.name, parentId: item.parentId ?? null });
        if (item.children && item.children.length > 0) {
          traverse(item.children);
        }
      }
    };
    traverse(nodes);
    return res;
  };

  const fetchTaxonomies = async () => {
    try {
      const res = await apiClient.taxonomies.list();
      if (res.success && res.data) {
        setTaxonomies(res.data);
        if (res.data.length > 0 && !res.data.some((t) => t.code === selectedTaxonomy)) {
          setSelectedTaxonomy(res.data[0].code);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchTree = useCallback(async (taxCode: string) => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.taxonomies.getTree(taxCode);
      if (res.success && res.data) {
        setTreeNodes(res.data.tree || []);
        setFlatNodes(flattenTree(res.data.tree || []));
      } else {
        setTreeNodes([]);
        setFlatNodes([]);
      }
    } catch (err: any) {
      setStatusMessage(`⚠️ Không thể tải cây tri thức: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTaxonomies();
  }, []);

  useEffect(() => {
    if (selectedTaxonomy) {
      fetchTree(selectedTaxonomy);
    }
  }, [selectedTaxonomy, fetchTree]);

  const handleOpenCreate = (parentId: string | null = null) => {
    setCreateParentId(parentId);
    setCreateName('');
    setCreateSlug('');
    setCreateSortOrder(0);
    setShowCreateModal(true);
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createSlug.trim()) return;

    setStatusMessage(null);
    try {
      const res = await apiClient.taxonomies.createNode(selectedTaxonomy, {
        name: createName.trim(),
        slug: createSlug.trim(),
        parentId: createParentId,
        sortOrder: createSortOrder,
      });

      if (res.success) {
        setStatusMessage(`✅ Đã tạo node "${createName}" thành công!`);
        setShowCreateModal(false);
        await fetchTree(selectedTaxonomy);
      } else {
        setStatusMessage(`❌ Lỗi: ${res.message}`);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi: ${err.message}`);
    }
  };

  const handleMoveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveNode) return;

    setStatusMessage(null);
    try {
      const res = await apiClient.taxonomies.moveNode(moveNode.id, {
        newParentId: targetParentId ? targetParentId : null,
      });

      if (res.success) {
        setStatusMessage(`✅ Đã di chuyển node "${moveNode.name}" thành công!`);
        setMoveNode(null);
        await fetchTree(selectedTaxonomy);
      } else {
        setStatusMessage(`❌ Lỗi: ${res.message}`);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi: ${err.message}`);
    }
  };

  const handleDeleteNode = async (node: TaxonomyTreeNodeDTO) => {
    if (!window.confirm(`Bạn có chắc muốn xóa node "${node.name}" và toàn bộ nhánh con?`)) {
      return;
    }

    setStatusMessage(null);
    try {
      const res = await apiClient.taxonomies.deleteNode(node.id);
      if (res.success) {
        setStatusMessage(`✅ Đã xóa node "${node.name}" thành công!`);
        await fetchTree(selectedTaxonomy);
      } else {
        setStatusMessage(`❌ Lỗi: ${res.message}`);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi: ${err.message}`);
    }
  };

  const renderTreeNode = (node: TaxonomyTreeNodeDTO, depth = 0) => {
    return (
      <div key={node.id} className="space-y-1">
        <div
          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 transition-colors"
          style={{ marginLeft: `${depth * 20}px` }}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <span className="text-slate-500 font-mono text-xs">
              {depth > 0 ? '↳ ' : '• '}
            </span>
            <div className="truncate">
              <span className="text-sm font-bold text-slate-100">{node.name}</span>
              <span className="ml-2 text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50">
                slug: {node.slug}
              </span>
              <span className="ml-2 text-[10px] text-slate-500">
                Thứ tự: {node.sortOrder}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenCreate(node.id)}
              className="px-2 py-1 text-[11px] font-medium rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition-colors"
              title="Thêm node con"
            >
              + Node con
            </button>
            <button
              type="button"
              onClick={() => {
                setMoveNode(node);
                setTargetParentId(node.parentId || '');
              }}
              className="px-2 py-1 text-[11px] font-medium rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
              title="Di chuyển sang vị trí khác"
            >
              ↔ Chuyển
            </button>
            <button
              type="button"
              onClick={() => handleDeleteNode(node)}
              className="px-2 py-1 text-[11px] font-medium rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
              title="Xóa node"
            >
              🗑️
            </button>
          </div>
        </div>

        {node.children && node.children.length > 0 && (
          <div className="space-y-1">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🌳</span>
            <h3 className="text-lg font-bold text-slate-100">
              Quản Lý Cây Phân Loại Tri Thức (Taxonomies & Knowledge Tree)
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Tổ chức phân cấp tri thức theo dạng cây không chu trình (Acyclic Tree), gán danh mục cho đề thi.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => handleOpenCreate(null)}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
          >
            + Thêm Node Gốc
          </button>
          <button
            type="button"
            onClick={() => fetchTree(selectedTaxonomy)}
            disabled={loading}
            className="px-3 py-2 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>
      </div>

      {/* Taxonomy Code Selector Pills */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
        {taxonomies.map((tax) => {
          const isSelected = selectedTaxonomy === tax.code;
          return (
            <button
              key={tax.id}
              type="button"
              onClick={() => setSelectedTaxonomy(tax.code)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/50'
              }`}
            >
              {tax.name} ({tax.code})
            </button>
          );
        })}
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
            statusMessage.startsWith('✅')
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* Tree Content */}
      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
            Đang tải dữ liệu cây tri thức...
          </div>
        ) : treeNodes.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-800/20 border border-dashed border-slate-800 text-xs text-slate-500">
            Chưa có node nào trong cây phân cấp này. Nhấn &quot;+ Thêm Node Gốc&quot; để bắt đầu.
          </div>
        ) : (
          <div className="space-y-2">
            {treeNodes.map((node) => renderTreeNode(node, 0))}
          </div>
        )}
      </div>

      {/* Modal Tạo Node */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <h4 className="text-base font-bold text-slate-100">
              {createParentId ? 'Thêm Node Con' : 'Thêm Node Gốc (Root)'}
            </h4>

            <form onSubmit={handleCreateNode} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tên Node</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="ví dụ: Lập trình Python"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Slug (URL friendly)</label>
                <input
                  type="text"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  placeholder="ví dụ: lap-trinh-python"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Thứ tự hiển thị (Sort Order)</label>
                <input
                  type="number"
                  value={createSortOrder}
                  onChange={(e) => setCreateSortOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
                >
                  Tạo Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Di Chuyển Node (Move / Reparent) */}
      {moveNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <h4 className="text-base font-bold text-slate-100">
              Di Chuyển Vị Trí: &quot;{moveNode.name}&quot;
            </h4>
            <p className="text-xs text-slate-400">
              Chọn cha mới cho node này. Hệ thống tự động kiểm tra chống tạo chu trình (Cycle Prevention).
            </p>

            <form onSubmit={handleMoveNode} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Node Cha Mới</label>
                <select
                  value={targetParentId}
                  onChange={(e) => setTargetParentId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">[Gốc - Root Level (Không có cha)]</option>
                  {flatNodes
                    .filter((n) => n.id !== moveNode.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} (ID: {n.id})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setMoveNode(null)}
                  className="px-3.5 py-2 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 transition-all"
                >
                  Xác Nhận Di Chuyển
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
