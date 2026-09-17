import {
  AdaptiveCurveReconstructor,
  type CurveInputSample,
  type CurveReconstructionOptions,
} from "./AdaptiveCurveReconstructor";
import { getSprayBackground, type SprayBackground } from "./Backgrounds";
import { renderAllBrushPreviews, renderMarkerSizeSample } from "./BrushPreview";
import { getSprayOverride, resolveEffectiveSprayStyle } from "./BrushProperties";
import { BrushStudioController, markerFamilyFor } from "./BrushStudio";
import { CalibrationBenchController } from "./CalibrationBenchController";
import { EMPTY_CUSTOM_SPRAY_REGISTRY, type CustomSprayBrushRegistry } from "./CustomBrush";
import { CameraLuminanceSampler } from "./CameraLuminance";
import { CanonicalStrokeManager } from "./CanonicalStroke";
import {
  COLOR_PALETTES,
  INITIAL_COLOR_PALETTE_STATE,
  getColorPalette,
  selectColorPalette,
  selectPaletteColor,
  type ColorPaletteId,
  type ColorPaletteState,
} from "./ColorPalette";
import { CommandRegistry } from "./CommandRegistry";
import { DripAccumulator } from "./DripLogic";
import {
  INITIAL_DRAWING_TOOL_SELECTION,
  getDrawingTool,
  isDrawingToolId,
  resolveDrawingToolPresentation,
  resolveSelectedToolForInput,
  selectDrawingTool,
  selectMarkerVariant,
  selectSprayCap,
  type DrawingToolId,
  type DrawingToolSelection,
  type MarkerVariantId,
} from "./DrawingTool";
import { DrawingToolRenderer, type ToolStrokeStyle } from "./DrawingToolRenderer";
import { clearDrawingSurfaceState } from "./DrawingSurfaceClear";
import {
  resolveDrawingCursorAim,
  resolveDrawingCursorGeometry,
  type DrawingCursorAimState,
} from "./DrawingCursor";
import { HandTracker, type HandTrackingDiagnostics, type HandTrackingResult } from "./HandTracker";
import {
  HAND_EDGE_TRACKING_FRESH_MS,
  resetHandEdgeMotion,
  resolveHandEdgeMotion,
  type HandEdgeMotionState,
} from "./HandEdgeMotion";
import {
  shouldBridgeMissingHandSample,
  shouldResumeHandDrawingAfterPan,
} from "./HandTrackingReliability";
import { PerformanceRecorder } from "./PerformanceRecorder";
import { getMarkerVariant, resolveMarkerCurveCornerAngle } from "./PaintMarkerEngine";
import {
  INITIAL_MARKER_WIDTHS,
  getMarkerWidthPresets,
  selectMarkerWidth,
  type MarkerWidthState,
} from "./MarkerWidthPresets";
import { resolveInteractionAuthority, type InteractionAuthority } from "./InteractionAuthority";
import { INITIAL_PLAYER_STATE, reducePlayerState, type PlayerAction, type PlayerState } from "./PlayerState";
import { INITIAL_SETTINGS_STATE, reduceSettingsState, type SettingsAction, type SettingsState } from "./SettingsState";
import { createStrokeRandom, PLUME_MAX_ANGLE_DEGREES } from "./SprayBrushEngine";
import { SprayCanAudio } from "./SprayCanAudio";
import { getSprayCapPreset } from "./SprayCapPresets";
import {
  FLAIR_STROKE_START_POLICY,
  inverseEffectiveFlairDistance,
  isFlairEligibleCap,
  resolveDefaultFlairMode,
  resolveFlairModulationWithParams,
  resolveFlairSize,
  resolveFlairStartDistance,
  type EffectiveFlairParams,
} from "./FlairCurves";
import { buildContinuousSegmentEnds } from "./FlairContinuity";
import { getFlairOverride, resolveEffectiveFlairParams } from "./FlairProperties";
import {
  normalizePointerSample,
  resolvePencilCoverage,
  resolvePencilSprayAngle,
  type NormalizedPointerSample,
  type RawPointerSample,
} from "./PencilInput";
import { type FlairModeId, type SurfaceContextId } from "./ToolTaxonomy";
import { StrokeHistory, type RecordedStroke } from "./StrokeHistory";
import { StrokeSmoother } from "./StrokeSmoother";
import { TrackingQualityMonitor, type TrackingQualityAssessment } from "./TrackingQuality";
import { resolveToolFeedback } from "./ToolFeedback";
import { type InputSourceMode, type StrokePoint } from "./types";
import { WetPaintAccumulator, isWetMarkerVariant } from "./WetPaintModel";
import {
  INITIAL_WET_PAINT_CONTROLS,
  updateWetPaintControls,
  type WetPaintControlState,
  type WetPaintFlow,
  type WetPaintViscosity,
} from "./WetPaintControls";
import { resolveWallComposition, type WallEnvironmentMode } from "./WallComposition";
import {
  applyPan,
  applyZoomAroundPoint,
  beginPanInteraction,
  cancelPanInteraction,
  formatZoomPercentage,
  isWheelZoomGesture,
  resetPanInteraction,
  resetWallView,
  resolveWheelPan,
  resolveWheelZoom,
  resolveZoomStepWindow,
  screenToWall,
  setSpacePanHeld,
  shouldPanPointer,
  toggleQuickZoom,
  type PanInteractionState,
  type PanCancellationReason,
  type WallPoint,
  type WallViewState,
} from "./WallView";

const MIN_DEPOSIT_INTERVAL_MS = 16;
/** Wall units of simulated spray size per screen pixel of Alt-held vertical drag — see `adjustSimulatedSprayDistance`. Tuned so the near/reference/far anchors (~25/32/42) are each a comfortable, deliberate drag apart, not a hair-trigger. */
const SIMULATED_DISTANCE_DRAG_SENSITIVITY = 0.15;
/** Screen pixels of Alt-held vertical drag that cross Flair's full normalized 0-1 simulated-distance range at `distanceSensitivity` 1 — see `adjustActiveFlairDistance`. Each eligible cap's own size floor/span comes from its own `getFlairSizeDefaults(mode, capBaseRadius, tier)` in `FlairCurves.ts`, shared with Brush Studio's preview/readouts. */
const FLAIR_DRAG_RANGE_PX = 260;
/** off -> wall -> blackbook -> wild -> off, cycled by the small Flair keyboard shortcut (see `cycleActiveFlairMode`) — never a toolbar redesign, just a temporary desktop testing control matching the existing Alt+scroll/Alt+drag precedent. */
const FLAIR_MODE_CYCLE: readonly FlairModeId[] = ["off", "wall", "blackbook", "wild"];
class SpatialSpraypaintApp {
  private readonly compositeCanvas: HTMLCanvasElement;
  private readonly compositeCtx: CanvasRenderingContext2D;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly paintCtx: CanvasRenderingContext2D;
  private readonly wetDripCanvas: HTMLCanvasElement;
  private readonly wetDripCtx: CanvasRenderingContext2D;
  private readonly wetOverlayCanvas: HTMLCanvasElement;
  private readonly wetOverlayCtx: CanvasRenderingContext2D;

  private readonly strokeManager = new CanonicalStrokeManager();
  private readonly strokeSmoother = new StrokeSmoother();
  private readonly curveReconstructor = new AdaptiveCurveReconstructor();
  private readonly toolRenderer = new DrawingToolRenderer();
  private readonly dripAccumulator = new DripAccumulator();
  private readonly wetPaintAccumulator = new WetPaintAccumulator();
  private readonly strokeHistory = new StrokeHistory(40);
  private readonly handTracker = new HandTracker();
  private readonly cameraLuminanceSampler = new CameraLuminanceSampler();
  private readonly trackingQualityMonitor = new TrackingQualityMonitor();
  private readonly recorder = new PerformanceRecorder();
  private readonly sprayCanAudio = new SprayCanAudio();
  private readonly commandRegistry: CommandRegistry;

  private inputMode: InputSourceMode = "mouse";
  private wallEnvironmentMode: WallEnvironmentMode = "wall";
  private wallEnvironmentColor = "#171822";
  private wallEnvironmentImage: HTMLImageElement | null = null;
  private wallEnvironmentImageUrl: string | null = null;
  private toolSelection: DrawingToolSelection = { ...INITIAL_DRAWING_TOOL_SELECTION };
  private colorPaletteState: ColorPaletteState = {
    ...INITIAL_COLOR_PALETTE_STATE,
    recentColors: [...INITIAL_COLOR_PALETTE_STATE.recentColors],
  };
  private wetPaintControls: WetPaintControlState = { ...INITIAL_WET_PAINT_CONTROLS };
  private markerWidths: MarkerWidthState = { ...INITIAL_MARKER_WIDTHS };
  private selectedBackground: SprayBackground = getSprayBackground("black");
  private settings: SettingsState = { ...INITIAL_SETTINGS_STATE };
  private player: PlayerState = { ...INITIAL_PLAYER_STATE };
  private baseRadius = getSprayCapPreset(INITIAL_DRAWING_TOOL_SELECTION.sprayCapId).baseRadius;
  private isDrawing = false;
  private webcamActive = false;
  private lastHandResult: HandTrackingResult | null = null;
  private activeWallPoint: WallPoint | null = null;
  private wallView: WallViewState = resetWallView();
  private quickZoomRestore: WallViewState | null = null;
  private handEdgeMotion: HandEdgeMotionState = resetHandEdgeMotion();
  private lastRenderTimestamp = 0;
  private lastScreenPoint: WallPoint | null = null;
  /** Previous frame's screen Y while the temporary Alt+vertical-drag simulated-distance gesture is active (see `adjustSimulatedSprayDistance`) — null whenever that gesture isn't currently running, so the very first Alt-held move of a drag contributes no jump. */
  private simulatedDistanceDragLastY: number | null = null;
  /** Previous raw pointer sample from the current pointer sequence — velocity's own "previous" for `normalizePointerSample` (see `PencilInput.ts`), independent of stroke/drawing state so diagnostics work on hover too. Reset to null on every `pointerdown`. */
  private lastRawPointerSample: RawPointerSample | null = null;
  /** Section 3 of the Flair build brief: routing/default authority only — no UI selects this yet, and it never hard-codes screen position as depth. The selected cap's own Flair-mode cycle (see `cycleActiveFlairMode`) is this pass's live-testable surface. */
  private surfaceContext: SurfaceContextId = "neutral";
  /** The currently-selected `isFlairEligibleCap` cap's active Flair mode — the brief's "safe creative sandbox," now covering both real, user-reachable Fat caps (Pink Dot Fat, New York Fat). Every ineligible cap ignores this field entirely (see `applyFlairOutputToPoint`/`adjustSimulatedSprayDistance`'s own cap-id gate). A single shared field, not per-cap memory: switching caps keeps whatever mode is set, exactly like every prior pass's single-cap behavior. */
  private activeFlairMode: FlairModeId = resolveDefaultFlairMode(this.surfaceContext);
  /** Normalized (0-1) simulated distance driving the selected eligible cap's Flair curves — persists across strokes like a live depth dial (only the per-drag `simulatedDistanceDragLastY` anchor above resets each gesture). Starts at a neutral mid-point. */
  private activeFlairDistance01 = 0.5;
  /** The output/opacity multiplier resolved from `activeFlairDistance01` — recomputed on every `adjustActiveFlairDistance` call, consumed once per deposited point via `applyFlairOutputToPoint`. Always 1 while Flair is off. */
  private activeFlairOutputMultiplier = 1;
  /** Real Spray Pass build brief, section 3: the resolved `bloom01` (mist/translucency magnitude) from the same modulation call that resolves width/output — consumed once per deposit batch by `buildContinuousSegmentEnds`'s mist treatment (see `FlairContinuity.ts`). Always 0 while Flair is off. */
  private activeFlairBloom01 = 0;
  private drawingCursorAim: DrawingCursorAimState = { point: null, angle: 0 };
  private physicalCursorVisible = false;
  private panInteraction: PanInteractionState = resetPanInteraction();
  private panPointerId: number | null = null;
  private lastPanScreen: WallPoint | null = null;
  private lastDepositTimestamp = 0;
  private mappedPointLogged = false;
  private markDeliveryLogged = false;
  private hasPinchDrawn = false;
  private lastPinchingAt = 0;
  private trackingQuality: TrackingQualityAssessment = {
    quality: "good",
    warningVisible: false,
    evidence: [],
  };
  private cameraLuminance: number | null = null;
  private lastDeliveredWallPoint: WallPoint | null = null;
  private lastDeliveredAt = 0;
  private activeStrokeRandom: (() => number) | null = null;
  private activeStrokeStyle: ToolStrokeStyle | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private audioObjectUrl: string | null = null;
  private customSprayRegistry: CustomSprayBrushRegistry = EMPTY_CUSTOM_SPRAY_REGISTRY;
  private readonly brushStudio: BrushStudioController;
  private readonly calibrationBench: CalibrationBenchController;

  constructor() {
    this.calibrationBench = new CalibrationBenchController({
      getCustomSprayRegistry: () => this.customSprayRegistry,
    });
    this.brushStudio = new BrushStudioController({
      getToolSelection: () => this.toolSelection,
      getSprayOverrides: () => this.settings.sprayOverrides,
      getMarkerWidths: () => this.markerWidths,
      getCustomSprayRegistry: () => this.customSprayRegistry,
      selectTool: (toolId) => this.applyToolSelection(toolId),
      selectSprayCap: (capId) => this.applySprayCapSelection(capId),
      selectMarkerVariant: (id) => this.applyMarkerSelection(id),
      setSprayProperty: (capId, patch) => this.setSettings({ type: "spray-property", capId, patch }),
      resetSprayProperty: (capId, key) => this.setSettings({ type: "reset-spray-property", capId, key }),
      resetSprayBrush: (capId) => this.setSettings({ type: "reset-spray-brush", capId }),
      getFlairOverrides: () => this.settings.flairOverrides,
      getActiveFlairMode: () => this.activeFlairMode,
      setActiveFlairMode: (mode) => this.setActiveFlairMode(mode),
      setFlairProperty: (capId, mode, patch) => this.setSettings({ type: "flair-property", capId, mode, patch }),
      resetFlairProperty: (capId, mode, key) => this.setSettings({ type: "reset-flair-property", capId, mode, key }),
      resetFlairMode: (capId, mode) => this.setSettings({ type: "reset-flair-mode", capId, mode }),
      setMarkerWidth: (id, width) => {
        this.markerWidths = selectMarkerWidth(this.markerWidths, id, width);
        if (this.toolSelection.markerVariantId === id) this.baseRadius = width;
        this.updateRadiusUi();
      },
      setCustomSprayRegistry: (registry) => { this.customSprayRegistry = registry; },
      openCalibrationBench: (capId) => this.calibrationBench.open(capId),
      getWetPaintControls: () => this.wetPaintControls,
      setWetPaintControls: (patch) => {
        this.wetPaintControls = updateWetPaintControls(this.wetPaintControls, patch);
      },
    });
    this.compositeCanvas = this.requireElement<HTMLCanvasElement>("composite-canvas");
    this.compositeCtx = this.compositeCanvas.getContext("2d")!;
    this.paintCanvas = document.createElement("canvas");
    this.paintCtx = this.paintCanvas.getContext("2d")!;
    this.wetDripCanvas = document.createElement("canvas");
    this.wetDripCtx = this.wetDripCanvas.getContext("2d")!;
    this.wetOverlayCanvas = document.createElement("canvas");
    this.wetOverlayCtx = this.wetOverlayCanvas.getContext("2d")!;
    this.commandRegistry = new CommandRegistry({
      undo: () => this.undoLastStroke(),
      clear: () => this.clearAllStrokes(),
      pan: () => this.setPanModifier(true),
      "quick-zoom": () => this.quickZoom(),
      "zoom-in": () => this.zoomBy(1.25),
      "zoom-out": () => this.zoomBy(0.8),
      "reset-view": () => this.resetView(),
      settings: () => this.setSettings({ type: "toggle" }),
      record: () => this.toggleRecording(),
      "close-settings": () => {
        this.setSettings({ type: "close" });
        this.cancelPan("escape");
      },
    }, {
      pan: () => this.setPanModifier(false),
    });

    this.initResize();
    this.renderColorPalette();
    renderAllBrushPreviews(document);
    this.bindControls();
    this.bindPhysicalInput();
    this.bindCommandSystem();
    this.renderShortcutReference();
    this.updateSettingsUi();
    this.updateToolUi();
    this.updatePlayerUi();
    this.updateUndoControl();
    this.updateNavigationUi();
    this.updateTrackingOverlay(null);
    this.updateTrackingVisibility();
    this.startRenderLoop();
  }

  private requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Spatial Spraypaint UI is missing #${id}.`);
    return element as T;
  }

  private get selectedColor(): string {
    return this.colorPaletteState.currentColor;
  }

  private initResize(): void {
    const handleResize = () => {
      this.finishActiveStroke();
      this.compositeCanvas.width = window.innerWidth;
      this.compositeCanvas.height = window.innerHeight;
      this.paintCanvas.width = window.innerWidth;
      this.paintCanvas.height = window.innerHeight;
      this.wetDripCanvas.width = window.innerWidth;
      this.wetDripCanvas.height = window.innerHeight;
      this.wetOverlayCanvas.width = window.innerWidth;
      this.wetOverlayCanvas.height = window.innerHeight;
      this.toolRenderer.resize(window.innerWidth, window.innerHeight);
      this.replayStrokes(this.strokeHistory.snapshot());
      this.refreshDrawingCursor();
      // Keep the `...` menu attached to its button through any
      // resize/reflow (e.g. rotating an iPad) rather than drifting toward
      // a now-stale, no-longer-correct position.
      if (this.requireElement("more-menu").classList.contains("open")) this.positionMoreMenu();
    };
    window.addEventListener("resize", handleResize);
    handleResize();
  }

  private bindControls(): void {
    this.requireElement("mode-brush-control").addEventListener("click", () => {
      this.toggleToolChooser("mode-chooser");
    });
    this.requireElement("color-control").addEventListener("click", () => {
      this.toggleToolChooser("color-chooser");
    });
    document.querySelectorAll<HTMLButtonElement>(".tool-choice").forEach((choice) => {
      choice.addEventListener("click", () => {
        const toolId = choice.dataset.tool ?? "";
        if (!isDrawingToolId(toolId)) return;
        this.applyToolSelection(toolId);
      });
    });
    document.querySelectorAll<HTMLButtonElement>(".cap-choice").forEach((choice) => {
      choice.addEventListener("click", () => {
        this.applySprayCapSelection(choice.dataset.cap ?? "new-york-fat", { closeChoosers: true });
      });
    });
    document.querySelectorAll<HTMLButtonElement>(".marker-choice").forEach((choice) => {
      choice.addEventListener("click", () => {
        const markerId = choice.dataset.marker as MarkerVariantId | undefined;
        if (!markerId) return;
        this.applyMarkerSelection(markerId, { closeChoosers: true });
      });
    });
    this.requireElement("open-brush-studio").addEventListener("click", () => {
      this.closeToolChoosers();
      this.brushStudio.open();
    });
    this.requireElement("brush-studio-close").addEventListener("click", () => this.brushStudio.close());
    this.requireElement("brush-studio-overlay").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) this.brushStudio.close();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (this.calibrationBench.isOpen()) this.calibrationBench.close();
      else if (this.brushStudio.isOpen()) this.brushStudio.close();
    });
    // Flair Behavior Spec V1 (build brief section 5/6): "F" cycles the
    // selected cap's own Flair mode off -> wall -> blackbook -> wild -> off.
    // A temporary desktop-only shortcut, matching the existing Alt+scroll
    // (Spray Angle) / Alt+drag (simulated distance) precedent — no toolbar
    // redesign. Ignored while typing in any text field, and a complete no-op
    // for every tool/cap that isn't `isFlairEligibleCap` (see `cycleActiveFlairMode`).
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() !== "f" || event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      this.cycleActiveFlairMode();
    });

    this.requireElement<HTMLSelectElement>("palette-select").addEventListener("change", (event) => {
      this.finishActiveStroke();
      this.colorPaletteState = selectColorPalette(
        this.colorPaletteState,
        (event.target as HTMLSelectElement).value as ColorPaletteId,
      );
      this.renderColorPalette();
    });
    this.requireElement<HTMLInputElement>("palette-search").addEventListener("input", () => {
      this.renderColorPalette();
    });

    this.requireElement("undo-stroke").addEventListener("click", () => this.undoLastStroke());
    this.requireElement("clear-strokes").addEventListener("click", () => this.clearAllStrokes());
    this.requireElement("scale-control").addEventListener("click", () => {
      this.toggleToolChooser("scale-chooser");
    });
    this.requireElement("scale-reset").addEventListener("click", () => {
      this.resetView();
      this.closeToolChoosers();
    });
    this.requireElement("settings-toggle").addEventListener("click", () => this.setSettings({ type: "toggle" }));
    this.requireElement("settings-close").addEventListener("click", () => this.setSettings({ type: "close" }));
    this.requireElement<HTMLSelectElement>("smoothing-level").addEventListener("change", (event) => {
      this.setSettings({ type: "smoothing", value: (event.target as HTMLSelectElement).value as SettingsState["smoothing"] });
      this.finishActiveStroke();
    });
    this.requireElement<HTMLInputElement>("drips-enabled").addEventListener("change", (event) => {
      this.setSettings({ type: "drips", value: (event.target as HTMLInputElement).checked });
      this.dripAccumulator.reset();
    });
    this.requireElement<HTMLSelectElement>("background-preset").addEventListener("change", (event) => {
      this.selectedBackground = getSprayBackground((event.target as HTMLSelectElement).value);
    });
    this.requireElement<HTMLSelectElement>("wall-environment").addEventListener("change", (event) => {
      this.wallEnvironmentMode = (event.target as HTMLSelectElement).value as WallEnvironmentMode;
      this.updateWallEnvironmentUi();
      if (this.wallEnvironmentMode === "image" && !this.wallEnvironmentImage) {
        this.requireElement<HTMLInputElement>("wall-image-file").click();
      }
    });
    this.requireElement<HTMLInputElement>("wall-solid-color").addEventListener("input", (event) => {
      this.wallEnvironmentColor = (event.target as HTMLInputElement).value;
    });
    this.requireElement<HTMLInputElement>("wall-image-file").addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void this.loadWallEnvironmentImage(file);
    });
    this.requireElement<HTMLInputElement>("tracking-debug-visible").addEventListener("change", (event) => {
      this.setSettings({ type: "tracking-debug", value: (event.target as HTMLInputElement).checked });
      this.updateTrackingVisibility();
    });
    this.requireElement<HTMLInputElement>("pencil-diagnostics-visible").addEventListener("change", (event) => {
      this.setSettings({ type: "pencil-diagnostics", value: (event.target as HTMLInputElement).checked });
    });

    this.requireElement("physical-input").addEventListener("click", () => void this.selectInputMode("mouse"));
    this.requireElement("hand-input").addEventListener("click", () => {
      void this.selectInputMode(this.inputMode === "spatial" ? "mouse" : "spatial");
    });

    this.requireElement<HTMLInputElement>("audio-file").addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) this.loadAudioFile(file);
    });
    this.requireElement("player-play-pause").addEventListener("click", () => void this.togglePlayback());
    this.requireElement<HTMLInputElement>("player-progress").addEventListener("input", (event) => {
      if (!this.audioElement || !this.player.duration) return;
      const ratio = Number.parseInt((event.target as HTMLInputElement).value, 10) / 1000;
      this.audioElement.currentTime = ratio * this.player.duration;
      this.setPlayer({ type: "seek", currentTime: this.audioElement.currentTime });
    });
    this.requireElement("player-loop").addEventListener("click", () => this.toggleLoop());

    this.requireElement("toggle-record").addEventListener("click", () => {
      void this.toggleRecording();
      this.closeToolChoosers();
    });
    this.requireElement("more-toggle").addEventListener("click", () => {
      this.toggleToolChooser("more-menu");
    });
    this.requireElement("shake-can").addEventListener("click", () => void this.playCanRattle());
    this.requireElement("clear-canvas").addEventListener("click", () => this.clearAllStrokes());
  }

  private bindPhysicalInput(): void {
    this.compositeCanvas.addEventListener("pointerenter", (event) => {
      if (this.inputMode !== "mouse") return;
      this.physicalCursorVisible = true;
      this.updateDrawingCursor(this.pointerScreenPoint(event), true);
    });
    this.compositeCanvas.addEventListener("pointerleave", () => {
      if (this.inputMode !== "mouse" || this.isDrawing) return;
      this.physicalCursorVisible = false;
      this.refreshDrawingCursor();
    });
    this.compositeCanvas.addEventListener("pointerdown", (event) => {
      const screenPoint = this.pointerScreenPoint(event);
      this.lastScreenPoint = screenPoint;
      if (shouldPanPointer(this.panInteraction.spaceHeld, event.button)) {
        event.preventDefault();
        this.beginPan(event.pointerId, screenPoint, event.button);
        return;
      }
      if (this.inputMode !== "mouse" || event.button !== 0) return;
      this.physicalCursorVisible = true;
      this.updateDrawingCursor(screenPoint, true);
      this.closeToolChoosers();
      if (this.settings.isOpen) this.setSettings({ type: "close" });
      this.strokeManager.reset();
      this.strokeSmoother.reset();
      this.curveReconstructor.reset();
      this.dripAccumulator.reset();
      this.simulatedDistanceDragLastY = null;
      this.lastRawPointerSample = null;
      // Flair Stroke Envelope Stabilization build brief, section 1 — THE
      // FIX: every new stroke's Flair state is explicitly reset here, at
      // pointerdown, BEFORE the first point is ever deposited. See
      // `resetActiveFlairForNewStroke`'s own doc for the full root-
      // cause explanation of why this couldn't just happen lazily on first
      // Alt-drag sample the way it used to.
      this.resetActiveFlairForNewStroke();
      this.activeWallPoint = screenToWall(this.wallView, screenPoint);
      this.lastDepositTimestamp = 0;
      this.setDrawingActive(true);
      this.depositActivePoint(performance.now());
    });
    window.addEventListener("pointermove", (event) => {
      const screenPoint = this.pointerScreenPoint(event);
      this.lastScreenPoint = screenPoint;
      // Section C of the Pencil Prep build brief: raw diagnostic capture,
      // always on (cheap — only DOM writes when the panel is toggled
      // visible, see `updatePencilDiagnosticsUi`), independent of drawing
      // state so values are visible on hover too, and independent of any
      // Flair/mapping decision below.
      const pointerSample = normalizePointerSample(event, this.lastRawPointerSample);
      this.lastRawPointerSample = pointerSample;
      this.updatePencilDiagnosticsUi(pointerSample);
      const authority = this.synchronizeInteractionAuthority(this.currentDrawingIntent());
      if (authority.panGestureActive && event.pointerId === this.panPointerId && this.lastPanScreen) {
        event.preventDefault();
        this.wallView = applyPan(
          this.wallView,
          screenPoint.x - this.lastPanScreen.x,
          screenPoint.y - this.lastPanScreen.y,
        );
        this.lastPanScreen = screenPoint;
        this.replayStrokes(this.strokeHistory.snapshot());
        this.updateNavigationUi();
        return;
      }
      if (this.inputMode === "mouse" && (this.physicalCursorVisible || this.isDrawing)) {
        this.updateDrawingCursor(screenPoint, true);
      }
      if (this.inputMode === "mouse" && this.isDrawing) {
        if (event.altKey && this.toolSelection.selectedToolId === "spray-can") {
          // Temporary desktop Z-control (build brief section 4): Option/Alt
          // held + vertical mouse motion continuously simulates wall
          // distance while the spray stays active, evaluated through the
          // SAME unified deposition field as any other size — see
          // `adjustSimulatedSprayDistance`. Normal (non-Alt) pointer motion
          // is untouched and still drives X/Y below, unconditionally.
          if (this.simulatedDistanceDragLastY === null) {
            this.beginSimulatedDistanceDrag();
          } else {
            this.adjustSimulatedSprayDistance(screenPoint.y - this.simulatedDistanceDragLastY);
          }
          this.simulatedDistanceDragLastY = screenPoint.y;
        } else {
          this.simulatedDistanceDragLastY = null;
        }
        this.applyPencilTrackMarksMapping(pointerSample);
        this.activeWallPoint = screenToWall(this.wallView, screenPoint);
      }
    });
    window.addEventListener("pointerup", (event) => {
      if (event.pointerId === this.panPointerId) {
        this.endPan();
        return;
      }
      if (this.inputMode !== "mouse" || !this.isDrawing) return;
      this.depositActivePoint(performance.now(), true);
      this.setDrawingActive(false);
      this.resetStrokeInput();
    });
    window.addEventListener("pointercancel", (event) => {
      if (event.pointerId === this.panPointerId) this.cancelPan("pointercancel");
      if (this.inputMode === "mouse" && this.isDrawing) {
        this.setDrawingActive(false);
        this.resetStrokeInput();
      }
    });
    this.compositeCanvas.addEventListener("lostpointercapture", (event) => {
      if (event.pointerId === this.panPointerId) this.cancelPan("lostpointercapture");
    });
  }

  private pointerScreenPoint(event: Pick<MouseEvent, "clientX" | "clientY">): WallPoint {
    const bounds = this.compositeCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (this.compositeCanvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (this.compositeCanvas.height / bounds.height),
    };
  }

  private beginPan(pointerId: number, screenPoint: WallPoint, button: number): void {
    this.finishActiveStroke();
    this.closeToolChoosers();
    if (this.settings.isOpen) this.setSettings({ type: "close" });
    this.panInteraction = beginPanInteraction(this.panInteraction, button);
    this.panPointerId = pointerId;
    this.lastPanScreen = screenPoint;
    this.compositeCanvas.setPointerCapture(pointerId);
    document.body.classList.add("panning");
    this.refreshDrawingCursor();
  }

  private endPan(resumeHand = true): void {
    const pointerId = this.panPointerId;
    this.panInteraction = resetPanInteraction();
    this.panPointerId = null;
    this.lastPanScreen = null;
    if (pointerId !== null && this.compositeCanvas.hasPointerCapture(pointerId)) {
      this.compositeCanvas.releasePointerCapture(pointerId);
    }
    document.body.classList.remove("panning");
    if (resumeHand) this.resumeHandAfterPan();
    this.refreshDrawingCursor();
  }

  private cancelPan(reason: PanCancellationReason, resumeHand = true): void {
    const pointerId = this.panPointerId;
    const wasNavigationActive = this.panInteraction.spaceHeld
      || this.panInteraction.source !== null
      || pointerId !== null;
    this.panInteraction = cancelPanInteraction(this.panInteraction, reason);
    this.panPointerId = null;
    this.lastPanScreen = null;
    if (pointerId !== null && this.compositeCanvas.hasPointerCapture(pointerId)) {
      this.compositeCanvas.releasePointerCapture(pointerId);
    }
    document.body.classList.remove("panning", "pan-ready");
    if (resumeHand && wasNavigationActive) this.resumeHandAfterPan();
    this.refreshDrawingCursor();
  }

  private setPanModifier(active: boolean): void {
    if (active && !this.panInteraction.spaceHeld) this.finishActiveStroke();
    if (!active) {
      this.cancelPan("space-keyup");
      return;
    }
    this.panInteraction = setSpacePanHeld(this.panInteraction, active);
    this.synchronizeInteractionAuthority(this.currentDrawingIntent());
  }

  private currentDrawingIntent(): boolean {
    return this.inputMode === "spatial" ? Boolean(this.lastHandResult?.isPinching) : this.isDrawing;
  }

  private synchronizeInteractionAuthority(drawingIntent: boolean): InteractionAuthority<DrawingToolId> {
    const pointerId = this.panPointerId;
    const authority = resolveInteractionAuthority({
      activeDrawingTool: this.toolSelection.selectedToolId,
      drawingIntent,
      panInteraction: this.panInteraction,
      panPointerActive: pointerId !== null,
    });
    if (authority.normalized) {
      console.info("[Spatial Spraypaint] Stale Pan authority normalized; Spray paint and audio restored");
      this.panInteraction = authority.normalizedPan;
      this.panPointerId = null;
      this.lastPanScreen = null;
      if (pointerId !== null && this.compositeCanvas.hasPointerCapture(pointerId)) {
        this.compositeCanvas.releasePointerCapture(pointerId);
      }
    }
    document.body.classList.toggle("panning", authority.panVisualActive);
    document.body.classList.remove("pan-ready");
    return authority;
  }

  private bindCommandSystem(): void {
    window.addEventListener("keydown", (event) => this.commandRegistry.handleKeyboardEvent(event));
    window.addEventListener("keyup", (event) => this.commandRegistry.handleKeyUpEvent(event));
    window.addEventListener("blur", () => this.cancelPan("window-blur", false));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.cancelPan("visibilitychange", false);
    });
    this.compositeCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      // Temporary desktop control for live Spray Angle adjustment while
      // drawing (build brief section 4) — Alt held, spray tool active.
      // Deliberately does not touch pan/zoom/stroke state below.
      if (event.altKey && this.toolSelection.selectedToolId === "spray-can") {
        this.adjustSprayAngle(event.deltaY);
        return;
      }
      this.finishActiveStroke();
      this.cancelPan("wheel", false);
      if (isWheelZoomGesture(event)) {
        this.wallView = resolveWheelZoom(
          this.wallView,
          event,
          this.pointerScreenPoint(event),
          this.compositeCanvas.height,
        );
        this.quickZoomRestore = null;
      } else {
        const delta = resolveWheelPan(event, this.compositeCanvas.height);
        this.wallView = applyPan(this.wallView, delta.x, delta.y);
      }
      this.replayStrokes(this.strokeHistory.snapshot());
      this.updateNavigationUi();
      this.resumeHandAfterPan();
    }, { passive: false });
  }

  private resumeHandAfterPan(): void {
    const sampleAgeMs = this.lastHandResult ? performance.now() - this.lastHandResult.timestamp : Number.POSITIVE_INFINITY;
    const authority = this.synchronizeInteractionAuthority(Boolean(this.lastHandResult?.isPinching));
    if (!shouldResumeHandDrawingAfterPan({
      isHandMode: this.inputMode === "spatial",
      isPinching: Boolean(this.lastHandResult?.isPinching),
      sampleAgeMs,
      panGestureActive: authority.panGestureActive,
    }) || !this.lastHandResult) return;
    const screenPoint = {
      x: this.lastHandResult.x * this.compositeCanvas.width,
      y: this.lastHandResult.y * this.compositeCanvas.height,
    };
    this.activeWallPoint = screenToWall(this.wallView, screenPoint);
    this.lastPinchingAt = this.lastHandResult.timestamp;
    this.setDrawingActive(authority.drawingAllowed && authority.materialFeedbackAllowed);
    this.updatePaintAuthorityDiagnostics(authority, true);
    this.updateTrackingOverlay(this.lastHandResult);
  }

  private navigationAnchor(): WallPoint {
    return this.lastScreenPoint ?? {
      x: this.compositeCanvas.width / 2,
      y: this.compositeCanvas.height / 2,
    };
  }

  private zoomBy(factor: number): void {
    this.setZoomLevel(this.wallView.zoom * factor);
  }

  private setZoomLevel(zoom: number): void {
    this.finishActiveStroke();
    this.wallView = applyZoomAroundPoint(this.wallView, zoom, this.navigationAnchor());
    this.quickZoomRestore = null;
    this.replayStrokes(this.strokeHistory.snapshot());
    this.updateNavigationUi();
  }

  private quickZoom(): void {
    this.finishActiveStroke();
    const next = toggleQuickZoom(
      { view: this.wallView, restoreView: this.quickZoomRestore },
      this.navigationAnchor(),
    );
    this.wallView = next.view;
    this.quickZoomRestore = next.restoreView;
    this.replayStrokes(this.strokeHistory.snapshot());
    this.updateNavigationUi();
  }

  private resetView(): void {
    this.finishActiveStroke();
    this.wallView = resetWallView();
    this.quickZoomRestore = null;
    this.replayStrokes(this.strokeHistory.snapshot());
    this.updateNavigationUi();
  }

  private updateNavigationUi(): void {
    const control = this.requireElement<HTMLButtonElement>("scale-control");
    const percentage = formatZoomPercentage(this.wallView);
    control.textContent = percentage;
    control.setAttribute("aria-label", `Choose wall scale. Current scale ${percentage}`);
    control.setAttribute("title", `Wall scale ${percentage} · click for presets · 0 resets view`);
    control.classList.toggle("quick", this.quickZoomRestore !== null);
    this.renderZoomStepper();
    const island = this.requireElement("navigation-island");
    island.dataset.zoom = this.wallView.zoom.toString();
    island.dataset.panX = this.wallView.panX.toString();
    island.dataset.panY = this.wallView.panY.toString();
    island.dataset.quickZoom = (this.quickZoomRestore !== null).toString();
    this.refreshDrawingCursor();
  }

  private renderZoomStepper(): void {
    const stepper = this.requireElement("zoom-stepper");
    const { steps, currentSlotIndex } = resolveZoomStepWindow(this.wallView.zoom);
    stepper.innerHTML = "";
    [...steps].reverse().forEach((step, reversedIndex) => {
      const index = steps.length - 1 - reversedIndex;
      const isCurrent = index === currentSlotIndex;
      const percentage = Math.round(step * 100);
      const mark = document.createElement("button");
      mark.type = "button";
      mark.className = isCurrent ? "zoom-mark current" : "zoom-mark";
      mark.setAttribute("role", "option");
      mark.setAttribute("aria-selected", isCurrent.toString());
      mark.setAttribute("aria-label", `${percentage}%`);
      mark.title = `${percentage}%`;
      const label = document.createElement("span");
      label.className = "zoom-mark-label";
      label.textContent = isCurrent ? formatZoomPercentage(this.wallView) : `${percentage}%`;
      mark.append(label);
      if (!isCurrent) {
        mark.addEventListener("click", () => {
          this.setZoomLevel(step);
          this.closeToolChoosers();
        });
      }
      stepper.append(mark);
    });
  }

  private renderShortcutReference(): void {
    const list = this.requireElement("shortcut-list");
    for (const command of this.commandRegistry.list()) {
      const row = document.createElement("div");
      row.className = "shortcut-row";
      const shortcut = document.createElement("kbd");
      shortcut.textContent = command.shortcut;
      const description = document.createElement("span");
      description.textContent = `${command.label} — ${command.description}`;
      row.append(shortcut, description);
      list.append(row);
    }
  }

  private toggleToolChooser(
    id: "mode-chooser" | "color-chooser" | "more-menu" | "scale-chooser",
  ): void {
    const target = this.requireElement(id);
    const shouldOpen = !target.classList.contains("open");
    this.closeToolChoosers();
    if (shouldOpen && this.settings.isOpen) this.setSettings({ type: "close" });
    target.classList.toggle("open", shouldOpen);
    if (id === "scale-chooser") {
      this.requireElement("scale-control").setAttribute("aria-expanded", shouldOpen.toString());
    } else if (id === "mode-chooser") {
      this.requireElement("mode-brush-control").setAttribute("aria-expanded", shouldOpen.toString());
    } else if (id === "more-menu") {
      this.requireElement("more-toggle").setAttribute("aria-expanded", shouldOpen.toString());
      if (shouldOpen) this.positionMoreMenu();
    }
  }

  /**
   * Anchors `#more-menu` to the live on-screen position of the `...`
   * (`#more-toggle`) button, rather than the shared `.tool-popover`
   * centered-over-the-bottom-bar placement every other popover still uses.
   * `#more-toggle` sits at the trailing (right) end of the bottom bar, so
   * the default anchor is above-and-right-aligned with it (opening upward,
   * its right edge flush with the button's right edge) -- attached to the
   * control, never centered or mid-screen.
   *
   * Viewport-bounds checks then flip that anchor only if it would actually
   * overflow: right-aligned would push the menu off the LEFT edge on a
   * narrow/iPad-portrait layout -> flips to left-aligned (anchored to the
   * button's own left edge instead); opening upward would push the menu off
   * the TOP edge -> flips to opening downward, below the button. Both
   * checks are independent, so either or both can flip depending on actual
   * menu size and viewport — never assumed once and hard-coded.
   */
  private positionMoreMenu(): void {
    const menu = this.requireElement<HTMLDivElement>("more-menu");
    const button = this.requireElement("more-toggle");
    const gap = 10;
    const edgeMargin = 8;
    const buttonRect = button.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    // Horizontal: default right-aligned to the button's own right edge.
    let right = window.innerWidth - buttonRect.right;
    let left = window.innerWidth - right - menuWidth;
    if (left < edgeMargin) {
      // Right-aligned would overflow the left edge -- flip to left-aligned
      // on the button's own left edge instead.
      left = buttonRect.left;
      right = window.innerWidth - left - menuWidth;
    }

    // Vertical: default opens upward, its bottom edge `gap` above the button.
    let bottom = window.innerHeight - buttonRect.top + gap;
    let top = window.innerHeight - bottom - menuHeight;
    if (top < edgeMargin) {
      // Opening upward would overflow the top edge -- flip to opening
      // downward, below the button, instead.
      top = buttonRect.bottom + gap;
      bottom = window.innerHeight - top - menuHeight;
    }

    menu.style.left = `${Math.max(edgeMargin, left)}px`;
    menu.style.right = "auto";
    menu.style.top = `${Math.max(edgeMargin, top)}px`;
    menu.style.bottom = "auto";
  }

  private closeToolChoosers(): void {
    this.requireElement("mode-chooser").classList.remove("open");
    this.requireElement("color-chooser").classList.remove("open");
    this.requireElement("more-menu").classList.remove("open");
    this.requireElement("scale-chooser").classList.remove("open");
    this.requireElement("mode-brush-control").setAttribute("aria-expanded", "false");
    this.requireElement("more-toggle").setAttribute("aria-expanded", "false");
    this.requireElement("scale-control").setAttribute("aria-expanded", "false");
  }

  private setSettings(action: SettingsAction): void {
    this.settings = reduceSettingsState(this.settings, action);
    if (this.settings.isOpen) this.closeToolChoosers();
    this.updateSettingsUi();
  }

  private updateSettingsUi(): void {
    const panel = this.requireElement("settings-panel");
    panel.classList.toggle("open", this.settings.isOpen);
    panel.setAttribute("aria-hidden", (!this.settings.isOpen).toString());
    const toggle = this.requireElement("settings-toggle");
    toggle.setAttribute("aria-pressed", this.settings.isOpen.toString());
    toggle.setAttribute("aria-label", this.settings.isOpen ? "Close settings" : "Open settings");
    this.requireElement<HTMLSelectElement>("smoothing-level").value = this.settings.smoothing;
    this.requireElement<HTMLInputElement>("drips-enabled").checked = this.settings.dripsEnabled;
    this.requireElement<HTMLInputElement>("tracking-debug-visible").checked = this.settings.trackingDebugVisible;
    this.requireElement<HTMLInputElement>("pencil-diagnostics-visible").checked = this.settings.pencilDiagnosticsVisible;
    this.requireElement("pencil-diagnostics-panel").classList.toggle("visible", this.settings.pencilDiagnosticsVisible);
    this.updateWallEnvironmentUi();
    this.updateRadiusUi();
    this.updateTrackingVisibility();
  }

  /**
   * Section C of the build brief: a temporary/diagnostic-only readout of
   * ACTUAL `PointerEvent` values — never a guess at device support. Updated
   * on every pointermove regardless of drawing state (so the values are
   * visible just by moving a Pencil near the canvas, even before touching
   * down), but only writes to the DOM while the panel is toggled visible.
   */
  private updatePencilDiagnosticsUi(sample: NormalizedPointerSample): void {
    if (!this.settings.pencilDiagnosticsVisible) return;
    this.requireElement("pencil-diagnostics-type").textContent = sample.pointerType.toUpperCase();
    this.requireElement("pencil-diagnostics-pressure").textContent = sample.pressure.toFixed(2);
    this.requireElement("pencil-diagnostics-tilt").textContent = `${Math.round(sample.tiltX)}° / ${Math.round(sample.tiltY)}°`;
    this.requireElement("pencil-diagnostics-twist").textContent = `${Math.round(sample.twist)}°`;
    this.requireElement("pencil-diagnostics-velocity").textContent = sample.velocity.toFixed(3);
    this.requireElement("pencil-diagnostics-coalesced").textContent = String(sample.coalescedCount);
  }

  /**
   * V0.10.2 Marker + Spray Control Reduction: the normal panel no longer has
   * a Size slider of its own (Size/Coverage/Fill overrides moved to Brush
   * Studio entirely). `this.baseRadius` still has to stay in sync with the
   * cap's EFFECTIVE size — default, or a Brush Studio override — since it's
   * still what every actual paint/physics computation reads; this is now
   * the only place that keeps it current, replacing the removed slider's
   * own `input` handler.
   */
  private updateRadiusUi(): void {
    const spraySelected = this.toolSelection.selectedToolId === "spray-can";
    if (spraySelected) {
      this.baseRadius = this.effectiveSprayStyle(this.toolSelection.sprayCapId).size;
    }
    this.updateCoverageUi();
    this.refreshDrawingCursor();
  }

  private updateCoverageUi(): void {
    this.updateSprayAngleUi();
    this.updateCustomizedBadge();
  }

  /**
   * V0.10 UI Reset, "Live state": the primary toolbar chip's badge is no
   * longer coverage-only -- it now lights up whenever ANY setting that
   * materially changes the next stroke differs from the selected brush's
   * own defaults (size, coverage, fill mode, spray angle, or an active
   * Flair mode), so a customized brush can never silently paint differently
   * than what the UI implies. Session-only overrides live in Brush Studio
   * (advanced/calibration), but their EFFECT must always surface here.
   */
  private updateCustomizedBadge(): void {
    const badge = this.requireElement("coverage-badge");
    if (this.toolSelection.selectedToolId !== "spray-can") {
      badge.hidden = true;
      return;
    }
    const capId = this.toolSelection.sprayCapId;
    const override = this.sprayOverrideFor(capId);
    const flairActive = isFlairEligibleCap(capId) && this.activeFlairMode !== "off";
    const customized = override.size !== undefined
      || override.coverage !== undefined
      || override.fillMode !== undefined
      || override.sprayAngle !== undefined
      || flairActive;
    badge.hidden = !customized;
    if (!customized) return;
    const coveragePercent = Math.round(this.effectiveSprayStyle(capId).coverage * 100);
    badge.textContent = flairActive ? "Flair" : override.coverage !== undefined ? `${coveragePercent}%` : "Custom";
  }

  /**
   * Compact status readout for the live Alt+wheel Spray Angle shortcut —
   * quiet by default (Creative Interface Doctrine: normal state stays
   * visually quiet), shown only once the angle has actually been moved off
   * its 0/straight-on default. See `adjustSprayAngle` and Brush Studio's own
   * "Spray Angle" row for the same underlying per-brush override.
   */
  private updateSprayAngleUi(): void {
    const spraySelected = this.toolSelection.selectedToolId === "spray-can";
    const angle = spraySelected ? Math.round(this.effectiveSprayStyle(this.toolSelection.sprayCapId).sprayAngle) : 0;
    this.requireElement("spray-angle-status").toggleAttribute("hidden", !spraySelected || angle <= 0);
    this.requireElement("spray-angle-val").textContent = `${angle}°`;
    this.updateFlairStatusUi();
  }

  /** Alt+wheel over the wall: the temporary desktop shortcut for live Spray Angle adjustment while drawing (see build brief section 4). Reuses the same per-brush spray-property override Brush Studio's "Spray Angle" slider writes to — one underlying state, two ways to reach it. */
  private adjustSprayAngle(deltaY: number): void {
    if (this.toolSelection.selectedToolId !== "spray-can") return;
    const capId = this.toolSelection.sprayCapId;
    const current = this.effectiveSprayStyle(capId).sprayAngle;
    const step = deltaY > 0 ? -3 : 3;
    const next = Math.max(0, Math.min(PLUME_MAX_ANGLE_DEGREES, current + step));
    this.setSettings({ type: "spray-property", capId, patch: { sprayAngle: next } });
    this.updateSprayAngleUi();
  }

  /**
   * Option/Alt + vertical mouse drag: the temporary desktop shortcut for
   * live simulated wall-distance adjustment while the spray stays active
   * (Pink Dot Flare V1 build brief). Reuses the exact same per-brush "size"
   * override the `#brush-radius` slider and `radius-reset` already write to
   * — one underlying state, now three ways to reach it — so the live change
   * flows through the SAME `sprayDistance = width / baseRadius` path every
   * other size change already does; no separate flare renderer or distance
   * model. Moving the mouse DOWN simulates pulling back from the wall
   * (larger footprint); moving UP simulates pushing in closer (smaller
   * footprint). Time/dwell never reaches this — only real vertical screen
   * movement does.
   */
  /**
   * Pencil Mapping V1 (Pencil Prep build brief, section E) — Track Marks
   * ONLY, exactly like every other Flair sandbox mechanism in this file.
   * Reuses two EXISTING generic per-brush override channels rather than
   * inventing rendering: pressure -> `coverage` (already a generic 0-1
   * deposition control), tilt -> `sprayAngle` (already a generic per-brush
   * property). `distance`/`baseRadius` are never touched here — Flair's own
   * distance dial stays fully independent, per the brief's explicit "do not
   * map pressure to distance." A no-op for a mouse (`isPencil === false`)
   * or any cap other than Track Marks, so Pink Dot's own `sprayAngle`
   * (its plume-flare control) can never be moved by Pencil input.
   */
  private applyPencilTrackMarksMapping(sample: NormalizedPointerSample): void {
    if (!sample.isPencil) return;
    if (this.toolSelection.selectedToolId !== "spray-can" || this.toolSelection.sprayCapId !== "track-marks") return;
    const capId = this.toolSelection.sprayCapId;
    const coverage = resolvePencilCoverage(sample.pressure);
    const sprayAngle = resolvePencilSprayAngle(sample.tiltX, sample.tiltY, PLUME_MAX_ANGLE_DEGREES);
    this.setSettings({ type: "spray-property", capId, patch: { coverage, sprayAngle } });
  }

  /**
   * Called once, right as a fresh Alt-held drag GESTURE begins (the very
   * first Alt-held pointermove within an already-active stroke, before any
   * delta has been applied — see the pointermove listener above). This is
   * NOT the stroke-start fix (see `resetActiveFlairForNewStroke`,
   * called at `pointerdown` instead) — it only keeps a drag that begins
   * PARTWAY THROUGH an already-reset stroke continuous with whatever size
   * the stroke is already at, by inverse-mapping the CURRENT absolute size
   * back to a `distance01` ("no sudden jumps," build brief section 5). No-op
   * for every cap except an `isFlairEligibleCap` cap with an active
   * (non-off) Flair mode.
   */
  private beginSimulatedDistanceDrag(): void {
    if (this.toolSelection.selectedToolId !== "spray-can") return;
    if (!isFlairEligibleCap(this.toolSelection.sprayCapId) || this.activeFlairMode === "off") return;
    const params = this.effectiveFlairParams(this.activeFlairMode);
    this.activeFlairDistance01 = inverseEffectiveFlairDistance(this.activeFlairMode, params, this.baseRadius);
  }

  /** MODE DEFAULT merged with Brush Studio's SESSION MODIFICATION (see `FlairProperties.ts`) for the selected cap's Flair, at the given mode. Always the same `getFlairOverride`/`resolveEffectiveFlairParams` pair Brush Studio itself reads, so live painting and the Studio preview can never disagree. `capBaseRadius` is always the CAP'S OWN preset default (never the live/overridden size) — see `FlairProperties.ts`'s own doc for why that distinction is load-bearing. */
  private effectiveFlairParams(mode: FlairModeId): EffectiveFlairParams {
    const capId = this.toolSelection.sprayCapId;
    const capBaseRadius = getSprayCapPreset(capId).baseRadius;
    return resolveEffectiveFlairParams(mode, capId, capBaseRadius, getFlairOverride(this.settings.flairOverrides, capId, mode));
  }

  private adjustSimulatedSprayDistance(deltaScreenY: number): void {
    if (this.toolSelection.selectedToolId !== "spray-can") return;
    const capId = this.toolSelection.sprayCapId;
    // Real Spray Pass build brief (accessible-cap move): ONLY an
    // `isFlairEligibleCap` cap (Pink Dot Fat, New York Fat — the real,
    // user-reachable caps), and ONLY once its own Flair mode is something
    // other than `off`, is routed through the curve-driven path below.
    // Every ineligible cap keeps this exact prior linear
    // `current + delta*SENSITIVITY` mapping, byte-for-byte, regardless of
    // `surfaceContext`/`activeFlairMode`, since those fields are never
    // read on this branch.
    if (isFlairEligibleCap(capId) && this.activeFlairMode !== "off") {
      this.adjustActiveFlairDistance(deltaScreenY);
      return;
    }
    const current = this.effectiveSprayStyle(capId).size;
    const next = Math.max(4, Math.min(72, current + deltaScreenY * SIMULATED_DISTANCE_DRAG_SENSITIVITY));
    if (next === current) return;
    this.baseRadius = next;
    this.setSettings({ type: "spray-property", capId, patch: { size: next } });
    this.updateRadiusUi();
  }

  /**
   * The selected `isFlairEligibleCap` cap's own Flair-driven distance
   * control — the "safe creative sandbox" runtime proof (build brief
   * section 4), now on the real accessible cap path (Pink Dot Fat, New
   * York Fat), never Track Marks (no longer wired — see
   * `isFlairEligibleCap`'s own doc for why). Still the SAME Alt+drag
   * gesture and the SAME underlying `size` override every other cap's Z
   * control writes to (`adjustSimulatedSprayDistance` above); only how a
   * drag delta maps to the resolved size differs, via `FLAIR_CURVES`
   * (`FlairCurves.ts`) instead of the flat linear formula. Two effects:
   *
   * 1. `activeFlairDistance01` — a persistent normalized 0-1 "depth
   *    dial" — is nudged by the drag delta scaled by the active mode's
   *    `distanceSensitivity`, then EASED toward that target by the mode's
   *    own `transitionSmoothing` rate rather than jumping straight to it —
   *    this is what makes wall feel slower/smoother and blackbook/wild feel
   *    quicker, with no sudden jumps and no discontinuity mid-drag (the
   *    smoothing runs every pointermove sample, not once per mode switch).
   * 2. The eased distance is run through `resolveFlairModulation` once:
   *    `width01` is denormalized into an absolute wall-unit size (still
   *    flowing through the exact same `baseRadius` -> `createPoint` pipeline
   *    every cap already uses — no new renderer), and the resolved `output`
   *    multiplier is cached for `depositReconstructedPath` to apply via
   *    `applyFlairOutputToPoint` (see there) — Flair transforms canonical
   *    output, it never invents a new cap's geometry; each eligible cap
   *    keeps rendering through its OWN cap identity.
   */
  private adjustActiveFlairDistance(deltaScreenY: number): void {
    const capId = this.toolSelection.sprayCapId;
    const params = this.effectiveFlairParams(this.activeFlairMode);
    const rawStep = (deltaScreenY / FLAIR_DRAG_RANGE_PX) * params.flairAmount;
    const target = Math.max(0, Math.min(1, this.activeFlairDistance01 + rawStep));
    this.activeFlairDistance01 += (target - this.activeFlairDistance01) * params.flairSmoothing;
    const modulation = resolveFlairModulationWithParams(this.activeFlairMode, params, {
      distance01: this.activeFlairDistance01,
      output: 1,
      velocity: 0,
      angle: 0,
    });
    const next = resolveFlairSize(modulation.width01, params);
    this.baseRadius = next;
    this.activeFlairOutputMultiplier = modulation.output;
    this.activeFlairBloom01 = modulation.bloom01;
    this.setSettings({ type: "spray-property", capId, patch: { size: next } });
    this.updateRadiusUi();
    this.updateFlairStatusUi();
  }

  /**
   * The small keyboard shortcut (section 5/6 of the Flair Behavior Spec V1
   * brief) cycling the selected cap's own Flair mode off -> wall ->
   * blackbook -> wild -> off — a secondary accelerator now that Brush
   * Studio's own Mode selector (section 8 of the Brush Studio Flair
   * Controls brief) is the primary way to change it. No-op for every
   * ineligible cap (see `isFlairEligibleCap`).
   */
  private cycleActiveFlairMode(): void {
    if (this.toolSelection.selectedToolId !== "spray-can" || !isFlairEligibleCap(this.toolSelection.sprayCapId)) return;
    const index = FLAIR_MODE_CYCLE.indexOf(this.activeFlairMode);
    this.setActiveFlairMode(FLAIR_MODE_CYCLE[(index + 1) % FLAIR_MODE_CYCLE.length]);
  }

  /**
   * Sets the selected cap's active Flair mode directly — shared by the
   * keyboard cycle above and Brush Studio's Mode selector. A deliberate
   * mode switch re-initializes to that mode's own explicit start position
   * (section 2/6 of the Flair Stroke Envelope Stabilization build brief —
   * see `applyActiveFlairStartSize`), for the same reason a fresh stroke
   * does: each mode has its own `[flairMinSize, flairMaxSize]` envelope, so
   * carrying over the previous mode's absolute distance01 verbatim could
   * leave the new mode already pinned at its own ceiling before the user
   * ever drags again.
   */
  private setActiveFlairMode(mode: FlairModeId): void {
    if (this.toolSelection.selectedToolId !== "spray-can" || !isFlairEligibleCap(this.toolSelection.sprayCapId)) return;
    this.activeFlairMode = mode;
    this.applyActiveFlairStartSize(mode);
    this.updateFlairStatusUi();
  }

  /**
   * Flair Stroke Envelope Stabilization build brief, section 1 — THE FIX.
   *
   * Root cause of the reported bug: `this.baseRadius` (the live resolved
   * size fed into every deposited point, see `depositReconstructedPath`) and
   * `activeFlairDistance01` (the internal depth dial) were both plain
   * persistent instance fields with no reset boundary at `pointerdown` — the
   * ONLY place either was ever re-seeded was lazily, on the FIRST Alt-drag
   * sample of a gesture (`beginSimulatedDistanceDrag`), and only the dial,
   * not `baseRadius` itself. A stroke that painted without immediately
   * Alt-dragging (or a stroke begun anywhere after a previous stroke had
   * changed the size) therefore started painting at whatever `baseRadius`
   * the PREVIOUS stroke happened to leave behind — an implicit, silent
   * "continue-from-last" behavior no policy ever chose.
   *
   * The fix: an explicit stroke-start policy (`FLAIR_STROKE_START_POLICY`,
   * `FlairCurves.ts` — `"reset-to-start"` in this pass, per the brief's own
   * "for now, default to reset-to-start") applied HERE, unconditionally, at
   * the top of every `pointerdown` for an `isFlairEligibleCap` cap with an
   * active Flair mode — not lazily on first drag. Every new stroke now
   * resolves its own starting `distance01` fresh from
   * `params.flairStartPosition` (min/center/max) via
   * `resolveFlairStartDistance`, and immediately writes the resulting size
   * to BOTH `this.baseRadius` and the generic `size` override — so even a
   * stroke that never touches Alt-drag still begins at the mode's own
   * explicit start size, never the previous stroke's terminal one. Shared
   * with `setActiveFlairMode` (a mode switch is the same "re-initialize the
   * envelope state" event, just triggered differently) via
   * `applyActiveFlairStartSize`.
   */
  private resetActiveFlairForNewStroke(): void {
    if (this.toolSelection.selectedToolId !== "spray-can" || !isFlairEligibleCap(this.toolSelection.sprayCapId)) return;
    if (this.activeFlairMode === "off") return;
    if (FLAIR_STROKE_START_POLICY !== "reset-to-start") return; // only value implemented this pass
    this.applyActiveFlairStartSize(this.activeFlairMode);
  }

  /** Shared by `setActiveFlairMode` and `resetActiveFlairForNewStroke` — resolves `mode`'s own start position (or, for `off`, just resets the internal dial/multiplier to neutral, since `off` never reads them) and writes it through the SAME `baseRadius`/`size`-override channel every other Flair size change already uses. */
  private applyActiveFlairStartSize(mode: FlairModeId): void {
    const capId = this.toolSelection.sprayCapId;
    if (mode === "off") {
      this.activeFlairDistance01 = 0.5;
      this.activeFlairOutputMultiplier = 1;
      this.activeFlairBloom01 = 0;
      return;
    }
    const params = this.effectiveFlairParams(mode);
    this.activeFlairDistance01 = resolveFlairStartDistance(mode, params);
    const modulation = resolveFlairModulationWithParams(mode, params, {
      distance01: this.activeFlairDistance01,
      output: 1,
      velocity: 0,
      angle: 0,
    });
    const next = resolveFlairSize(modulation.width01, params);
    this.baseRadius = next;
    this.activeFlairOutputMultiplier = modulation.output;
    this.activeFlairBloom01 = modulation.bloom01;
    this.setSettings({ type: "spray-property", capId, patch: { size: next } });
    this.updateRadiusUi();
  }

  /**
   * Compact status readout for the selected cap's live Flair mode — quiet
   * by default (Creative Interface Doctrine), shown only while an
   * `isFlairEligibleCap` cap is selected AND a non-off Flair mode is
   * active, mirroring `updateSprayAngleUi`'s exact existing pattern/markup.
   */
  private updateFlairStatusUi(): void {
    const flairCapSelected = this.toolSelection.selectedToolId === "spray-can" && isFlairEligibleCap(this.toolSelection.sprayCapId);
    const active = flairCapSelected && this.activeFlairMode !== "off";
    this.requireElement("flair-status").toggleAttribute("hidden", !active);
    if (active) this.requireElement("flair-status-val").textContent = this.activeFlairMode;
    this.updateCustomizedBadge();
  }

  /** PRESET DEFAULT -> SESSION/USER MODIFICATION -> EFFECTIVE VALUE for one Spray brush's Size/Coverage/Fill. */
  private sprayOverrideFor(capId: string) {
    return getSprayOverride(this.settings.sprayOverrides, capId);
  }

  private effectiveSprayStyle(capId: string) {
    return resolveEffectiveSprayStyle(getSprayCapPreset(capId), this.sprayOverrideFor(capId));
  }

  private selectedToolDefaultSize(): number {
    return this.toolSelection.selectedToolId === "spray-can"
      ? getSprayCapPreset(this.toolSelection.sprayCapId).baseRadius
      : this.markerWidths[this.toolSelection.markerVariantId];
  }

  /**
   * Shared selection path for Tool/Cap/Marker changes — driven by BOTH the
   * compact chooser and Brush Studio, so the two UIs can never drift apart.
   * `closeChoosers` is false from Brush Studio (switching brushes there must
   * not close the editor) and true from the compact popover (selecting a
   * brush there closes it so the user can paint).
   */
  private applyToolSelection(toolId: DrawingToolId, options: { closeChoosers?: boolean } = {}): void {
    this.finishActiveStroke();
    this.toolSelection = selectDrawingTool(this.toolSelection, toolId);
    this.baseRadius = toolId === "spray-can"
      ? this.effectiveSprayStyle(this.toolSelection.sprayCapId).size
      : this.markerWidths[this.toolSelection.markerVariantId];
    this.updateToolUi();
    this.updateRadiusUi();
    if (options.closeChoosers) this.closeToolChoosers();
    this.brushStudio.render();
  }

  private applySprayCapSelection(capId: string, options: { closeChoosers?: boolean } = {}): void {
    this.finishActiveStroke();
    const cap = getSprayCapPreset(capId);
    this.toolSelection = selectSprayCap(this.toolSelection, cap.id);
    this.baseRadius = this.effectiveSprayStyle(cap.id).size;
    this.updateToolUi();
    this.updateRadiusUi();
    if (options.closeChoosers) this.closeToolChoosers();
    this.brushStudio.render();
  }

  private applyMarkerSelection(markerId: MarkerVariantId, options: { closeChoosers?: boolean } = {}): void {
    const marker = getMarkerVariant(markerId);
    this.finishActiveStroke();
    this.toolSelection = selectMarkerVariant(this.toolSelection, marker.id);
    this.baseRadius = this.markerWidths[marker.id];
    this.updateToolUi();
    this.updateRadiusUi();
    if (options.closeChoosers) this.closeToolChoosers();
    this.brushStudio.render();
  }

  /**
   * V0.10.2: size is chosen through an actual visual sample of the nib/
   * footprint (`renderMarkerSizeSample`) at its real relative size and
   * shape, never an abstract XS/S/M/L/XL letter or a raw wall-unit number
   * -- the description words below exist only as the accessible name for
   * screen readers, never rendered as visible button text.
   */
  private readonly MARKER_SIZE_DESCRIPTIONS = ["Smallest", "Small", "Medium", "Large", "Largest"] as const;

  private renderMarkerWidthPresets(): void {
    const variantId = this.toolSelection.markerVariantId;
    const selectedWidth = this.markerWidths[variantId];
    const buttons = getMarkerWidthPresets(variantId).map((preset, index) => {
      const description = this.MARKER_SIZE_DESCRIPTIONS[index] ?? preset.label;
      const button = document.createElement("button");
      button.className = "marker-width-choice";
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext("2d");
      if (ctx) renderMarkerSizeSample(ctx, canvas.width, canvas.height, variantId, preset.width * 0.5);
      button.append(canvas);
      button.title = `${description} ${getMarkerVariant(variantId).name}`;
      button.setAttribute("aria-label", `${description} ${getMarkerVariant(variantId).name}`);
      button.setAttribute("aria-pressed", (preset.width === selectedWidth).toString());
      button.classList.toggle("selected", preset.width === selectedWidth);
      button.addEventListener("click", () => {
        this.finishActiveStroke();
        this.markerWidths = selectMarkerWidth(this.markerWidths, variantId, preset.width);
        this.baseRadius = preset.width;
        this.renderMarkerWidthPresets();
        this.updateRadiusUi();
      });
      return button;
    });
    this.requireElement("marker-width-presets").replaceChildren(...buttons);
  }

  private renderColorPalette(): void {
    const palette = getColorPalette(this.colorPaletteState.paletteId);
    const search = this.requireElement<HTMLInputElement>("palette-search").value.trim().toLocaleLowerCase();
    const paletteSelect = this.requireElement<HTMLSelectElement>("palette-select");
    paletteSelect.replaceChildren(...COLOR_PALETTES.map((candidate) => {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name;
      option.selected = candidate.id === palette.id;
      return option;
    }));
    const renderSwatch = (color: string, name: string, code: string | null = null) => {
      const swatch = document.createElement("button");
      swatch.className = "swatch";
      swatch.dataset.color = color;
      swatch.dataset.name = name;
      if (code) swatch.dataset.code = code;
      swatch.style.background = color;
      swatch.title = name;
      swatch.setAttribute("aria-label", name);
      const selected = this.colorPaletteState.selectedSwatchName
        ? name === this.colorPaletteState.selectedSwatchName
        : color.toLowerCase() === this.selectedColor.toLowerCase();
      swatch.classList.toggle("selected", selected);
      swatch.addEventListener("click", () => this.chooseColor(color, name, code));
      return swatch;
    };
    const visibleColors = search
      ? palette.colors.filter(({ name, code }) => `${name} ${code ?? ""}`.toLocaleLowerCase().includes(search))
      : palette.colors;
    this.requireElement("palette-swatches").replaceChildren(
      ...visibleColors.map(({ hex, name, code }) => renderSwatch(hex, name, code)),
    );
    const recent = this.requireElement("recent-colors");
    recent.replaceChildren(...this.colorPaletteState.recentColors.map((color) =>
      renderSwatch(color, `Recent ${color}`)));
    recent.toggleAttribute("hidden", this.colorPaletteState.recentColors.length === 0);
    this.requireElement("recent-colors-label").toggleAttribute(
      "hidden",
      this.colorPaletteState.recentColors.length === 0,
    );
    this.requireElement("palette-current").style.setProperty("--current-color", this.selectedColor);
    const selectedName = this.colorPaletteState.selectedSwatchName;
    const selectedCode = this.colorPaletteState.selectedSwatchCode;
    const selectedLabel = selectedName
      ? selectedCode && !selectedName.startsWith(selectedCode)
        ? `${selectedCode} · ${selectedName}`
        : selectedName
      : `Custom ${this.selectedColor}`;
    this.requireElement("palette-selection").textContent = selectedLabel;
    const colorControl = this.requireElement("color-control");
    colorControl.style.setProperty("--current-color", this.selectedColor);
    colorControl.setAttribute("title", `Color ${this.selectedColor} · ${palette.name}`);
    colorControl.setAttribute("aria-label", `Choose color. Current ${this.selectedColor} from ${palette.name}`);
  }

  private chooseColor(color: string, name: string, code: string | null = null): void {
    this.finishActiveStroke();
    this.colorPaletteState = selectPaletteColor(this.colorPaletteState, color, { name, code });
    this.renderColorPalette();
    this.requireElement("color-control").setAttribute("title", `Color: ${name}`);
    this.refreshDrawingCursor();
    this.closeToolChoosers();
  }

  private currentToolStyle(): ToolStrokeStyle {
    const sprayStyle = this.effectiveSprayStyle(this.toolSelection.sprayCapId);
    const shared = {
      color: this.selectedColor,
      size: this.baseRadius,
      coverage: sprayStyle.coverage,
      fillMode: sprayStyle.fillMode,
      sprayAngle: sprayStyle.sprayAngle,
    };
    return this.toolSelection.selectedToolId === "spray-can"
      ? { ...shared, toolId: "spray-can", variantId: this.toolSelection.sprayCapId }
      : { ...shared, toolId: "paint-marker", variantId: this.toolSelection.markerVariantId };
  }

  private updateToolUi(): void {
    const tool = getDrawingTool(this.toolSelection.selectedToolId);
    const presentation = resolveDrawingToolPresentation(
      this.toolSelection,
      (id) => getSprayCapPreset(id).name,
      // V0.10 UI Reset, "Markers": the live state label must match the
      // 3 consolidated identities the picker itself shows (Round Marker /
      // Chisel Marker / Mop) -- never the internal variant's own name
      // (e.g. "Mop · Balanced"), which would surface exactly the
      // Classic/Clean/Wet/Balanced/Drippy terminology this pass removed
      // from the picker, just through a different label instead.
      (id) => this.markerDisplayName(id),
    );
    const modeBrushControl = this.requireElement<HTMLButtonElement>("mode-brush-control");
    modeBrushControl.dataset.tool = tool.id;
    modeBrushControl.setAttribute(
      "aria-label",
      `Choose mode and brush. Current ${tool.name}, ${presentation.variantName}`,
    );
    modeBrushControl.setAttribute("title", `${tool.name} · ${presentation.variantName}`);
    modeBrushControl.querySelector(".mode-label")!.textContent =
      tool.id === "spray-can" ? "Spray" : "Marker";
    this.requireElement("brush-label").textContent = presentation.variantName;
    this.requireElement("cap-chooser").hidden = tool.id !== "spray-can";
    this.requireElement("marker-chooser").hidden = tool.id !== "paint-marker";
    document.querySelectorAll<HTMLButtonElement>(".tool-choice").forEach((choice) => {
      const selected = choice.dataset.tool === tool.id;
      choice.classList.toggle("selected", selected);
      choice.setAttribute("aria-pressed", selected.toString());
    });
    document.querySelectorAll<HTMLButtonElement>(".cap-choice").forEach((choice) => {
      const selected = choice.dataset.cap === this.toolSelection.sprayCapId;
      choice.classList.toggle("selected", selected);
      choice.setAttribute("aria-pressed", selected.toString());
    });
    document.querySelectorAll<HTMLButtonElement>(".marker-choice").forEach((choice) => {
      const selected = choice.dataset.marker === this.toolSelection.markerVariantId;
      choice.classList.toggle("selected", selected);
      choice.setAttribute("aria-pressed", selected.toString());
    });
    this.renderMarkerWidthPresets();
    this.updateRadiusUi();
    const rattle = this.requireElement<HTMLButtonElement>("shake-can");
    rattle.disabled = tool.id !== "spray-can";
    this.requireElement("tool-feedback-label").textContent = tool.name;
    this.requireElement("hand-first-use-cue").textContent = `Pinch thumb + index finger to use ${tool.name}`;
    this.requireElement("tracking-delivery-label").textContent = `7 · ${tool.name} delivery`;
    this.refreshDrawingCursor();
  }

  /** The 3 consolidated marker identities the picker exposes (Round Marker / Chisel Marker / Mop) -- see `updateToolUi`'s own doc for why this, not the internal variant's raw name, is what the live-state label shows. */
  private markerDisplayName(id: MarkerVariantId): string {
    const family = markerFamilyFor(id);
    if (family === "round") return "Round Marker";
    if (family === "chisel") return "Chisel Marker";
    return "Mop";
  }

  private async selectInputMode(mode: InputSourceMode): Promise<void> {
    this.finishActiveStroke();
    this.cancelPan("mode-switch", false);
    this.inputMode = mode;
    this.lastHandResult = null;
    this.activeWallPoint = null;
    this.physicalCursorVisible = false;
    this.drawingCursorAim = { point: null, angle: 0 };
    this.updateDrawingCursor(null, false);
    this.updateTrackingOverlay(null);
    this.updateInputModeUi(mode === "spatial" ? "STARTING…" : "READY");

    if (mode === "mouse") {
      if (this.webcamActive) await this.handTracker.stop();
      this.webcamActive = false;
      this.updateInputModeUi("READY");
      this.updateTrackingVisibility();
      return;
    }

    if (this.webcamActive) {
      this.updateInputModeUi("CAMERA ON");
      return;
    }

    const handButton = this.requireElement<HTMLButtonElement>("hand-input");
    handButton.disabled = true;
    try {
      this.resetTrackingDiagnostics();
      await this.sprayCanAudio.unlock();
      await this.handTracker.initialize(
        (result) => this.handleHandTrackingResult(result),
        (diagnostics) => this.handleHandTrackingDiagnostics(diagnostics),
      );
      await this.handTracker.start();
      this.webcamActive = true;
      this.updateInputModeUi("CAMERA ON");
    } catch {
      this.webcamActive = false;
      this.updateInputModeUi("RETRY CAMERA", true);
    } finally {
      handButton.disabled = false;
      this.updateTrackingVisibility();
    }
  }

  private updateInputModeUi(status: string, error = false): void {
    const physical = this.requireElement("physical-input");
    const hand = this.requireElement("hand-input");
    const isHand = this.inputMode === "spatial";
    physical.classList.toggle("selected", !isHand);
    hand.classList.toggle("selected", isHand);
    physical.setAttribute("aria-pressed", (!isHand).toString());
    hand.setAttribute("aria-pressed", isHand.toString());
    const statusElement = this.requireElement("input-status");
    statusElement.textContent = status;
    statusElement.classList.toggle("on", status === "CAMERA ON");
    statusElement.classList.toggle("error", error);
  }

  private updateWallEnvironmentUi(): void {
    this.requireElement<HTMLSelectElement>("wall-environment").value = this.wallEnvironmentMode;
    this.requireElement<HTMLInputElement>("wall-solid-color").value = this.wallEnvironmentColor;
    this.requireElement("wall-surface-row").toggleAttribute("hidden", this.wallEnvironmentMode !== "wall");
    this.requireElement("wall-solid-row").toggleAttribute("hidden", this.wallEnvironmentMode !== "solid");
    this.requireElement("wall-image-row").toggleAttribute("hidden", this.wallEnvironmentMode !== "image");
  }

  private async loadWallEnvironmentImage(file: File): Promise<void> {
    const image = new Image();
    const url = URL.createObjectURL(file);
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The selected background image could not be decoded."));
        image.src = url;
      });
      if (this.wallEnvironmentImageUrl) URL.revokeObjectURL(this.wallEnvironmentImageUrl);
      this.wallEnvironmentImageUrl = url;
      this.wallEnvironmentImage = image;
      this.wallEnvironmentMode = "image";
      this.updateWallEnvironmentUi();
      const error = this.requireElement("wall-environment-error");
      error.textContent = "";
      error.classList.remove("visible");
    } catch (loadError) {
      URL.revokeObjectURL(url);
      this.wallEnvironmentMode = "wall";
      this.updateWallEnvironmentUi();
      const error = this.requireElement("wall-environment-error");
      error.textContent = loadError instanceof Error ? loadError.message : "The background image could not load.";
      error.classList.add("visible");
    }
  }

  private handleHandTrackingResult(result: HandTrackingResult | null): void {
    if (this.inputMode !== "spatial") return;
    if (!result) {
      const authority = this.synchronizeInteractionAuthority(Boolean(this.lastHandResult?.isPinching));
      const bridgeMissingSample = shouldBridgeMissingHandSample({
        wasPinching: Boolean(this.lastHandResult?.isPinching),
        lastPinchingAt: this.lastPinchingAt,
        now: performance.now(),
        navigationActive: authority.panGestureActive,
      });
      this.activeWallPoint = null;
      this.updatePaintAuthorityDiagnostics(authority, Boolean(this.lastHandResult?.isPinching));
      this.updateTrackingOverlay(null);
      if (bridgeMissingSample) return;
      this.lastHandResult = null;
      this.setDrawingActive(false);
      this.resetStrokeInput(false);
      return;
    }
    this.lastHandResult = result;
    const authority = this.synchronizeInteractionAuthority(result.isPinching);

    const screenPoint = {
      x: result.x * this.compositeCanvas.width,
      y: result.y * this.compositeCanvas.height,
    };
    this.lastScreenPoint = screenPoint;
    const wallPoint = screenToWall(this.wallView, screenPoint);
    this.activeWallPoint = wallPoint;
    const deliveryInterval = this.lastDeliveredAt ? result.timestamp - this.lastDeliveredAt : null;
    const deliveryDistance = this.lastDeliveredWallPoint
      ? Math.hypot(wallPoint.x - this.lastDeliveredWallPoint.x, wallPoint.y - this.lastDeliveredWallPoint.y)
      : null;
    const deliveryDetail = deliveryInterval === null || deliveryDistance === null
      ? "FIRST POINT"
      : `Δ${Math.round(deliveryDistance)}u / ${Math.round(deliveryInterval)}ms`;
    this.setTrackingStage("mapping", "pass", `${Math.round(wallPoint.x)}, ${Math.round(wallPoint.y)} · ${deliveryDetail}`);
    this.lastDeliveredWallPoint = wallPoint;
    this.lastDeliveredAt = result.timestamp;
    if (!this.mappedPointLogged) {
      this.mappedPointLogged = true;
      console.info(`[Spatial Spraypaint] Fingertip mapped to wall (${Math.round(wallPoint.x)}, ${Math.round(wallPoint.y)})`);
    }

    if (result.isPinching) this.lastPinchingAt = result.timestamp;
    this.setDrawingActive(authority.drawingAllowed && authority.materialFeedbackAllowed);
    this.updatePaintAuthorityDiagnostics(authority, result.isPinching);
    this.updateTrackingOverlay(result);
    if (authority.drawingAllowed) {
      this.setTrackingStage("mark", "pass", "POINT RECEIVED");
      if (!this.markDeliveryLogged) {
        this.markDeliveryLogged = true;
        console.info(`[Spatial Spraypaint] ${getDrawingTool(this.toolSelection.selectedToolId).name} received tracked point`);
      }
    } else {
      if (authority.drawingSuppressed) this.setTrackingStage("mark", "active", "SUPPRESSED · PAN ACTIVE");
      this.resetStrokeInput(false);
    }
  }

  private handleHandTrackingDiagnostics(diagnostics: HandTrackingDiagnostics): void {
    const cadence = (value: number | null) => value === null ? "—" : `${Math.round(value)}ms`;
    this.setTrackingStage("library", diagnostics.libraryLoaded ? "pass" : "waiting", diagnostics.libraryLoaded ? "LOADED" : "WAITING");
    this.setTrackingStage("frames", diagnostics.videoFramesReceived > 0 ? "pass" : "waiting", diagnostics.videoFramesReceived > 0 ? `${diagnostics.videoFramesReceived} · ${cadence(diagnostics.reliability.frameIntervalMs)}` : "WAITING");
    this.setTrackingStage("callback", diagnostics.resultsCallbacks > 0 ? "pass" : "waiting", diagnostics.resultsCallbacks > 0 ? `${diagnostics.resultsCallbacks} · ${cadence(diagnostics.reliability.resultIntervalMs)}` : "WAITING");
    this.setTrackingStage(
      "landmarks",
      diagnostics.landmarksDetected ? "pass" : "waiting",
      diagnostics.landmarksDetected
        ? `Δ${cadence(diagnostics.reliability.landmarkIntervalMs)} · MISS ${diagnostics.reliability.missingHandFrames}/${diagnostics.reliability.consecutiveMissingHandFrames} · PINCH ${diagnostics.reliability.pinchTransitions}`
        : "WAITING",
    );
    this.trackingQuality = diagnostics.cameraStarted && !diagnostics.error
      ? this.trackingQualityMonitor.update({
        confidence: this.lastHandResult?.confidence ?? null,
        resultIntervalMs: diagnostics.reliability.resultIntervalMs,
        landmarkIntervalMs: diagnostics.reliability.landmarkIntervalMs,
        consecutiveMissingHandFrames: diagnostics.reliability.consecutiveMissingHandFrames,
        pinchTransitions: diagnostics.reliability.pinchTransitions,
        cameraLuminance: this.cameraLuminance,
      }, performance.now())
      : this.trackingQualityMonitor.reset();
    this.updateTrackingQualityUi();

    const status = diagnostics.error ? "TRACKER ERROR" : diagnostics.cameraStarted ? "CAMERA ON" : diagnostics.trackerInitialized ? "TRACKER READY" : diagnostics.libraryLoaded ? "LOADING MODEL" : "CAMERA OFF";
    this.updateInputModeUi(status, Boolean(diagnostics.error));
    this.requireElement("tracking-debug-runtime").textContent = status;

    const errorElement = this.requireElement("tracking-error");
    errorElement.textContent = diagnostics.error ?? "";
    errorElement.classList.toggle("visible", Boolean(diagnostics.error));
    if (diagnostics.error) {
      this.settings = reduceSettingsState(this.settings, { type: "tracking-debug", value: true });
      this.settings = reduceSettingsState(this.settings, { type: "open" });
      this.updateSettingsUi();
    }
  }

  private updateTrackingOverlay(result: HandTrackingResult | null): void {
    const detected = Boolean(result);
    if (result) {
      this.updateDrawingCursor({
        x: result.aimX * this.compositeCanvas.width,
        y: result.aimY * this.compositeCanvas.height,
      }, true);
    } else if (this.inputMode === "spatial") {
      this.updateDrawingCursor(null, false);
    }
    const handStatus = this.requireElement("hand-detection-status");
    handStatus.textContent = detected ? "HAND DETECTED" : "NO HAND";
    handStatus.classList.toggle("detected", detected);
    this.requireElement("tracking-confidence").textContent = result ? `${(result.confidence * 100).toFixed(1)}%` : "—";
    this.requireElement("pinch-distance").textContent = result ? result.pinchDist.toFixed(3) : "—";
    const pinch = this.requireElement("pinch-state");
    pinch.textContent = result?.isPinching ? "ACTIVE" : "OPEN";
    pinch.classList.toggle("active", Boolean(result?.isPinching));
    this.requireElement("hand-first-use-cue").classList.toggle("visible", detected && !this.hasPinchDrawn);
    this.setTrackingStage("pinch", result?.isPinching ? "active" : result ? "pass" : "waiting", result?.isPinching ? "ACTIVE" : result ? "OPEN" : "WAITING");
  }

  private updateDrawingCursor(point: WallPoint | null, visible: boolean): void {
    const cursor = this.requireElement("drawing-cursor");
    if (point) this.drawingCursorAim = resolveDrawingCursorAim(this.drawingCursorAim, point);
    const aimPoint = point ?? this.drawingCursorAim.point;
    const shouldShow = visible && Boolean(aimPoint) && !this.panInteraction.source;
    cursor.classList.toggle("visible", shouldShow);
    cursor.classList.toggle("active", this.isDrawing);
    cursor.classList.toggle("pinching", this.inputMode === "spatial" && Boolean(this.lastHandResult?.isPinching));
    if (!aimPoint) return;

    const geometry = resolveDrawingCursorGeometry(
      this.currentToolStyle(),
      this.wallView.zoom,
      this.drawingCursorAim.angle,
    );
    cursor.style.left = `${aimPoint.x}px`;
    cursor.style.top = `${aimPoint.y}px`;
    cursor.style.width = `${geometry.width}px`;
    cursor.style.height = `${geometry.height}px`;
    cursor.style.setProperty("--drawing-cursor-angle", `${geometry.angle}rad`);
    cursor.style.setProperty("--drawing-cursor-color", this.selectedColor);
    cursor.dataset.shape = geometry.shape;
    cursor.dataset.tool = geometry.toolId;
    cursor.dataset.variant = geometry.variantId;
  }

  private refreshDrawingCursor(): void {
    if (this.panInteraction.source) {
      this.updateDrawingCursor(null, false);
      return;
    }
    if (this.inputMode === "spatial") {
      const hand = this.lastHandResult;
      this.updateDrawingCursor(hand ? {
        x: hand.aimX * this.compositeCanvas.width,
        y: hand.aimY * this.compositeCanvas.height,
      } : null, Boolean(hand));
      return;
    }
    this.updateDrawingCursor(this.drawingCursorAim.point, this.physicalCursorVisible || this.isDrawing);
  }

  private updatePaintAuthorityDiagnostics(
    authority: InteractionAuthority<DrawingToolId>,
    drawingIntent: boolean,
  ): void {
    const value = authority.panGestureActive
      ? `BLOCKED · PAN ${authority.navigationOwner?.toUpperCase() ?? "ACTIVE"}`
      : drawingIntent
        ? "MARK + FEEDBACK ALLOWED"
        : "READY";
    this.setTrackingStage(
      "authority",
      authority.panGestureActive ? "active" : drawingIntent ? "pass" : "waiting",
      value,
    );
  }

  private updateTrackingVisibility(): void {
    this.requireElement("tracking-overlay").classList.toggle("visible", this.inputMode === "spatial");
    this.requireElement("tracking-debug-panel").classList.toggle("visible", this.inputMode === "spatial" && this.settings.trackingDebugVisible);
    this.updateTrackingQualityUi();
  }

  private updateTrackingQualityUi(): void {
    const quality = this.requireElement("tracking-quality");
    quality.textContent = this.trackingQuality.quality.toUpperCase();
    quality.dataset.quality = this.trackingQuality.quality;
    const evidence = this.requireElement("tracking-quality-evidence");
    evidence.textContent = this.trackingQuality.evidence.length > 0
      ? this.trackingQuality.evidence.join(" · ")
      : "HEALTHY CADENCE";
    this.requireElement("tracking-luminance").textContent = this.cameraLuminance === null
      ? "—"
      : `${Math.round(this.cameraLuminance * 100)}%`;
    this.requireElement("tracking-quality-warning").classList.toggle(
      "visible",
      this.inputMode === "spatial" && this.trackingQuality.warningVisible,
    );
  }

  private setTrackingStage(stage: string, state: string, value: string): void {
    const row = document.querySelector<HTMLElement>(`[data-tracking-stage="${stage}"]`);
    if (!row) return;
    row.dataset.state = state;
    const valueElement = row.querySelector<HTMLElement>(".tracking-stage-value");
    if (valueElement) valueElement.textContent = value;
  }

  private resetTrackingDiagnostics(): void {
    this.mappedPointLogged = false;
    this.markDeliveryLogged = false;
    this.lastHandResult = null;
    this.lastPinchingAt = 0;
    this.lastDeliveredWallPoint = null;
    this.lastDeliveredAt = 0;
    this.cameraLuminance = null;
    this.cameraLuminanceSampler.reset();
    this.trackingQuality = this.trackingQualityMonitor.reset();
    this.updateTrackingOverlay(null);
    this.updateTrackingQualityUi();
    for (const stage of ["library", "frames", "callback", "landmarks", "mapping", "pinch", "mark", "authority"]) {
      this.setTrackingStage(stage, "waiting", "WAITING");
    }
    const errorElement = this.requireElement("tracking-error");
    errorElement.textContent = "";
    errorElement.classList.remove("visible");
  }

  private setDrawingActive(active: boolean): void {
    if (this.isDrawing === active) return;
    if (active && !resolveSelectedToolForInput(this.toolSelection, this.inputMode)) return;
    if (!active) this.flushReconstructedPath();
    this.isDrawing = active;
    if (active) {
      const style = this.currentToolStyle();
      const strokeId = this.strokeHistory.begin({ ...style, inputSource: this.inputMode });
      this.activeStrokeStyle = style;
      this.activeStrokeRandom = createStrokeRandom(strokeId);
      this.toolRenderer.beginStroke(style);
      if (style.toolId === "paint-marker" && isWetMarkerVariant(style.variantId)) {
        this.wetPaintAccumulator.beginStroke(strokeId, style.variantId, this.wetPaintControls);
      }
    } else {
      this.strokeHistory.finalize();
      this.withWallPaintTransform(() => this.toolRenderer.endStroke(this.paintCtx));
      this.wetPaintAccumulator.reset();
      this.activeStrokeRandom = null;
      this.updateUndoControl();
    }
    const feedbackToolId = this.activeStrokeStyle?.toolId ?? this.toolSelection.selectedToolId;
    const feedback = resolveToolFeedback(feedbackToolId, active);
    if (!active) this.activeStrokeStyle = null;
    const audioStatus = this.requireElement("spray-audio-status");
    audioStatus.textContent = feedback.materialState.toUpperCase();
    audioStatus.classList.toggle("on", active);
    void this.sprayCanAudio.setSpraying(feedback.sprayHissActive).catch((error) => {
      console.error("[Spatial Spraypaint] Spray audio failed", error);
      audioStatus.textContent = "AUDIO ERROR";
      audioStatus.classList.add("error");
    });
    this.refreshDrawingCursor();
  }

  private finishActiveStroke(): void {
    if (this.isDrawing) this.setDrawingActive(false);
    this.resetStrokeInput();
  }

  private resetStrokeInput(clearActivePoint = true): void {
    this.strokeManager.reset();
    this.strokeSmoother.reset();
    this.curveReconstructor.reset();
    this.dripAccumulator.reset();
    this.wetPaintAccumulator.reset();
    this.simulatedDistanceDragLastY = null;
    if (clearActivePoint) this.activeWallPoint = null;
  }

  private depositActivePoint(now: number, force = false): void {
    const authority = this.synchronizeInteractionAuthority(this.isDrawing);
    if (
      !this.isDrawing
      || !this.activeWallPoint
      || !authority.drawingAllowed
      || (!force && now - this.lastDepositTimestamp < MIN_DEPOSIT_INTERVAL_MS)
    ) return;
    this.lastDepositTimestamp = now;
    const smoothed = this.strokeSmoother.smooth(this.activeWallPoint, this.settings.smoothing);
    const reconstructed = this.curveReconstructor.push(
      { ...smoothed, timestamp: now },
      this.currentCurveOptions(),
    );
    const point = this.depositReconstructedPath(reconstructed);
    if (this.inputMode === "spatial" && !this.hasPinchDrawn) {
      this.hasPinchDrawn = true;
      this.requireElement("hand-first-use-cue").classList.remove("visible");
    }
    if (this.activeStrokeStyle?.toolId === "spray-can") {
      const activeSprayPreset = getSprayCapPreset(this.activeStrokeStyle.variantId);
      const drip = this.dripAccumulator.observe({
        x: point?.x ?? smoothed.x,
        y: point?.y ?? smoothed.y,
        radius: point?.width ?? this.baseRadius,
        timestamp: now,
        dripTendency: this.toolRenderer.dripTendency(this.activeStrokeStyle),
        enabled: this.settings.dripsEnabled,
        // Pink Dot Fat's stochastic deposition field lays down real paint
        // much more thinly than the drip system's old flat opacity formula
        // assumed (see DripLogic's own DripObservation.sourceOpacityCeiling
        // doc) — a drip must not read as MORE opaque than the paint region
        // that produced it. `coreOpacity` is the cap's own ceiling on how
        // dense one exposure of its core actually is; every other cap is
        // unaffected (this stays undefined for them, preserving their
        // exact prior drip look).
        sourceOpacityCeiling: activeSprayPreset.plumeStochasticStationary ? activeSprayPreset.coreOpacity : undefined,
      });
      if (drip) {
        this.toolRenderer.startDrip(drip, this.activeStrokeStyle.color, now);
        this.strokeHistory.appendDrip(drip);
      }
    }
  }

  private advanceHandEdgeMotion(now: number, deltaMs: number): void {
    const hand = this.lastHandResult;
    const drawingActive = this.inputMode === "spatial"
      && this.isDrawing
      && Boolean(hand?.isPinching)
      && this.panPointerId === null
      && Boolean(hand && now - hand.timestamp <= HAND_EDGE_TRACKING_FRESH_MS);
    const motion = resolveHandEdgeMotion(this.handEdgeMotion, {
      hand: hand ? { x: hand.x, y: hand.y } : { x: 0.5, y: 0.5 },
      drawingActive,
      deltaMs,
    });
    this.handEdgeMotion = motion.state;
    if (motion.wallDelta.x === 0 && motion.wallDelta.y === 0) return;

    this.wallView = applyPan(this.wallView, motion.wallDelta.x, motion.wallDelta.y);
    if (hand) {
      this.activeWallPoint = screenToWall(this.wallView, {
        x: hand.x * this.compositeCanvas.width,
        y: hand.y * this.compositeCanvas.height,
      });
    }
    this.replayStrokes(this.strokeHistory.renderSnapshot());
    this.updateNavigationUi();
  }

  private flushReconstructedPath(): void {
    const remaining = this.curveReconstructor.finish(this.currentCurveOptions());
    this.depositReconstructedPath(remaining);
  }

  private currentCurveOptions(): CurveReconstructionOptions {
    const style = this.activeStrokeStyle;
    if (!style || style.toolId !== "paint-marker") return { baseRadius: this.baseRadius };
    const cornerAngleDegrees = resolveMarkerCurveCornerAngle(style.variantId);
    return cornerAngleDegrees === undefined
      ? { baseRadius: this.baseRadius }
      : { baseRadius: this.baseRadius, cornerAngleDegrees };
  }

  private depositReconstructedPath(samples: CurveInputSample[]): StrokePoint | null {
    const style = this.activeStrokeStyle;
    if (!style) return null;
    let lastPoint: StrokePoint | null = null;
    this.withWallPaintTransform(() => {
      for (const sample of samples) {
        const { point, interpolated, previous } = this.strokeManager.createPoint(
          sample.x,
          sample.y,
          this.baseRadius,
          0,
          sample.timestamp,
        );
        let segmentStart = previous;
        // Flair Continuity fix: for every ineligible cap, or an eligible
        // cap (Pink Dot Fat, New York Fat) with Flair off, this is exactly
        // `[...interpolated, point]` (byte-identical values, see
        // `buildContinuousSegmentEnds`'s own doc). For an eligible cap with
        // active Flair, it REPLACES that batch with a much denser arclength
        // resample from the previous rendered point to this batch's true
        // target — the fix for the reported segmented/capsule regression
        // (see `FlairContinuity.ts`'s module
        // doc for the full root-cause analysis). `applyFlairOutputToPoint`
        // (output multiplier) is still applied first, same as before.
        const segmentEnds = buildContinuousSegmentEnds(
          segmentStart,
          [...interpolated, point],
          style.variantId,
          this.activeFlairMode,
          this.activeFlairOutputMultiplier,
          this.activeFlairBloom01,
        );
        for (const [segmentIndex, segmentEnd] of segmentEnds.entries()) {
          let renderedPoint = segmentEnd;
          if (style.toolId === "paint-marker" && isWetMarkerVariant(style.variantId)) {
            const wetPaint = this.wetPaintAccumulator.observe(
              segmentEnd,
              style.size,
              this.settings.dripsEnabled,
              segmentEnds[segmentIndex + 1] ?? null,
            );
            renderedPoint = { ...segmentEnd, paintLoad: wetPaint.paintLoad };
            for (const drip of wetPaint.drips) {
              this.toolRenderer.startDrip(drip, style.color, segmentEnd.timestamp);
              this.strokeHistory.appendDrip(drip);
            }
          }
          this.toolRenderer.renderSegment(
            this.paintCtx,
            segmentStart,
            renderedPoint,
            style,
            this.activeStrokeRandom ?? Math.random,
            this.activeFlairMode,
            this.activeFlairBloom01,
          );
          this.strokeHistory.appendPoint(renderedPoint);
          segmentStart = renderedPoint;
        }
        lastPoint = point;
      }
    });
    return lastPoint;
  }

  private undoLastStroke(): void {
    this.finishActiveStroke();
    if (!this.strokeHistory.canUndo()) return;
    const retainedStrokes = this.strokeHistory.undo();
    this.replayStrokes(retainedStrokes);
    this.updateUndoControl();
  }

  private replayStrokes(strokes: RecordedStroke[]): void {
    this.clearDrawingLayers();
    this.withWallLayerTransforms(() => {
      for (const [index, stroke] of strokes.entries()) {
        this.toolRenderer.beginStroke(stroke);
        const random = createStrokeRandom(stroke.id);
        let previous = null;
        for (const point of stroke.points) {
          this.toolRenderer.renderSegment(this.paintCtx, previous, point, stroke, random);
          previous = point;
        }
        for (const drip of stroke.drips) {
          this.toolRenderer.renderCompletedDrip(
            drip.renderAsOverlay ? this.wetDripCtx : this.paintCtx,
            drip,
            stroke.color,
          );
        }
        if (!this.isDrawing || index < strokes.length - 1) this.toolRenderer.endStroke(this.paintCtx);
      }
    });
  }

  private withWallPaintTransform(action: () => void): void {
    this.paintCtx.save();
    this.paintCtx.setTransform(
      this.wallView.zoom,
      0,
      0,
      this.wallView.zoom,
      this.wallView.panX,
      this.wallView.panY,
    );
    action();
    this.paintCtx.restore();
  }

  private withWallLayerTransforms(action: () => void): void {
    this.paintCtx.save();
    this.wetDripCtx.save();
    for (const context of [this.paintCtx, this.wetDripCtx]) {
      context.setTransform(
        this.wallView.zoom,
        0,
        0,
        this.wallView.zoom,
        this.wallView.panX,
        this.wallView.panY,
      );
    }
    action();
    this.wetDripCtx.restore();
    this.paintCtx.restore();
  }

  private renderWallBackground(): void {
    const composition = resolveWallComposition(
      this.wallEnvironmentMode,
      Boolean(this.wallEnvironmentImage),
    );
    this.compositeCtx.fillStyle = composition.environment === "solid"
      ? this.wallEnvironmentColor
      : this.selectedBackground.color;
    this.compositeCtx.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);

    const topLeft = screenToWall(this.wallView, { x: 0, y: 0 });
    const bottomRight = screenToWall(this.wallView, {
      x: this.compositeCanvas.width,
      y: this.compositeCanvas.height,
    });
    const spacing = 160;
    const minX = Math.floor(topLeft.x / spacing) * spacing;
    const maxX = Math.ceil(bottomRight.x / spacing) * spacing;
    const minY = Math.floor(topLeft.y / spacing) * spacing;
    const maxY = Math.ceil(bottomRight.y / spacing) * spacing;

    this.compositeCtx.save();
    this.compositeCtx.setTransform(
      this.wallView.zoom,
      0,
      0,
      this.wallView.zoom,
      this.wallView.panX,
      this.wallView.panY,
    );
    if (composition.environment === "image" && this.wallEnvironmentImage) {
      const tileWidth = Math.max(640, Math.min(1920, this.wallEnvironmentImage.naturalWidth));
      const tileHeight = tileWidth * (this.wallEnvironmentImage.naturalHeight / this.wallEnvironmentImage.naturalWidth);
      const firstTileX = Math.floor(topLeft.x / tileWidth) * tileWidth;
      const firstTileY = Math.floor(topLeft.y / tileHeight) * tileHeight;
      for (let y = firstTileY; y <= bottomRight.y; y += tileHeight) {
        for (let x = firstTileX; x <= bottomRight.x; x += tileWidth) {
          this.compositeCtx.drawImage(this.wallEnvironmentImage, x, y, tileWidth, tileHeight);
        }
      }
    }
    this.compositeCtx.strokeStyle = this.selectedBackground.id === "off-white"
      ? "rgba(20, 20, 24, 0.045)"
      : "rgba(255, 255, 255, 0.045)";
    this.compositeCtx.lineWidth = 1 / this.wallView.zoom;
    this.compositeCtx.beginPath();
    for (let x = minX; x <= maxX; x += spacing) {
      this.compositeCtx.moveTo(x, minY);
      this.compositeCtx.lineTo(x, maxY);
    }
    for (let y = minY; y <= maxY; y += spacing) {
      this.compositeCtx.moveTo(minX, y);
      this.compositeCtx.lineTo(maxX, y);
    }
    this.compositeCtx.stroke();
    this.compositeCtx.restore();
  }

  private updateUndoControl(): void {
    const button = this.requireElement<HTMLButtonElement>("undo-stroke");
    button.disabled = !this.strokeHistory.canUndo();
    button.textContent = "↶";
    button.setAttribute("title", this.strokeHistory.canUndo() ? `Undo last stroke · ${this.strokeHistory.size()} available · ⌘/Ctrl Z` : "Undo last stroke · ⌘/Ctrl Z");
    this.requireElement<HTMLButtonElement>("clear-strokes").disabled = this.strokeHistory.snapshot().length === 0;
  }

  private clearAllStrokes(): void {
    this.finishActiveStroke();
    if (!this.strokeHistory.clearUndoably()) return;
    this.clearDrawingLayers();
    this.updateUndoControl();
  }

  private clearDrawingLayers(): void {
    clearDrawingSurfaceState([
      { canvas: this.paintCanvas, context: this.paintCtx },
      { canvas: this.wetDripCanvas, context: this.wetDripCtx },
      { canvas: this.wetOverlayCanvas, context: this.wetOverlayCtx },
    ], this.toolRenderer);
  }

  private loadAudioFile(file: File): void {
    this.audioElement?.pause();
    if (this.audioObjectUrl) URL.revokeObjectURL(this.audioObjectUrl);
    this.audioObjectUrl = URL.createObjectURL(file);
    const audio = new Audio(this.audioObjectUrl);
    audio.loop = this.player.loop;
    this.audioElement = audio;
    this.sprayCanAudio.attachMusicElement(audio);
    this.setPlayer({ type: "load", trackName: file.name });
    audio.addEventListener("loadedmetadata", () => this.setPlayer({ type: "time", currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
    audio.addEventListener("timeupdate", () => this.setPlayer({ type: "time", currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
    audio.addEventListener("play", () => this.setPlayer({ type: "play" }));
    audio.addEventListener("pause", () => this.setPlayer({ type: "pause" }));
    audio.addEventListener("ended", () => this.setPlayer({ type: "ended" }));
    audio.addEventListener("error", () => {
      console.error("[Spatial Spraypaint] The selected audio track could not be played.");
      this.requireElement("player-track-name").textContent = "Track could not be played";
    });
  }

  private setPlayer(action: PlayerAction): void {
    this.player = reducePlayerState(this.player, action);
    this.updatePlayerUi();
  }

  private async togglePlayback(): Promise<void> {
    if (!this.audioElement) return;
    try {
      if (this.audioElement.paused) {
        await this.sprayCanAudio.unlock();
        await this.audioElement.play();
      } else {
        this.audioElement.pause();
      }
    } catch (error) {
      console.error("[Spatial Spraypaint] Session soundtrack playback failed", error);
    }
  }

  private toggleLoop(): void {
    this.setPlayer({ type: "toggle-loop" });
    if (this.audioElement) this.audioElement.loop = this.player.loop;
  }

  private updatePlayerUi(): void {
    this.requireElement("player-island").classList.toggle("empty", this.player.status === "empty");
    this.requireElement("player-track-name").textContent = this.player.trackName;
    const playButton = this.requireElement<HTMLButtonElement>("player-play-pause");
    playButton.disabled = this.player.status === "empty";
    playButton.textContent = this.player.status === "playing" ? "Ⅱ" : "▶";
    playButton.setAttribute("aria-label", this.player.status === "playing" ? "Pause soundtrack" : "Play soundtrack");
    const progress = this.requireElement<HTMLInputElement>("player-progress");
    progress.disabled = this.player.status === "empty" || this.player.duration <= 0;
    progress.value = this.player.duration > 0 ? Math.round((this.player.currentTime / this.player.duration) * 1000).toString() : "0";
    this.requireElement("player-time").textContent = `${this.formatTime(this.player.currentTime)} / ${this.formatTime(this.player.duration)}`;
    const loopButton = this.requireElement("player-loop");
    loopButton.setAttribute("aria-pressed", this.player.loop.toString());
    loopButton.textContent = "↻";
    loopButton.setAttribute("aria-label", this.player.loop ? "Disable soundtrack loop" : "Enable soundtrack loop");
  }

  private formatTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(safeSeconds / 60)}:${(safeSeconds % 60).toString().padStart(2, "0")}`;
  }

  private async playCanRattle(): Promise<void> {
    if (this.toolSelection.selectedToolId !== "spray-can") return;
    try {
      await this.sprayCanAudio.playRattle();
      const status = this.requireElement("spray-audio-status");
      status.textContent = "RATTLE";
      status.classList.add("on");
      window.setTimeout(() => {
        const feedback = resolveToolFeedback(this.toolSelection.selectedToolId, this.isDrawing);
        status.textContent = feedback.materialState.toUpperCase();
        status.classList.toggle("on", this.isDrawing);
      }, 480);
    } catch (error) {
      console.error("[Spatial Spraypaint] Can rattle audio failed", error);
    }
  }

  private async toggleRecording(): Promise<void> {
    const button = this.requireElement<HTMLButtonElement>("toggle-record");
    if (!this.recorder.getIsRecording()) {
      let audioStream: MediaStream | undefined;
      try {
        await this.sprayCanAudio.unlock();
        audioStream = this.sprayCanAudio.getRecordingStream();
      } catch (error) {
        console.error("[Spatial Spraypaint] Recording audio mix unavailable", error);
      }
      this.recorder.start(this.compositeCanvas, audioStream);
      console.info(`[Spatial Spraypaint] Recording started (${audioStream?.getAudioTracks().length ?? 0} mixed audio track)`);
      button.classList.add("recording");
      button.setAttribute("aria-label", "Stop and save recording");
      button.setAttribute("title", "Stop and save recording · R");
      return;
    }

    const blob = await this.recorder.stop();
    console.info(`[Spatial Spraypaint] Recording export ready (${blob.size} bytes, ${blob.type})`);
    button.classList.remove("recording");
    button.setAttribute("aria-label", "Start recording");
    button.setAttribute("title", "Record · R");
    this.downloadBlob(blob, `spatial-spraypaint-${Date.now()}.webm`);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private startRenderLoop(): void {
    const render = () => {
      const now = performance.now();
      const deltaMs = this.lastRenderTimestamp === 0 ? 0 : now - this.lastRenderTimestamp;
      this.lastRenderTimestamp = now;
      if (this.webcamActive && this.inputMode === "spatial") {
        this.cameraLuminance = this.cameraLuminanceSampler.sample(
          this.handTracker.getVideoElement(),
          now,
        );
      }
      this.advanceHandEdgeMotion(now, deltaMs);
      this.depositActivePoint(now);
      this.wetOverlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.wetOverlayCtx.clearRect(0, 0, this.wetOverlayCanvas.width, this.wetOverlayCanvas.height);
      this.wetOverlayCtx.save();
      this.wetOverlayCtx.setTransform(
        this.wallView.zoom,
        0,
        0,
        this.wallView.zoom,
        this.wallView.panX,
        this.wallView.panY,
      );
      this.withWallLayerTransforms(() => this.toolRenderer.advanceDrips(
        this.paintCtx,
        now,
        this.wetOverlayCtx,
        this.wetDripCtx,
      ));
      this.wetOverlayCtx.restore();
      this.compositeCtx.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
      this.renderWallBackground();
      this.compositeCtx.drawImage(this.wetDripCanvas, 0, 0);
      this.compositeCtx.drawImage(this.wetOverlayCanvas, 0, 0);
      this.compositeCtx.drawImage(this.paintCanvas, 0, 0);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
}

window.addEventListener("DOMContentLoaded", () => new SpatialSpraypaintApp());
