import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import * as wallPaletteBridge from "../../maps/wallPaletteBridge";
import { ensurePreviewMap } from "../../maps/wallMapPreview";

// Left nav column for the MAPS domain — reuses MUSIC's real .file-manager/
// .fm-* classes verbatim (0722_MUSIC_Left_Panel_Visual_Normalization) so
// width, spacing, typography, selected-row treatment, collapse behavior, and
// divider structure match exactly, rather than a parallel implementation
// that could drift. Only real, current content: one Collections section
// with the one real destination (Palettes). No placeholder sections.

type Props = {
  onSelectPalettes: () => void;
};

function readPaletteCount(): number {
  const list = wallPaletteBridge.listPalettes();
  return list.ok ? list.data.length : 0;
}

export function MapsSidebar({ onSelectPalettes }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteCount, setPaletteCount] = useState(readPaletteCount);

  useEffect(() => {
    // authority.init() itself doesn't call subscribe()'s notify — only later
    // mutations (activate/preview/etc.) do — so on first mount, before any
    // mutation has ever happened, the count would otherwise stay at its
    // initial (possibly zero, if the map hadn't finished loading yet) value
    // forever. ensurePreviewMap's ready callback is what actually signals
    // "the authority just initialized," same trigger MapsPalettesGrid uses.
    if (!wallPaletteBridge.isAuthorityInitialized()) ensurePreviewMap(() => setPaletteCount(readPaletteCount()));
    const unsubscribe = wallPaletteBridge.subscribe(() => setPaletteCount(readPaletteCount()));
    return unsubscribe;
  }, []);

  return (
    <nav className={`file-manager${collapsed ? " fm-collapsed" : ""}`}>
      <button
        className="fm-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <Icon name={collapsed ? "chevron_right" : "chevron_left"} />
      </button>

      {!collapsed && (
        <div className="fm-body">
          <div className="fm-brand">MAPS</div>
          <div className="fm-section">
            <div className="fm-section-header">Collections</div>
            <button className="fm-row active" onClick={onSelectPalettes}>
              <span className="fm-row-icon"><Icon name="palette" /></span>
              <span className="fm-row-label">Palettes</span>
              <span className="fm-row-count">{paletteCount}</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
