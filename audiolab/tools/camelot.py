"""
camelot.py — Camelot wheel reference tables and conversion utilities.

The Camelot system maps musical keys to a clock-face grid for harmonic mixing.
- Outer ring (B suffix) = major keys
- Inner ring (A suffix) = minor keys
- Adjacent positions (±1 hour, same ring, or same number different ring) mix harmonically.
"""

MAJOR_TO_CAMELOT = {
    "B":  "1B",  "F#": "2B",  "C#": "3B",  "G#": "4B",
    "D#": "5B",  "A#": "6B",  "F":  "7B",  "C":  "8B",
    "G":  "9B",  "D": "10B",  "A": "11B",  "E": "12B",
}

MINOR_TO_CAMELOT = {
    "G#": "1A",  "D#": "2A",  "A#": "3A",  "F":  "4A",
    "C":  "5A",  "G":  "6A",  "D":  "7A",  "A":  "8A",
    "E":  "9A",  "B": "10A",  "F#": "11A", "C#": "12A",
}

CAMELOT_TO_KEY = {v: k for k, v in MAJOR_TO_CAMELOT.items()}
CAMELOT_TO_KEY.update({v: k for k, v in MINOR_TO_CAMELOT.items()})


def key_to_camelot(key: str, mode: str) -> str | None:
    """Convert key + mode ('major'/'minor') to Camelot notation. Returns None if unknown."""
    if mode == "major":
        return MAJOR_TO_CAMELOT.get(key)
    elif mode == "minor":
        return MINOR_TO_CAMELOT.get(key)
    return None


def camelot_to_key(code: str) -> str | None:
    """Convert Camelot code (e.g. '8A') to root key name."""
    return CAMELOT_TO_KEY.get(code.upper())


def compatible_keys(code: str) -> list:
    """Return list of harmonically compatible Camelot codes for a given code."""
    if not code or len(code) < 2:
        return []
    try:
        num = int(code[:-1])
        ring = code[-1].upper()
    except ValueError:
        return []

    compatible = []
    # Same ring, ±1 position
    for delta in (-1, 0, 1):
        n = ((num - 1 + delta) % 12) + 1
        compatible.append(f"{n}{ring}")
    # Opposite ring, same number
    other_ring = "A" if ring == "B" else "B"
    compatible.append(f"{num}{other_ring}")

    return sorted(set(compatible))
