# 0604M_WOS_BusAssetPack_v1.0.0_BUILD

## Purpose

Establish the first production-ready visual bus asset system for WOS.

This specification replaces generic fallback bus geometry with a recognizable fleet hierarchy while preserving transit truth, movement, telemetry, and selector authority.

## Asset Classes

- Standard
- Articulated
- Express
- Shuttle
- Special (reserved)

## New Module

wall/systems/transit/busAssetResolver.js

Namespace:

SBE.BusAssetResolver

## Runtime API

getAssetClass(actor)
getPresentationProfile(actor)
clearCache()

## Debug API

_wos.debug.transit.getBusAssetStats()
_wos.debug.transit.inspectBusAsset(vehicleId)

## Performance Requirements

- No per-frame allocations
- Cached profiles
- Stable assignments
- 500+ bus support

## Success Criteria

Distinct bus silhouettes are visually identifiable while preserving:

- Real routes
- Real telemetry
- Real movement
- Real vehicle identity

## Implementation Guide

- Where: wall/systems/transit/busAssetResolver.js, wall/render/busRenderer.js
- What: Implement resolver, cache, renderer dispatch, debug APIs
- Expect: Distinct bus silhouettes with no truth-layer changes
