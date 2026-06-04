#!/usr/bin/env python3
"""
bake_harbor_sector.py — 0528E_WOS_HarborGeometryBakePipeline_v1.0.0
Wall of Sound harbor sector geometry bake pipeline.

Reads source GeoJSON from tools/sources/harbor/
Clips / filters to NYC_HARBOR_SECTOR_01 bounds
Normalises feature properties
Writes runtime GeoJSON to wall/data/harbor/nyc_harbor_sector_01/
Generates sector_manifest.json

Usage:
    python3 tools/bake_harbor_sector.py
    python3 tools/bake_harbor_sector.py --sector nyc_harbor_sector_01
    python3 tools/bake_harbor_sector.py --lod hero
    python3 tools/bake_harbor_sector.py --verbose

Dependencies: standard library only (json, os, sys, datetime, math, argparse).
Optional: shapely — enables true polygon clipping. Degrades cleanly if absent.
"""

import json
import os
import sys
import math
import datetime
import argparse
import copy

# ── Constants ─────────────────────────────────────────────────────────────────

SECTOR_ID = "nyc_harbor_sector_01"
VERSION   = "1.0.0"

BOUNDS = {
    "west":  -74.085,
    "south":  40.600,
    "east":  -73.930,
    "north":  40.735,
}

# Simplification tolerances (degrees). Hero = finest detail.
SIMPLIFY_TOLERANCE = {
    "coarse":   0.00035,
    "standard": 0.00012,
    "hero":     0.00004,
}

# Layer config: source file → output file, priority, default lod
LAYER_CONFIG = {
    "shoreline": {
        "source_file": "source_shoreline.geojson",
        "output_file": "shoreline_polygons.geojson",
        "priority":    5,
        "min_zoom":    8.0,
        "max_zoom":    18.0,
        "lod":         "standard",
    },
    "pier": {
        "source_file": "source_piers.geojson",
        "output_file": "pier_outlines.geojson",
        "priority":    4,
        "min_zoom":    10.0,
        "max_zoom":    18.0,
        "lod":         "standard",
    },
    "ferry_slip": {
        "source_file": "source_ferry_slips.geojson",
        "output_file": "ferry_slips.geojson",
        "priority":    5,
        "min_zoom":    11.0,
        "max_zoom":    18.0,
        "lod":         "hero",
    },
    "island": {
        "source_file": "source_islands.geojson",
        "output_file": "island_outlines.geojson",
        "priority":    5,
        "min_zoom":    8.5,
        "max_zoom":    18.0,
        "lod":         "standard",
    },
    "bridge_context": {
        "source_file": "source_bridges.geojson",
        "output_file": "bridge_context_lines.geojson",
        "priority":    4,
        "min_zoom":    8.0,
        "max_zoom":    15.0,
        "lod":         "coarse",
    },
    "waterfront_block": {
        "source_file": "source_waterfront_blocks.geojson",
        "output_file": "waterfront_blocks.geojson",
        "priority":    3,
        "min_zoom":    9.5,
        "max_zoom":    17.0,
        "lod":         "standard",
    },
    "hero_landmark": {
        "source_file": "source_hero_landmarks.geojson",
        "output_file": "hero_landmarks.geojson",
        "priority":    5,
        "min_zoom":    8.0,
        "max_zoom":    18.0,
        "lod":         "hero",
    },
    "harbor_channel": {
        "source_file": "source_harbor_channels.geojson",
        "output_file": "harbor_channels.geojson",
        "priority":    4,
        "min_zoom":    7.5,
        "max_zoom":    16.0,
        "lod":         "coarse",
    },
}

# Cinematic weight overrides — matched against feature id or label substrings
CINEMATIC_WEIGHTS = {
    "brooklyn_army_terminal": 1.00,
    "sunset_park":            0.95,
    "statue_of_liberty":      1.00,
    "liberty_island":         1.00,
    "governors_island":       0.90,
    "lower_manhattan":        1.00,
    "battery_park":           0.90,
    "red_hook":               0.85,
    "ellis_island":           0.75,
    "verrazzano":             0.85,
    "brooklyn_bridge":        0.80,
    "williamsburg_bridge":    0.70,
    "manhattan_bridge":       0.75,
    "main_ship_channel":      0.95,
    "shooters_island":        0.60,
    "bat_ferry":              0.90,
    "lower_manhattan_skyline": 1.00,
    "governors_island_center": 0.90,
}

# ── Geometry helpers (no shapely) ─────────────────────────────────────────────

def coord_inside_bounds(lng, lat, bounds, margin=0.005):
    """True if the coordinate is inside or near the sector bounds."""
    return (bounds["west"]  - margin <= lng <= bounds["east"]  + margin and
            bounds["south"] - margin <= lat <= bounds["north"] + margin)

def feature_intersects_bounds(feature, bounds):
    """
    True if any coordinate of the feature falls inside or near the bounds.
    Does NOT perform true polygon clipping — cross-boundary features are included.
    """
    geom = feature.get("geometry")
    if not geom:
        return False
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])

    def scan_coords(c):
        if not c:
            return False
        if isinstance(c[0], (int, float)):
            return coord_inside_bounds(c[0], c[1], bounds)
        return any(scan_coords(sub) for sub in c)

    inside = scan_coords(coords)
    if not inside:
        # Log cross-boundary hint (not an error)
        pass
    return inside

def rdp_simplify(points, tolerance):
    """
    Ramer-Douglas-Peucker simplification. Returns simplified list of [lng, lat].
    Works on flat [x, y] coordinate pairs.
    """
    if len(points) < 3:
        return points

    def point_line_dist(p, a, b):
        """Perpendicular distance from point p to line segment a→b."""
        if a == b:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / (dx*dx + dy*dy)))
        return math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy))

    dmax, idx = 0, 0
    end = len(points) - 1
    for i in range(1, end):
        d = point_line_dist(points[i], points[0], points[end])
        if d > dmax:
            dmax, idx = d, i

    if dmax > tolerance:
        left  = rdp_simplify(points[:idx+1], tolerance)
        right = rdp_simplify(points[idx:],   tolerance)
        return left[:-1] + right
    return [points[0], points[end]]

def simplify_geometry(geom, tolerance):
    """Apply RDP simplification to a GeoJSON geometry, preserving type."""
    if not geom or tolerance <= 0:
        return geom

    gtype = geom.get("type", "")
    result = copy.deepcopy(geom)

    def simplify_ring(ring):
        if len(ring) < 4:
            return ring
        simplified = rdp_simplify(ring, tolerance)
        # Ensure polygon ring closes
        if gtype in ("Polygon", "MultiPolygon"):
            if simplified[0] != simplified[-1]:
                simplified.append(simplified[0])
        # Never reduce below 4 points for a polygon ring
        if gtype in ("Polygon", "MultiPolygon") and len(simplified) < 4:
            return ring
        return simplified

    if gtype == "LineString":
        result["coordinates"] = rdp_simplify(geom["coordinates"], tolerance)
    elif gtype == "MultiLineString":
        result["coordinates"] = [rdp_simplify(r, tolerance) for r in geom["coordinates"]]
    elif gtype == "Polygon":
        result["coordinates"] = [simplify_ring(r) for r in geom["coordinates"]]
    elif gtype == "MultiPolygon":
        result["coordinates"] = [[simplify_ring(r) for r in poly]
                                  for poly in geom["coordinates"]]
    return result

# ── Property normalisation ─────────────────────────────────────────────────────

def _cinematic_weight(feat_id, label, default=0.7):
    """Match feature id/label against known weight overrides."""
    key = (feat_id + " " + (label or "")).lower()
    for token, weight in CINEMATIC_WEIGHTS.items():
        if token in key:
            return weight
    return default

def _slugify(s):
    return s.lower().replace(" ", "_").replace("-", "_").replace("/", "_")[:40]

def normalise_properties(feature, layer_name, cfg, index, source_file):
    """
    Return a new properties dict with all required BakedHarborFeature keys.
    Preserves existing source properties under 'sourceProps'.
    """
    existing = feature.get("properties") or {}
    src_id   = existing.get("id") or existing.get("name") or existing.get("label") or ""
    label    = existing.get("label") or existing.get("name") or existing.get("id") or ""
    slug     = _slugify(label) if label else layer_name
    feat_id  = "{}_{}_{:03d}".format(layer_name, slug, index + 1)

    return {
        "id":              feat_id,
        "layer":           layer_name,
        "label":           label or feat_id,
        "category":        existing.get("category", layer_name),
        "priority":        int(existing.get("priority", cfg["priority"])),
        "cinematicWeight": _cinematic_weight(feat_id, label, 0.70),
        "minZoom":         float(existing.get("minZoom", cfg["min_zoom"])),
        "maxZoom":         float(existing.get("maxZoom", cfg["max_zoom"])),
        "lod":             existing.get("lod", cfg["lod"]),
        "source":          source_file,
    }

# ── IO helpers ────────────────────────────────────────────────────────────────

def load_geojson(path, verbose=False):
    """Load and parse a GeoJSON file. Returns FeatureCollection or None."""
    if not os.path.exists(path):
        print(f"  ⚠ WARN  source not found: {path} — skipping layer")
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if verbose:
            n = len(data.get("features", []))
            print(f"  → loaded {n} features from {os.path.basename(path)}")
        return data
    except Exception as e:
        print(f"  ✗ ERROR reading {path}: {e}")
        return None

def write_geojson(path, feature_collection):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(feature_collection, f, indent=2)

# ── Bake one layer ────────────────────────────────────────────────────────────

def bake_layer(layer_name, cfg, sources_dir, output_dir, bounds, lod_override, verbose):
    source_path = os.path.join(sources_dir, cfg["source_file"])
    output_path = os.path.join(output_dir,  cfg["output_file"])

    source = load_geojson(source_path, verbose)
    if source is None:
        # Write an empty FeatureCollection so the registry can still load the file
        empty = {"type": "FeatureCollection", "features": []}
        write_geojson(output_path, empty)
        return 0

    raw_features = source.get("features", [])
    out_features  = []
    lod  = lod_override or cfg["lod"]
    tol  = SIMPLIFY_TOLERANCE.get(lod, SIMPLIFY_TOLERANCE["standard"])

    cross_boundary_count = 0

    for i, feat in enumerate(raw_features):
        if not feature_intersects_bounds(feat, bounds):
            if verbose:
                print(f"    skip (out-of-bounds): feature {i}")
            continue

        # Flag cross-boundary features (informational only)
        crosses = _feature_crosses_boundary(feat, bounds)
        if crosses:
            cross_boundary_count += 1

        geom_simplified = simplify_geometry(feat.get("geometry"), tol)
        props = normalise_properties(feat, layer_name, cfg, len(out_features), cfg["source_file"])
        if crosses:
            props["crossesSectorBoundary"] = True

        out_features.append({
            "type":       "Feature",
            "geometry":    geom_simplified,
            "properties":  props,
        })

    fc = {
        "type":     "FeatureCollection",
        "features":  out_features,
        "metadata": {
            "layer":    layer_name,
            "sectorId": SECTOR_ID,
            "lod":      lod,
            "bakedAt":  datetime.datetime.utcnow().isoformat() + "Z",
        },
    }
    write_geojson(output_path, fc)

    if cross_boundary_count:
        print(f"  ℹ {layer_name}: {cross_boundary_count} feature(s) cross sector boundary (included, not clipped)")

    return len(out_features)

def _feature_crosses_boundary(feat, bounds):
    """Heuristic: feature has some coords inside and some outside bounds."""
    geom = feat.get("geometry") or {}
    coords = geom.get("coordinates", [])
    inside_count  = [0]
    outside_count = [0]

    def scan(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            if coord_inside_bounds(c[0], c[1], bounds, margin=0):
                inside_count[0]  += 1
            else:
                outside_count[0] += 1
        else:
            for sub in c:
                scan(sub)

    scan(coords)
    return inside_count[0] > 0 and outside_count[0] > 0

# ── Manifest ──────────────────────────────────────────────────────────────────

def write_manifest(output_dir, layer_counts, bounds):
    layers = {}
    for layer_name, cfg in LAYER_CONFIG.items():
        layers[layer_name] = {
            "file":         cfg["output_file"],
            "featureCount": layer_counts.get(layer_name, 0),
        }

    manifest = {
        "sectorId":    SECTOR_ID,
        "version":     VERSION,
        "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "bounds":       bounds,
        "layers":       layers,
    }

    manifest_path = os.path.join(output_dir, "sector_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return manifest_path

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="WOS Harbor Sector Bake Pipeline v" + VERSION)
    parser.add_argument("--sector",  default=SECTOR_ID, help="Sector ID to bake")
    parser.add_argument("--lod",     default=None,      choices=["coarse","standard","hero"],
                        help="Override LOD for all layers")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    # Resolve paths relative to this script's location
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    sources_dir  = os.path.join(script_dir,   "sources", "harbor")
    output_dir   = os.path.join(project_root, "wall", "data", "harbor", args.sector)

    os.makedirs(sources_dir, exist_ok=True)
    os.makedirs(output_dir,  exist_ok=True)

    print(f"\n╔══ WOS Harbor Sector Bake ══════════════════════════╗")
    print(f"  sector  : {args.sector}")
    print(f"  lod     : {args.lod or 'per-layer defaults'}")
    print(f"  sources : {sources_dir}")
    print(f"  output  : {output_dir}")
    print(f"╚════════════════════════════════════════════════════╝\n")

    layer_counts = {}
    for layer_name, cfg in LAYER_CONFIG.items():
        print(f"  baking {layer_name} …")
        count = bake_layer(
            layer_name, cfg,
            sources_dir, output_dir,
            BOUNDS, args.lod, args.verbose,
        )
        layer_counts[layer_name] = count
        print(f"    → {count} features written to {cfg['output_file']}")

    manifest_path = write_manifest(output_dir, layer_counts, BOUNDS)

    print(f"\n  ✓ manifest written: {manifest_path}")
    total = sum(layer_counts.values())
    print(f"  ✓ bake complete: {total} total features across {len(LAYER_CONFIG)} layers\n")

    for name, count in layer_counts.items():
        status = "✓" if count > 0 else "⚠ EMPTY"
        print(f"    {status}  {name:<20} {count} features")

    print()

if __name__ == "__main__":
    main()
