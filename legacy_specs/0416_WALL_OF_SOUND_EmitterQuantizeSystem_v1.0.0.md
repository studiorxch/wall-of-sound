# 0416_WALL_OF_SOUND_EmitterQuantizeSystem_v1.0.0

## Goal

Unify quantization across the system and fix emitter timing.

## Transport

state.transport = { bpm: 120, division: 16 };

## Emitter Config

emitterConfig = { quantize: false, division: null, rate: 400, lastSpawn:
0, spawnMode: "center", silent: false };

## Timing Formula

intervalSec = (60 / bpm) \* (4 / division) intervalMs = intervalSec \*
1000

## Core Logic

function shouldSpawnEmitter(cfg, now, state) { if (!cfg.quantize) {
return now - cfg.lastSpawn \>= cfg.rate; }

const division = cfg.division ?? state.transport.division; const bpm =
state.transport.bpm;

const intervalSec = (60 / bpm) \* (4 / division); const intervalMs =
intervalSec \* 1000;

if (now - cfg.lastSpawn \>= intervalMs) { cfg.lastSpawn = now - ((now -
cfg.lastSpawn) % intervalMs); return true; }

return false; }

## Implementation Guide

-   Update updateBehaviorEmitters()
-   Wire UI to emitterConfig
-   Test with BPM grid
