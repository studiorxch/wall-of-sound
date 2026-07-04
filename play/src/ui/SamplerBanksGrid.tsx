import { useState, useRef, useEffect } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import { relTimeShort } from "../logic/dateFormat";
import { CollectionGrid } from "./CollectionGrid";
import { CollectionCard } from "./CollectionCard";
import { SourceBadge } from "./SourceBadge";

type Props = {
  banks: PlaylistRecord[];
  loadedBankId: string | null;
  onOpen: (id: string) => void;
  onLoadInSampler: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (title?: string) => void;
  onRename?: (id: string, title: string) => void;
};

// Inline rename lives here (not in CollectionGrid) because it's sampler-specific.
function useBankRename(onRename?: (id: string, title: string) => void) {
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renameId) renameInputRef.current?.focus(); }, [renameId]);

  function startRename(id: string, currentTitle: string) {
    setRenameId(id);
    setRenameName(currentTitle);
  }

  function submitRename() {
    if (renameId && renameName.trim()) onRename?.(renameId, renameName.trim());
    setRenameId(null);
    setRenameName("");
  }

  return { renameId, renameName, setRenameName, renameInputRef, startRename, submitRename };
}

export function SamplerBanksGrid({ banks, loadedBankId, onOpen, onLoadInSampler, onDuplicate, onDelete, onCreate, onRename }: Props) {
  const rename = useBankRename(onRename);

  return (
    <CollectionGrid
      items={banks}
      itemId={(b) => b.playlistId}
      title="Sampler Banks"
      createLabel="+ New Sampler Bank"
      createWithNamePrompt
      createNamePlaceholder="Bank name…"
      defaultCreateName="New Sampler Bank"
      onCreate={onCreate}
      emptyMessage="No Sampler Banks yet."
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      deleteModalTitle="Delete Sampler Bank?"
      deleteModalBody={(b) => `"${b.title}" will be removed. Reference tracks are not deleted.`}
      deleteActionLabel="Delete Bank"
      minItemsForDelete={2}
      renderCtxMenu={(id, { startDelete, onDuplicate: dup, close }) => {
        const bank = banks.find((b) => b.playlistId === id);
        return (
          <>
            <button className="ctx-item" onClick={() => { onOpen(id); close(); }}>Open Bank</button>
            <button className="ctx-item" onClick={() => { onLoadInSampler(id); close(); }}>Load in Sampler</button>
            <div className="ctx-sep" />
            {onRename && (
              <button className="ctx-item" onClick={() => { rename.startRename(id, bank?.title ?? ""); close(); }}>Rename…</button>
            )}
            {dup && <button className="ctx-item" onClick={() => dup(id)}>Duplicate</button>}
            <div className="ctx-sep" />
            <button
              className={`ctx-item danger${banks.length <= 1 ? " ctx-item-disabled" : ""}`}
              disabled={banks.length <= 1}
              onClick={() => startDelete(id)}
            >Delete…</button>
          </>
        );
      }}
      renderCard={(bank, { openCtxMenu }) => {
        const clipCount = bank.slots.filter((s) => s.assignedTrackId).length;
        const isLoaded = bank.playlistId === loadedBankId;
        const isRenaming = rename.renameId === bank.playlistId;
        return (
          <CollectionCard
            key={bank.playlistId}
            id={bank.playlistId}
            title={bank.title}
            artSlot={
              <div className="pgc-art pgc-art--sampler">
                <span className="pgc-sampler-icon">▦</span>
                {isLoaded && <span className="pgc-loaded-pip" title="Loaded in Sampler" />}
              </div>
            }
            badge={clipCount}
            titleSlot={
              isRenaming ? (
                <span className="cat-group-input-row" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={rename.renameInputRef}
                    className="cat-filter-search"
                    style={{ width: 110, fontSize: 11 }}
                    value={rename.renameName}
                    onChange={(e) => rename.setRenameName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") rename.submitRename(); if (e.key === "Escape") rename.submitRename(); }}
                    onBlur={rename.submitRename}
                  />
                </span>
              ) : (
                <span className="pgc-title">{bank.title}</span>
              )
            }
            metaSlot={
              <span className="pgc-badges-row">
                <SourceBadge source="REF" className="pgc-source-badge" />
                {isLoaded && <span className="pgc-loaded-label">● In Sampler</span>}
              </span>
            }
            timestampSlot={!isLoaded && bank.updatedAt ? <span className="pgc-updated">{relTimeShort(bank.updatedAt)}</span> : undefined}
            activeClass={isLoaded ? "pgc--sampler pgc--loaded" : "pgc--sampler"}
            onClick={() => !isRenaming && onOpen(bank.playlistId)}
            onContextMenu={(e) => openCtxMenu(e, bank.playlistId)}
            hoverActions={
              <>
                <button className="pgc-ha-btn" title="Load in Sampler" onClick={() => onLoadInSampler(bank.playlistId)}>▶ Load</button>
                <button className="pgc-ha-btn" title="Open Bank" onClick={() => onOpen(bank.playlistId)}>Open</button>
                <button className="pgc-ha-btn" title="More" onClick={(e) => openCtxMenu(e, bank.playlistId)}>⋮</button>
              </>
            }
          />
        );
      }}
    />
  );
}
