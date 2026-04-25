#!/usr/bin/env python3

"""
0426_JUG_PLAYER_Visualizer_v1.7.1

Adds:
- Playback history tracking
- Waveform timeline visualization
- Energy curve plotting

Non-destructive: core playback engine unchanged
"""

import json
import time
import random
import queue
from pathlib import Path

import numpy as np
import sounddevice as sd
import soundfile as sf
import matplotlib.pyplot as plt

# =========================
# CONFIG
# =========================

GENRE = "house_124"

BASE_DIR = Path("./data")
METADATA_PATH = BASE_DIR / "analysis" / f"{GENRE}_metadata.json"

SR = 22050

TARGET_BPM = 124
BPM_TOLERANCE = 0.5  # slightly relaxed for stability

BEATS_PER_BAR = 4
QUANTIZE_BEATS = 2
HALF_BAR_MS = (60000 / TARGET_BPM) * QUANTIZE_BEATS

CROSSFADE_MS = 10
CROSSFADE_WRAP_MS = 20
CROSSFADE_DIFFERENT_TRACK_MS = 25

QUEUE_MIN = 1
MAX_ENERGY_JUMP = 2

DEFAULT_ROLE = "stable"
DEFAULT_ENERGY = 3
DEFAULT_GROUP = "A"

DEBUG_VISUALIZE = True

# =========================
# GLOBAL STATE
# =========================

audio_queue = queue.Queue()
current_buffer = None
buffer_pos = 0

last_tail = None
last_slice = None

# 🔥 NEW
play_history = []

# =========================
# LOAD / FILTER
# =========================

def load_metadata():
    with open(METADATA_PATH) as f:
        return json.load(f)

def filter_loopable(slices):
    return [
        s for s in slices
        if s.get("section") in ["build", "peak", "main", "loop"]
    ]

def filter_bpm(slices):
    return [
        s for s in slices
        if s.get("bpm") is None
        or abs(s["bpm"] - TARGET_BPM) <= BPM_TOLERANCE
    ]

def normalize_slice_metadata(slice_obj):
    s = dict(slice_obj)

    if "bpm" not in s:
        s["bpm"] = s.get("resolved_bpm") or s.get("raw_bpm")

    s.setdefault("group", s.get("key", DEFAULT_GROUP))
    s.setdefault("energy", DEFAULT_ENERGY)
    s.setdefault("role", DEFAULT_ROLE)
    s.setdefault("has_vocal", False)
    s.setdefault("phrase_unit", "half_bar")

    return s

def prepare_slices(pool):
    pool = [normalize_slice_metadata(s) for s in pool]
    pool = filter_loopable(pool)
    pool = filter_bpm(pool)
    return pool

# =========================
# VISUALIZATION
# =========================

def build_timeline_waveform(history, max_slices=40):
    recent = history[-max_slices:]

    timeline = []
    boundaries = []
    cursor = 0

    for entry in recent:
        try:
            data, _ = sf.read(BASE_DIR / entry["file"])

            if len(data.shape) > 1:
                data = np.mean(data, axis=1)

            data = data.astype(np.float32)

            timeline.append(data)
            cursor += len(data)
            boundaries.append(cursor)

        except Exception as e:
            print(f"⚠️ waveform fail: {entry['file']}")

    if not timeline:
        return

    combined = np.concatenate(timeline)

    plt.figure(figsize=(16, 4))
    plt.plot(combined, linewidth=0.5)

    for b in boundaries:
        plt.axvline(x=b, linestyle="--", alpha=0.2)

    plt.title("Waveform Timeline")
    plt.tight_layout()
    plt.show()


def plot_energy_curve(history, max_slices=40):
    recent = history[-max_slices:]
    energies = [h.get("energy", 3) for h in recent]

    plt.figure(figsize=(16, 2))
    plt.plot(energies, marker="o")

    plt.title("Energy Curve")
    plt.ylim(0, 6)
    plt.grid(True)
    plt.tight_layout()
    plt.show()

# =========================
# AUDIO
# =========================

def read_audio(slice_obj):
    data, sr = sf.read(BASE_DIR / slice_obj["file"])

    if sr != SR:
        raise RuntimeError("Sample rate mismatch")

    if len(data.shape) > 1:
        data = np.mean(data, axis=1)

    data = data.astype(np.float32)
    peak = np.max(np.abs(data)) + 1e-6
    return data / peak


def equal_power_crossfade(tail, head):
    n = min(len(tail), len(head))
    x = np.linspace(0, np.pi / 2, n)

    return (tail[-n:] * np.cos(x)) + (head[:n] * np.sin(x))


def audio_callback(outdata, frames, time_info, status):
    global current_buffer, buffer_pos

    outdata.fill(0)

    remaining = frames
    out_pos = 0

    while remaining > 0:
        if current_buffer is None or buffer_pos >= len(current_buffer):
            try:
                data, _, _ = audio_queue.get_nowait()
                current_buffer = data
                buffer_pos = 0
            except queue.Empty:
                break

        chunk = current_buffer[buffer_pos:buffer_pos + remaining]
        length = len(chunk)

        outdata[out_pos:out_pos + length, 0] += chunk

        buffer_pos += length
        out_pos += length
        remaining -= length

# =========================
# PLAYBACK
# =========================

def play_slice(slice_obj):
    global last_tail, last_slice

    # 🔥 track history
    play_history.append({
        "id": slice_obj["id"],
        "file": slice_obj["file"],
        "energy": slice_obj.get("energy"),
        "phrase_index": slice_obj.get("phrase_index"),
        "timestamp": time.time()
    })

    print(f"[PLAY] {slice_obj['id']}")

    data = read_audio(slice_obj)

    if last_slice is None:
        audio_queue.put((data, slice_obj["id"], True))
        last_tail = data
        last_slice = slice_obj
        return

    fade_samples = int((CROSSFADE_MS / 1000) * SR)
    fade_samples = min(fade_samples, len(data), len(last_tail))

    overlap = equal_power_crossfade(last_tail, data)

    audio_queue.put((overlap.astype(np.float32), slice_obj["id"], True))
    audio_queue.put((data[fade_samples:].astype(np.float32), slice_obj["id"], False))

    last_tail = data
    last_slice = slice_obj

# =========================
# ENGINE
# =========================

def run():
    raw = load_metadata()
    print(f"\n🧪 TOTAL SLICES: {len(raw)}")

    pool = prepare_slices(raw)
    print(f"🧪 AFTER FILTER: {len(pool)}\n")

    if not pool:
        raise RuntimeError("❌ No usable slices")

    base = random.choice(pool)
    track_id = base["track_id"]

    track_slices = [s for s in pool if s["track_id"] == track_id]
    track_slices.sort(key=lambda x: x["phrase_index"])

    print(f"🎧 TRACK: {track_id} | slices: {len(track_slices)}\n")

    idx = 0

    with sd.OutputStream(
        samplerate=SR,
        channels=1,
        callback=audio_callback,
        blocksize=1024
    ):
        try:
            while True:
                if audio_queue.qsize() < QUEUE_MIN:
                    idx = (idx + 1) % len(track_slices)
                    play_slice(track_slices[idx])

                    # 🔥 visualize every 12 slices
                    if DEBUG_VISUALIZE and len(play_history) % 12 == 0:
                        build_timeline_waveform(play_history)
                        plot_energy_curve(play_history)

                time.sleep(0.005)

        except KeyboardInterrupt:
            print("\n🛑 Stopped")
            sd.stop()

# =========================

if __name__ == "__main__":
    run()