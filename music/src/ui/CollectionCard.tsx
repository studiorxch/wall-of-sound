import type { ReactNode } from "react";

/**
 * Generic card shell for collection grids (Playlists, Sampler Banks, and future
 * libraries). Renders the pgc DOM structure and wires click / context-menu.
 * All schema-specific content is passed as slots.
 *
 * Slot contract:
 *   artSlot       — the cover/icon area (fills pgc-art dimensions)
 *   badge         — short count shown in the top-right corner
 *   titleSlot     — primary label (supports inline rename input)
 *   metaSlot      — secondary label row (duration, clip count, status…)
 *   timestampSlot — faint timestamp shown bottom-left of info block
 *   hoverActions  — buttons revealed on hover
 *   activeClass   — extra CSS modifier appended to pgc (e.g. "pgc--loaded")
 */
export type CollectionCardProps = {
  id: string;
  title: string;
  artSlot: ReactNode;
  badge?: ReactNode;
  titleSlot?: ReactNode;
  metaSlot?: ReactNode;
  timestampSlot?: ReactNode;
  hoverActions: ReactNode;
  activeClass?: string;
  style?: React.CSSProperties;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

export function CollectionCard({
  title,
  artSlot,
  badge,
  titleSlot,
  metaSlot,
  timestampSlot,
  hoverActions,
  activeClass,
  style,
  onClick,
  onContextMenu,
}: CollectionCardProps) {
  return (
    <div
      className={`pgc${activeClass ? ` ${activeClass}` : ""}`}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
    >
      {artSlot}
      {badge != null && <span className="pgc-count-badge">{badge}</span>}
      <div className="pgc-info">
        {titleSlot ?? <span className="pgc-title">{title}</span>}
        {metaSlot}
        {timestampSlot}
      </div>
      <div className="pgc-hover-actions" onClick={(e) => e.stopPropagation()}>
        {hoverActions}
      </div>
    </div>
  );
}
