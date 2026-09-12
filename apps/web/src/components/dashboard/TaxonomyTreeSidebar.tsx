import React, { useState, useMemo } from 'react';
import type { TaxonomyTreeNodeDTO } from '@platform/contracts';
import {
  FolderIcon,
  FolderOpenIcon,
  TagIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
  LayersIcon,
  BookOpenIcon,
} from '../common/Icons.js';

interface TaxonomyTreeSidebarProps {
  tree: TaxonomyTreeNodeDTO[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  quizCountsByNode: Record<string, number>;
  totalQuizzesCount: number;
  isLoading?: boolean;
  onCollapse?: () => void;
}

interface TreeNodeItemProps {
  node: TaxonomyTreeNodeDTO;
  level: number;
  selectedNodeId: string;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  quizCountsByNode: Record<string, number>;
  searchQuery: string;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  level,
  selectedNodeId,
  expandedNodes,
  onToggleExpand,
  onSelectNode,
  quizCountsByNode,
  searchQuery,
}) => {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded = expandedNodes.has(node.id) || searchQuery.trim().length > 0;
  const isSelected = selectedNodeId === node.id;
  const count = quizCountsByNode[node.id] || 0;

  // Filter check
  const matchesSearch =
    !searchQuery ||
    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (node.description && node.description.toLowerCase().includes(searchQuery.toLowerCase()));

  const hasMatchingDescendants = useMemo(() => {
    if (!searchQuery) return true;
    const checkDescendants = (n: TaxonomyTreeNodeDTO): boolean => {
      if (n.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
      if (n.children) {
        return n.children.some(checkDescendants);
      }
      return false;
    };
    return checkDescendants(node);
  }, [node, searchQuery]);

  if (searchQuery && !matchesSearch && !hasMatchingDescendants) {
    return null;
  }

  return (
    <div className="select-none text-xs">
      <div
        id={`tree-node-${node.id}`}
        onClick={() => onSelectNode(node.id)}
        className={`group flex items-center justify-between py-2 px-2.5 my-0.5 rounded-xl cursor-pointer transition-all ${
          isSelected
            ? 'bg-sky-500/15 border border-sky-500/40 text-sky-200 font-semibold shadow-sm shadow-sky-500/5'
            : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 border border-transparent'
        }`}
        style={{ paddingLeft: `${Math.max(10, level * 16 + 10)}px` }}
      >
        <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
          {/* Chevron expand/collapse toggle */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="p-1 -ml-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
              title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
            >
              {isExpanded ? (
                <ChevronDownIcon size={14} className="text-slate-400 group-hover:text-sky-400" />
              ) : (
                <ChevronRightIcon size={14} className="text-slate-400 group-hover:text-sky-400" />
              )}
            </button>
          ) : (
            <span className="w-4 inline-block shrink-0" />
          )}

          {/* Folder or Tag Icon */}
          <div className="shrink-0 text-slate-400 group-hover:text-sky-400 transition-colors">
            {hasChildren ? (
              isExpanded ? (
                <FolderOpenIcon size={16} className={isSelected ? 'text-sky-400' : 'text-amber-400/90'} />
              ) : (
                <FolderIcon size={16} className={isSelected ? 'text-sky-400' : 'text-amber-400/80'} />
              )
            ) : (
              <TagIcon size={14} className={isSelected ? 'text-sky-400' : 'text-indigo-400/80'} />
            )}
          </div>

          {/* Node Name */}
          <span className="truncate text-xs tracking-tight" title={node.name}>
            {node.name}
          </span>
        </div>

        {/* Count Badge */}
        {count > 0 && (
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
              isSelected
                ? 'bg-sky-500/30 text-sky-200 border border-sky-400/30'
                : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700/80 group-hover:text-slate-300'
            }`}
          >
            {count}
          </span>
        )}
      </div>

      {/* Recursive Children */}
      {hasChildren && isExpanded && (
        <div className="space-y-0.5 relative before:absolute before:left-[19px] before:top-1 before:bottom-2 before:w-px before:bg-slate-800/80">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeId={selectedNodeId}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              onSelectNode={onSelectNode}
              quizCountsByNode={quizCountsByNode}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TaxonomyTreeSidebar: React.FC<TaxonomyTreeSidebarProps> = ({
  tree,
  selectedNodeId,
  onSelectNode,
  quizCountsByNode,
  totalQuizzesCount,
  isLoading = false,
  onCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Expand root items by default
    const set = new Set<string>();
    tree.forEach((root) => {
      set.add(root.id);
      if (root.children) {
        root.children.forEach((c) => set.add(c.id));
      }
    });
    return set;
  });

  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const all = new Set<string>();
    const traverse = (items: TaxonomyTreeNodeDTO[]) => {
      items.forEach((item) => {
        all.add(item.id);
        if (item.children) traverse(item.children);
      });
    };
    traverse(tree);
    setExpandedNodes(all);
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  const isAllSelected = selectedNodeId === '';

  return (
    <aside
      id="taxonomy-tree-sidebar"
      className="w-full h-full bg-slate-900/40 flex flex-col shrink-0 overflow-hidden"
    >
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-800/80 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-100 font-bold text-xs uppercase tracking-wider">
            <BookOpenIcon size={15} className="text-sky-400" />
            <span className="truncate">Cây Tri Thức</span>
          </div>
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
              title="Mở rộng tất cả"
            >
              Mở
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
              title="Thu gọn tất cả"
            >
              Thu
            </button>
            {onCollapse && (
              <>
                <div className="h-3 w-px bg-slate-800" />
                <button
                  type="button"
                  onClick={onCollapse}
                  className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                  title="Thu gọn thanh danh mục (Tối đa không gian đề thi)"
                >
                  <ChevronRightIcon size={14} className="rotate-180" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search inside taxonomy tree */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm môn học, chủ đề..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/80 focus:ring-1 focus:ring-sky-500/50 transition-all"
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
            <SearchIcon size={13} />
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Root Option: Tất cả môn học / chủ đề */}
        <div
          id="tree-node-all"
          onClick={() => onSelectNode('')}
          className={`flex items-center justify-between py-2 px-3 rounded-xl cursor-pointer transition-all text-xs mb-2 ${
            isAllSelected
              ? 'bg-sky-500/15 border border-sky-500/40 text-sky-200 font-bold shadow-sm shadow-sky-500/10'
              : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 border border-transparent'
          }`}
        >
          <div className="flex items-center space-x-2">
            <LayersIcon size={16} className={isAllSelected ? 'text-sky-400' : 'text-slate-400'} />
            <span className="truncate">Tất cả môn / chủ đề</span>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
              isAllSelected
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {totalQuizzesCount}
          </span>
        </div>

        {/* Tree Nodes List */}
        {isLoading ? (
          <div className="p-4 text-center text-xs text-slate-500 space-y-2">
            <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Đang tải cây thư mục...</p>
          </div>
        ) : tree.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            Chưa có danh mục phân loại nào.
          </div>
        ) : (
          tree.map((rootNode) => (
            <TreeNodeItem
              key={rootNode.id}
              node={rootNode}
              level={0}
              selectedNodeId={selectedNodeId}
              expandedNodes={expandedNodes}
              onToggleExpand={handleToggleExpand}
              onSelectNode={onSelectNode}
              quizCountsByNode={quizCountsByNode}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>

      {/* Sidebar Footer Info */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="truncate">Chuẩn phân loại: TOPIC</span>
        <span className="font-mono text-sky-400 text-[10px]">Cây Tri Thức</span>
      </div>
    </aside>
  );
};
