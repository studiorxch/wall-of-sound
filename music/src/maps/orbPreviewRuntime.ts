// ── orbPreviewRuntime ─────────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
//
// The Orb editor's live preview — a standalone, dark-neutral Three.js scene
// with slow rotation, NOT a Mapbox layer (per the approved mockup: "no route
// map, no unrelated controls"). Modeled directly on wallMapPreview.ts's
// _loadMapboxRuntime() lazy-loading pattern: dynamically injects the same
// pinned Three.js CDN script wall/index.html already uses, plus
// orbObjectFactory.js through the existing /wall-app proxy — the ONE shared
// archetype builder, never re-implemented here. Only the scene/camera/
// renderer setup below is preview-specific; archetype construction itself
// comes from the exact same factory the canonical LIVE MAP renderer uses.

import type { OrbProfile } from "../data/orbProfileTypes";

const THREE_VERSION = "0.160.0";

type ReadyState = "idle" | "loading" | "ready" | "unavailable";

type OrbInstance = {
  group: unknown;
  update: (elapsedSeconds: number) => void;
  refresh: (profile: OrbProfile) => void;
  dispose: () => void;
};

// Minimal shape of the THREE globals this file actually touches — avoids
// pulling in @types/three for a handful of dynamically-loaded calls.
type ThreeLike = {
  Scene: new () => { add: (o: unknown) => void; background: unknown; remove: (o: unknown) => void };
  Color: new (hex: number) => unknown;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => {
    position: { set: (x: number, y: number, z: number) => void };
    lookAt: (x: number, y: number, z: number) => void;
    aspect: number;
    updateProjectionMatrix: () => void;
  };
  WebGLRenderer: new (opts: Record<string, unknown>) => {
    setSize: (w: number, h: number) => void;
    setPixelRatio: (r: number) => void;
    render: (scene: unknown, camera: unknown) => void;
    dispose: () => void;
  };
};

let _state: ReadyState = "idle";
const _listeners: Array<(s: ReadyState) => void> = [];
function _setState(next: ReadyState) {
  _state = next;
  _listeners.slice().forEach((fn) => { try { fn(next); } catch { /* not this module's concern */ } });
}
export function getPreviewState(): ReadyState { return _state; }
export function subscribePreviewState(fn: (s: ReadyState) => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

function _injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

let _runtimeLoadPromise: Promise<boolean> | null = null;
async function _loadThreeRuntime(): Promise<boolean> {
  if (_runtimeLoadPromise) return _runtimeLoadPromise;
  _runtimeLoadPromise = (async () => {
    try {
      await _injectScript(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.min.js`);
      await _injectScript("/wall-app/systems/presentation/orbObjectFactory.js");
      return true;
    } catch {
      return false;
    }
  })();
  return _runtimeLoadPromise;
}

type MountHandle = {
  container: HTMLElement;
  renderer: InstanceType<ThreeLike["WebGLRenderer"]>;
  scene: InstanceType<ThreeLike["Scene"]>;
  camera: ReturnType<ThreeLike["PerspectiveCamera"] extends new (...args: infer _A) => infer R ? () => R : never>;
  canvas: HTMLCanvasElement;
  instance: OrbInstance | null;
  rafId: number;
  resizeObserver: ResizeObserver;
};

let _current: MountHandle | null = null;

function _disposeCurrent() {
  if (!_current) return;
  cancelAnimationFrame(_current.rafId);
  _current.resizeObserver.disconnect();
  _current.instance?.dispose();
  _current.renderer.dispose();
  if (_current.canvas.parentNode) _current.canvas.parentNode.removeChild(_current.canvas);
  _current = null;
}

// Mounts (or remounts, if the container changed) a live preview of `profile`
// into `container`. Structural profile changes should call this again;
// cosmetic-only edits should call updateOrbPreviewProfile instead.
export async function mountOrbPreview(container: HTMLElement, profile: OrbProfile): Promise<void> {
  _setState("loading");
  const ok = await _loadThreeRuntime();
  const THREE = (window as unknown as { THREE?: ThreeLike }).THREE;
  const factory = (window as unknown as { SBE?: { OrbObjectFactory?: { build: (p: OrbProfile, T: ThreeLike) => OrbInstance } } }).SBE?.OrbObjectFactory;
  if (!ok || !THREE || !factory) {
    _setState("unavailable");
    return;
  }

  _disposeCurrent();

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%; height:100%; display:block;";
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  const rect = container.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0d); // dark neutral, per the approved mockup

  const camera = new THREE.PerspectiveCamera(45, rect.width / Math.max(1, rect.height), 0.1, 100);
  camera.position.set(0, 0, 4.2);
  camera.lookAt(0, 0, 0);

  let instance: OrbInstance | null = null;
  try {
    instance = factory.build(profile, THREE);
    scene.add(instance.group);
  } catch {
    // A broken profile in the preview shows an empty dark scene rather than
    // throwing — the same "never crash, degrade honestly" principle as the
    // canonical renderer, just with no Hero Car fallback to hand off to here.
  }

  const resizeObserver = new ResizeObserver(() => {
    const r = container.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  const startedAt = performance.now();
  function frame() {
    if (instance) instance.update((performance.now() - startedAt) / 1000);
    renderer.render(scene, camera);
    handle.rafId = requestAnimationFrame(frame);
  }

  const handle: MountHandle = { container, renderer, scene, camera, canvas, instance, rafId: 0, resizeObserver };
  _current = handle;
  frame();
  _setState("ready");
}

// Cosmetic-only refresh (color/opacity/lighting/motion-speed edits) — no
// dispose/rebuild, mirrors orbProfileRenderer.js's refreshActive().
export function updateOrbPreviewProfile(profile: OrbProfile): void {
  if (_current?.instance) {
    try { _current.instance.refresh(profile); } catch { /* best-effort — a structural change should call mountOrbPreview again */ }
  }
}

export function unmountOrbPreview(): void {
  _disposeCurrent();
  _setState("idle");
}
