import { useEffect, useRef, useState } from "react";
import * as itineraryStore from "../../maps/itineraryStore";
import { getMapboxToken, fetchRouteSet } from "../../logic/maps/itineraryRouting";
import { stagesNeedingRouting } from "../../logic/maps/itineraryStageOrder";
import { computeReadiness } from "../../logic/maps/itineraryReadiness";
import type { Itinerary, TravelMode } from "../../data/itineraryTypes";
import {
  dockPreviewMap, undockPreviewMap, getPreviewState, subscribePreviewState,
  setItineraryPins, setItineraryRouteLines, clearItineraryOverlay,
} from "../../maps/wallMapPreview";
import { Icon } from "../Icon";
import { ItineraryStopRow } from "./ItineraryStopRow";
import { AddDestinationDialog } from "./AddDestinationDialog";
import { ItineraryRunControls } from "./ItineraryRunControls";
import type { GeocodeResult } from "../../logic/maps/itineraryRouting";
import * as raceCourseStore from "../../maps/raceCourseStore";

// 0729E_MAPS_Itinerary_Collections_Foundation — the mockup's actual view:
// one left column (title, + Add Destination, ordered stop list, "Drag to
// reorder stops" footer) and the entire right column reserved for the map
// (numbered pins + each stage's selected route line — static, no animation,
// no vehicle/playhead, no route-alternative cards, no cinematic presentation).
//
// Routing is fetched ONLY for stages the store's derivation left needing it
// (routeSetId === "") — reordering/adding/removing a stop never refetches an
// untouched leg's already-fetched RouteSet.

type Props = {
  itineraryId: string;
  onBack: () => void;
};

export function MapsItineraryEditor({ itineraryId, onBack }: Props) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(() => itineraryStore.getItinerary(itineraryId));
  const [previewMapReady, setPreviewMapReady] = useState(getPreviewState() === "ready");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [raceCourseCreatedName, setRaceCourseCreatedName] = useState<string | null>(null);
  const routingInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    function refresh() { setItinerary(itineraryStore.getItinerary(itineraryId)); }
    const unsubStore = itineraryStore.subscribe(refresh);
    const unsubPreview = subscribePreviewState((s) => setPreviewMapReady(s === "ready"));
    const el = previewContainerRef.current;
    if (el) dockPreviewMap(el);
    return () => {
      unsubStore();
      unsubPreview();
      clearItineraryOverlay();
      undockPreviewMap();
    };
  }, [itineraryId]);

  // Fetch real routing for any stage the store's derivation left needing it
  // (routeSetId === "") — never refetches an untouched leg.
  useEffect(() => {
    if (!itinerary) return;
    const pending = stagesNeedingRouting(itinerary.stages);
    for (const stage of pending) {
      if (routingInFlight.current.has(stage.id)) continue;
      routingInFlight.current.add(stage.id);
      const origin = itinerary.stops.find((s) => s.id === stage.originStopId);
      const destination = itinerary.stops.find((s) => s.id === stage.destinationStopId);
      if (!origin || !destination) { routingInFlight.current.delete(stage.id); continue; }
      fetchRouteSet(origin, destination, stage.mode, getMapboxToken())
        .then((routeSet) => itineraryStore.applyStageRouteSet(itineraryId, stage.id, routeSet))
        .finally(() => routingInFlight.current.delete(stage.id));
    }
  }, [itinerary, itineraryId]);

  // Static map sync: numbered pins for every real stop + each stage's
  // selected route geometry. No animation beyond one instant reframe inside
  // setItineraryPins.
  useEffect(() => {
    if (!itinerary || !previewMapReady) return;
    setItineraryPins(itinerary.stops.map((s, i) => ({ id: s.id, longitude: s.longitude, latitude: s.latitude, label: String(i + 1) })));
    const lines = itinerary.stages
      .map((stage) => {
        const routeSet = itinerary.routeSets[stage.routeSetId];
        const route = routeSet?.routes.find((r) => r.id === stage.selectedRouteId);
        return route?.geometry;
      })
      .filter((g): g is NonNullable<typeof g> => !!g);
    setItineraryRouteLines(lines);
  }, [itinerary, previewMapReady]);

  if (!itinerary) {
    return (
      <div className="md-root">
        <div className="md-header"><span className="md-title">Itinerary not found.</span></div>
        <button className="tb-btn" onClick={onBack}>Back</button>
      </div>
    );
  }

  async function handleAddDestination(result: GeocodeResult) {
    setAddDialogOpen(false);
    await itineraryStore.addItineraryStop(itineraryId, {
      id: `stop_${Math.random().toString(36).slice(2, 10)}`,
      name: result.name,
      longitude: result.longitude,
      latitude: result.latitude,
      placeId: result.placeId,
    });
  }

  function handleDragStart(index: number) { setDraggingIndex(index); }
  function handleDragOver() { /* visual feedback only — actual move happens on drop */ }
  async function handleDrop(toIndex: number) {
    if (draggingIndex === null) return;
    const fromIndex = draggingIndex;
    setDraggingIndex(null);
    if (fromIndex === toIndex) return;
    await itineraryStore.reorderItineraryStops(itineraryId, fromIndex, toIndex);
  }

  async function handleChangeMode(stageId: string, mode: TravelMode) {
    await itineraryStore.updateStageMode(itineraryId, stageId, mode);
  }

  async function handleRemoveStop(stopId: string) {
    await itineraryStore.removeItineraryStop(itineraryId, stopId);
  }

  function submitTitle() {
    if (titleDraft != null && titleDraft.trim()) itineraryStore.renameItinerary(itineraryId, titleDraft.trim());
    setTitleDraft(null);
  }

  // "Create Race Course" — the ONLY creation path for the Race Courses
  // library (0805C). A snapshot conversion: the source itinerary is only
  // ever read, never mutated. No forced navigation away — a small transient
  // confirmation appears instead, since the new course shows up in the
  // Race Courses library (sidebar) the moment it's created.
  async function handleCreateRaceCourse() {
    if (!itinerary) return;
    const course = await raceCourseStore.createRaceCourseFromItinerary(itinerary);
    setRaceCourseCreatedName(course.name);
    window.setTimeout(() => setRaceCourseCreatedName(null), 4000);
  }

  const readiness = computeReadiness(itinerary);

  return (
    <div className="itin-editor-root">
      <div className="itin-editor-left">
        <div className="itin-editor-header">
          <button className="tb-btn sm" onClick={onBack}>← Back</button>
          {titleDraft != null ? (
            <input
              className="cat-filter-search"
              style={{ fontSize: 18, flex: 1 }}
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitTitle(); if (e.key === "Escape") setTitleDraft(null); }}
              onBlur={submitTitle}
            />
          ) : (
            <h2 className="itin-editor-title" onClick={() => setTitleDraft(itinerary.title)} title="Click to rename">
              {itinerary.title}
            </h2>
          )}
          <button className="tb-btn" onClick={() => setAddDialogOpen(true)}>
            <Icon name="add" /> Add Destination
          </button>
          <button
            className="tb-btn sm"
            onClick={handleCreateRaceCourse}
            disabled={itinerary.stages.length === 0}
            title="Convert this itinerary into a reusable Race Course"
          >
            <Icon name="flag" /> Create Race Course
          </button>
        </div>

        {raceCourseCreatedName && (
          <div className="itin-run-warning race-course-created-banner">
            Race Course "{raceCourseCreatedName}" created — find it in Race Courses.
          </div>
        )}

        <ItineraryRunControls itinerary={itinerary} />

        <div className="itin-stop-list">
          {itinerary.stops.length === 0 && (
            <div className="pg-empty-msg">No destinations yet — add one to begin.</div>
          )}
          {itinerary.stops.map((stop, i) => {
            const incomingStage = i === 0 ? null : itinerary.stages.find((s) => s.destinationStopId === stop.id) ?? null;
            return (
              <ItineraryStopRow
                key={stop.id}
                index={i}
                stop={stop}
                incomingStage={incomingStage}
                isLast={i === itinerary.stops.length - 1}
                draggingIndex={draggingIndex}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onChangeMode={handleChangeMode}
                onRemove={handleRemoveStop}
              />
            );
          })}
        </div>

        {itinerary.stops.length > 1 && (
          <div className="itin-editor-footer">
            <Icon name="drag_indicator" /> Drag to reorder stops
            {readiness === "incomplete" && <span className="itin-editor-footer-note"> · routing in progress…</span>}
          </div>
        )}
      </div>

      <div className="itin-editor-right" ref={previewContainerRef}>
        {!previewMapReady && <div className="md-preview-loading">Map preview loading…</div>}
      </div>

      {addDialogOpen && (
        <AddDestinationDialog onAdd={handleAddDestination} onClose={() => setAddDialogOpen(false)} />
      )}
    </div>
  );
}
