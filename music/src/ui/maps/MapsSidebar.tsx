import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import * as wallPaletteBridge from "../../maps/wallPaletteBridge";
import { ensurePreviewMap } from "../../maps/wallMapPreview";

// Left nav column for the MAPS domain — reuses MUSIC's real .file-manager/
// .fm-* classes verbatim (0722_MUSIC_Left_Panel_Visual_Normalization) so
// width, spacing, typography, selected-row treatment, collapse behavior, and
// divider structure match exactly, rather than a parallel implementation
// that could drift.
//
// 0729_MAPS_Geographic_Library_Migration — "Palettes"/"Collections" renamed
// to "Geographic"/"Libraries": Default and Episode 2 are Geographic Style
// records now, not palettes-as-a-collection. Same underlying records/IDs/
// data — Wall's mapsPaletteAuthority.js etc. are untouched; this is a
// user-facing terminology change only. Only real, current content: one
// Libraries section with the one real destination (Geographic). No
// placeholder sections.

type Props = {
  onSelectGeographic: () => void;
};

function readGeographicCount(): number {
  const list = wallPaletteBridge.listPalettes();
  return list.ok ? list.data.length : 0;
}

export function MapsSidebar({ onSelectGeographic }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [geographicCount, setGeographicCount] = useState(readGeographicCount);

  useEffect(() => {
    // authority.init() itself doesn't call subscribe()'s notify — only later
    // mutations (activate/preview/etc.) do — so on first mount, before any
    // mutation has ever happened, the count would otherwise stay at its
    // initial (possibly zero, if the map hadn't finished loading yet) value
    // forever. ensurePreviewMap's ready callback is what actually signals
    // "the authority just initialized," same trigger MapsPalettesGrid uses.
    if (!wallPaletteBridge.isAuthorityInitialized()) ensurePreviewMap(() => setGeographicCount(readGeographicCount()));
    const unsubscribe = wallPaletteBridge.subscribe(() => setGeographicCount(readGeographicCount()));
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
            <div className="fm-section-header">Libraries</div>
            <button className="fm-row active" onClick={onSelectGeographic}>
              <span className="fm-row-icon"><Icon name="map" /></span>
              <span className="fm-row-label">Geographic</span>
              <span className="fm-row-count">{geographicCount}</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
