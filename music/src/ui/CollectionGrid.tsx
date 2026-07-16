import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";

/**
 * Generic collection grid shell shared by Playlists, Sampler Banks, and future
 * libraries (Image, Color, Mood, etc.).
 *
 * Handles:
 *   - toolbar (title + create button / inline name prompt)
 *   - empty state
 *   - pg-grid wrapper
 *   - context-menu state (position tracking, dismiss on outside click)
 *   - delete confirmation modal (parameterised per collection type)
 *
 * Does NOT handle:
 *   - card rendering — provided via renderCard()
 *   - schema-specific fields (BPM, clip count, artwork, etc.)
 *   - rename state — left to wrappers that need it
 */

export type CollectionGridCtxBag = {
  ctxId: string | null;
  openCtxMenu: (e: React.MouseEvent, id: string) => void;
  closeCtxMenu: () => void;
};

export type CollectionGridProps<T> = {
  // Data
  items: T[];
  itemId: (item: T) => string;

  // Toolbar
  title: string;
  createLabel: string;
  // If true, show an inline name input before creating; onCreate receives the name.
  createWithNamePrompt?: boolean;
  createNamePlaceholder?: string;
  defaultCreateName?: string;
  onCreate: (name?: string) => void;

  // Empty state
  emptyMessage: string;

  // Delete confirmation modal
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  deleteModalTitle: string;
  deleteModalBody: (item: T) => string;
  deleteActionLabel: string;
  // Minimum items before Delete is enabled (default 1 — always allowed).
  minItemsForDelete?: number;

  // Context menu items rendered inside the positioned ctx-menu div.
  // Receives the hovered id and grid-level callbacks (delete/duplicate triggers).
  renderCtxMenu: (id: string, bag: {
    startDelete: (id: string) => void;
    onDuplicate?: (id: string) => void;
    close: () => void;
  }) => ReactNode;

  // Card rendering — receives the item plus a pre-bound onContextMenu handler.
  renderCard: (item: T, bag: CollectionGridCtxBag) => ReactNode;
};

export function CollectionGrid<T>({
  items,
  itemId,
  title,
  createLabel,
  createWithNamePrompt = false,
  createNamePlaceholder = "Name…",
  defaultCreateName = "",
  onCreate,
  emptyMessage,
  onDelete,
  onDuplicate,
  deleteModalTitle,
  deleteModalBody,
  deleteActionLabel,
  minItemsForDelete = 1,
  renderCtxMenu,
  renderCard,
}: CollectionGridProps<T>) {
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [createName, setCreateName] = useState(defaultCreateName);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (showCreateInput) createInputRef.current?.focus(); }, [showCreateInput]);

  function openCtxMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ id, x: e.clientX, y: e.clientY });
  }

  function submitCreate() {
    const name = createName.trim() || defaultCreateName || title;
    onCreate(createWithNamePrompt ? name : undefined);
    setCreateName(defaultCreateName);
    setShowCreateInput(false);
  }

  const ctxBag: CollectionGridCtxBag = {
    ctxId: ctxMenu?.id ?? null,
    openCtxMenu,
    closeCtxMenu: () => setCtxMenu(null),
  };

  const createControl = createWithNamePrompt && showCreateInput ? (
    <span className="cat-group-input-row">
      <input
        ref={createInputRef}
        className="cat-filter-search"
        style={{ width: 160 }}
        placeholder={createNamePlaceholder}
        value={createName}
        onChange={(e) => setCreateName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitCreate();
          if (e.key === "Escape") { setShowCreateInput(false); setCreateName(defaultCreateName); }
        }}
      />
      <button className="tb-btn sm" onClick={submitCreate}>Create</button>
      <button className="tb-btn sm" onClick={() => { setShowCreateInput(false); setCreateName(defaultCreateName); }}>Cancel</button>
    </span>
  ) : (
    <button
      className="pg-create-btn"
      onClick={() => createWithNamePrompt ? setShowCreateInput(true) : onCreate()}
    >
      {createLabel}
    </button>
  );

  if (items.length === 0) {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">{emptyMessage}</div>
        {createControl}
      </div>
    );
  }

  const toDelete = deleteConfirm ? items.find((i) => itemId(i) === deleteConfirm) : null;
  const canDelete = items.length >= minItemsForDelete;

  return (
    <div className="pg-root" onClick={() => ctxMenu && setCtxMenu(null)}>
      <div className="pg-toolbar">
        <span className="pg-toolbar-title">{title}</span>
        {createControl}
      </div>

      <div className="pg-grid">
        {items.map((item) => renderCard(item, ctxBag))}
      </div>

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {renderCtxMenu(ctxMenu.id, {
            startDelete: (id) => { if (canDelete) { setDeleteConfirm(id); setCtxMenu(null); } },
            onDuplicate: onDuplicate ? (id) => { onDuplicate(id); setCtxMenu(null); } : undefined,
            close: () => setCtxMenu(null),
          })}
        </div>
      )}

      {toDelete && (
        <div className="export-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="export-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="export-modal-header">
              <span>{deleteModalTitle}</span>
              <button className="export-modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div style={{ padding: "14px 16px", fontSize: 12, color: "var(--text-mid)", lineHeight: 1.5 }}>
              {deleteModalBody(toDelete)}
            </div>
            <div className="export-modal-footer">
              <button className="tb-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                className="tb-btn remove-btn"
                onClick={() => { onDelete(deleteConfirm!); setDeleteConfirm(null); }}
              >
                {deleteActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
