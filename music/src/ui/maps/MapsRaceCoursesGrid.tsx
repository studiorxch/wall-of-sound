import { useEffect, useState } from "react";
import * as raceCourseStore from "../../maps/raceCourseStore";
import type { RaceCourse } from "../../data/raceCourseTypes";
import { CollectionCard } from "../CollectionCard";
import { Icon } from "../Icon";

// 0805C_MAPS_Race_Course_Library_and_Itinerary_Conversion
//
// Deliberately NOT built on CollectionGrid — that shared shell requires an
// onCreate handler and always renders a "+Create" control (in both the
// populated and empty-state returns). Race Courses has no direct-create
// flow at all (the ONLY creation path is "Create Race Course" on a saved
// itinerary, per spec) — closer to Vehicles/Overlays/Orbs' "no create
// button, records arrive some other way" shape than to Itineraries/
// Playlists' "+New" shape. This reuses CollectionCard for individual cards
// (no such requirement) and the same `pg-root`/`pg-toolbar`/`pg-grid`/
// `ctx-menu` CSS classes CollectionGrid already established, just without
// the mandatory create control or the delete-confirmation modal (Race
// Courses only ever archives/restores, never hard-deletes, per spec).

type Props = {
  onOpen: (id: string) => void;
};

function fmtDistance(m: number): string {
  const miles = m / 1609.344;
  return miles < 10 ? `${miles.toFixed(2)} mi` : `${Math.round(miles)} mi`;
}

function statusLabel(course: RaceCourse): string {
  if (course.status === "archived") return "Archived";
  if (course.status === "needs_review") return "Needs Review";
  return "Ready";
}

export function MapsRaceCoursesGrid({ onOpen }: Props) {
  const [courses, setCourses] = useState<RaceCourse[]>(raceCourseStore.listRaceCourses);
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    return raceCourseStore.subscribe(() => setCourses(raceCourseStore.listRaceCourses()));
  }, []);

  function openCtxMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ id, x: e.clientX, y: e.clientY });
  }

  function startRename(course: RaceCourse) {
    setRenamingId(course.id);
    setRenameDraft(course.name);
    setCtxMenu(null);
  }

  async function commitRename(id: string) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (name) await raceCourseStore.renameRaceCourse(id, name);
  }

  async function handleDuplicate(id: string) {
    await raceCourseStore.duplicateRaceCourse(id);
    setCtxMenu(null);
  }

  async function handleActivate(id: string) {
    await raceCourseStore.activateRaceCourse(id);
    setCtxMenu(null);
  }

  async function handleArchive(id: string) {
    await raceCourseStore.archiveRaceCourse(id);
    setCtxMenu(null);
  }

  async function handleRestore(id: string) {
    await raceCourseStore.restoreRaceCourse(id);
    setCtxMenu(null);
  }

  if (courses.length === 0) {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">No Race Courses yet — open a saved itinerary and click "Create Race Course."</div>
      </div>
    );
  }

  return (
    <div className="pg-root" onClick={() => ctxMenu && setCtxMenu(null)}>
      <div className="pg-toolbar">
        <span className="pg-toolbar-title">Race Courses</span>
      </div>

      <div className="pg-grid">
        {courses.map((course) => (
          <CollectionCard
            key={course.id}
            id={course.id}
            title={course.name}
            artSlot={
              <div className="pgc-art" style={{ background: "var(--surface3)" }}>
                <Icon name="flag" />
              </div>
            }
            badge={course.active ? "ACTIVE" : undefined}
            titleSlot={
              renamingId === course.id ? (
                <input
                  className="cat-filter-search"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => commitRename(course.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(course.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span className="pgc-title">{course.name}</span>
              )
            }
            metaSlot={
              <span className="race-course-meta">
                {fmtDistance(course.totalDistanceMeters)} · {course.checkpoints.length} checkpoints · {course.sections.length} sections · {statusLabel(course)}
                {course.sourceItineraryName ? ` · from ${course.sourceItineraryName}` : ""}
              </span>
            }
            onClick={() => onOpen(course.id)}
            onContextMenu={(e) => openCtxMenu(e, course.id)}
            hoverActions={
              <>
                <button className="pgc-ha-btn" title="Open" onClick={() => onOpen(course.id)}>Open</button>
                <button className="pgc-ha-btn" title="More" onClick={(e) => openCtxMenu(e, course.id)}>⋮</button>
              </>
            }
          />
        ))}
      </div>

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {(() => {
            const course = courses.find((c) => c.id === ctxMenu.id);
            if (!course) return null;
            return (
              <>
                <button className="ctx-item" onClick={() => { onOpen(course.id); setCtxMenu(null); }}>Open</button>
                <button className="ctx-item" onClick={() => startRename(course)}>Rename</button>
                <button className="ctx-item" onClick={() => handleDuplicate(course.id)}>Duplicate</button>
                <div className="ctx-sep" />
                {course.status === "archived" ? (
                  <button className="ctx-item" onClick={() => handleRestore(course.id)}>Restore</button>
                ) : (
                  <>
                    <button
                      className="ctx-item"
                      disabled={course.active}
                      onClick={() => handleActivate(course.id)}
                    >
                      {course.active ? "Active" : "Activate"}
                    </button>
                    <button className="ctx-item danger" onClick={() => handleArchive(course.id)}>Archive…</button>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
