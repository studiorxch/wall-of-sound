import { useState } from "react";

export type DrawerMode = "playlist" | "library" | "orphans" | "excluded" | "locks";

const NAV_ITEMS: { mode: DrawerMode; icon: string; label: string }[] = [
  { mode: "playlist",  icon: "≡",  label: "Current Playlist" },
  { mode: "library",   icon: "⊞",  label: "Library" },
  { mode: "orphans",   icon: "◉",  label: "Orphans" },
  { mode: "excluded",  icon: "⊘",  label: "Excluded" },
  { mode: "locks",     icon: "🔒", label: "Locks" },
];

type Props = {
  mode: DrawerMode;
  onModeChange: (m: DrawerMode) => void;
  counts: Record<DrawerMode, number>;
};

export function LeftDrawer({ mode, onModeChange, counts }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav className={`left-drawer${collapsed ? " collapsed" : ""}`}>
      <button className="drawer-toggle" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expand" : "Collapse"}>
        {collapsed ? "›" : "‹"}
      </button>
      <ul className="drawer-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.mode}>
            <button
              className={`drawer-item${mode === item.mode ? " active" : ""}`}
              onClick={() => onModeChange(item.mode)}
              title={item.label}
            >
              <span className="drawer-icon">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="drawer-label">{item.label}</span>
                  {counts[item.mode] > 0 && (
                    <span className={`drawer-count${item.mode === "orphans" ? " warn" : ""}`}>
                      {counts[item.mode]}
                    </span>
                  )}
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
