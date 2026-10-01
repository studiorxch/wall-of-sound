// ── Station structural 3D renderer — DOM lifecycle wrapper ─────────────────────
// STATION-14 (0918_WOS_Subway_First_Visual_3D_Station_Renderer_v1.0.0)
//
// The ONLY DOM/WebGL-touching part of STATION-14. Mounts the pure scene
// `buildStationStructure3DScene()` (stationStructure3DScene.ts) produces
// into a real `<canvas>` inside `container`, with one stable architectural
// inspection camera, restrained OrbitControls (orbit/zoom/pan only), and a
// clean dispose() lifecycle. This module owns no canonical identity, no
// persistence, and consumes ONLY StationStructuralProjection3D -- never
// StationGeometryData, a Bay Ridge seed, or an archetype id (see
// stationStructure3DScene.ts's own header for the full projection-only
// boundary; this file inherits it unchanged).
//
// No animation loop: OrbitControls (damping disabled) already fires a
// "change" event on every pointer-driven camera move, which is this
// module's only render trigger besides the initial frame and resize --
// a static scene with interaction-driven rendering, per this batch's own
// explicit instruction not to create a requestAnimationFrame loop that
// isn't needed.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildStationStructure3DScene, type StationStructure3DPickedSubject } from "./stationStructure3DScene";
import type { StationStructuralProjection3D } from "./stationStructuralProjection3D";

const COLOR_BACKGROUND = 0x0e0d0b;

export interface StationStructure3DRendererOptions {
  /** Called with the picked subject's own projection identity on click, or `null` on a miss. Never recreates STATION-10's truth resolver -- this is projection identity only. */
  readonly onSelect?: (subject: StationStructure3DPickedSubject | null) => void;
}

export interface StationStructure3DHandle {
  /** Removes the canvas, disposes all Three.js GPU resources, and removes every listener this module added. Safe to call once. */
  dispose(): void;
  /** Resets the camera to its original deterministic default view. */
  resetCamera(): void;
}

function findPickedSubjectAncestor(object: THREE.Object3D | null): StationStructure3DPickedSubject | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData && typeof current.userData.type === "string" && typeof current.userData.id === "string") {
      return current.userData as StationStructure3DPickedSubject;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Mounts a 3D structural scene for `projection` into `container`. Pure
 * DOM/WebGL side effects only -- builds its scene content entirely via
 * `buildStationStructure3DScene()`, never duplicating that logic here.
 */
export function renderStationStructure3D(
  container: HTMLElement,
  projection: StationStructuralProjection3D,
  options: StationStructure3DRendererOptions = {},
): StationStructure3DHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR_BACKGROUND);
  scene.add(buildStationStructure3DScene(projection));

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const DEFAULT_CAMERA_POSITION = new THREE.Vector3(30, 22, 40);
  const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, -6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; // event-driven rendering only -- see this file's own header.
  controls.target.copy(DEFAULT_CAMERA_TARGET);

  function applyDefaultCamera(): void {
    camera.position.copy(DEFAULT_CAMERA_POSITION);
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    camera.lookAt(controls.target);
    controls.update();
  }
  applyDefaultCamera();

  function renderFrame(): void {
    renderer.render(scene, camera);
  }

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderFrame();
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);
  resize();

  controls.addEventListener("change", renderFrame);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  function handleClick(event: MouseEvent): void {
    if (!options.onSelect) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const picked = hits.length > 0 ? findPickedSubjectAncestor(hits[0].object) : null;
    options.onSelect(picked);
  }
  if (options.onSelect) {
    renderer.domElement.addEventListener("click", handleClick);
  }

  function dispose(): void {
    resizeObserver.disconnect();
    controls.removeEventListener("change", renderFrame);
    controls.dispose();
    if (options.onSelect) renderer.domElement.removeEventListener("click", handleClick);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          const map = (material as THREE.Material & { map?: THREE.Texture | null }).map;
          map?.dispose();
          material.dispose();
        }
      }
    });
    renderer.dispose();
    if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
  }

  function resetCamera(): void {
    applyDefaultCamera();
    renderFrame();
  }

  return { dispose, resetCamera };
}
