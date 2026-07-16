import { useState, useRef, useEffect } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import { SourceBadge } from "./SourceBadge";

type Props = {
  bank: PlaylistRecord;
  libraryTracks: Track[];
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onClear: () => void;
};

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getTrackUrl(t: Track): string | null {
  if (t.objectUrl) return t.objectUrl;
  if (t.filePath) return `/media?path=${encodeURIComponent(t.filePath)}`;
  return null;
}

function buildNaturalOrder(len: number): number[] {
  return Array.from({ length: len }, (_, i) => i);
}

function buildShuffleOrder(len: number, pinFirst?: number): number[] {
  const arr = buildNaturalOrder(len);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (pinFirst != null) {
    const pos = arr.indexOf(pinFirst);
    if (pos > 0) { [arr[0], arr[pos]] = [arr[pos], arr[0]]; }
  }
  return arr;
}

export function SamplerPlayer({ bank, libraryTracks, collapsed, onCollapse, onExpand, onClear }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [playOrder, setPlayOrder] = useState<number[]>([]);
  const [volume, setVolume] = useState(0.35);
  const [shuffle, setShuffle] = useState(false);
  const [loopClip, setLoopClip] = useState(false);
  const [loopBank, setLoopBank] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const playPosRef = useRef(0);
  const playOrderRef = useRef<number[]>([]);
  const loopClipRef = useRef(false);
  const loopBankRef = useRef(true);
  const isPlayingRef = useRef(false);
  const bankTracksRef = useRef<Track[]>([]);
  const volumeRef = useRef(0.35);

  useEffect(() => { playPosRef.current = playPos; }, [playPos]);
  useEffect(() => { playOrderRef.current = playOrder; }, [playOrder]);
  useEffect(() => { loopClipRef.current = loopClip; }, [loopClip]);
  useEffect(() => { loopBankRef.current = loopBank; }, [loopBank]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const bankTracks = bank.slots
    .map((s) => s.assignedTrackId ? tracksById.get(s.assignedTrackId) : undefined)
    .filter((t): t is Track => t != null && getTrackUrl(t) != null);
  bankTracksRef.current = bankTracks;

  const currentTrackIdx = playOrder[playPos] ?? 0;
  const currentTrack = bankTracks[currentTrackIdx];

  useEffect(() => {
    const order = buildNaturalOrder(bankTracks.length);
    setPlayOrder(order);
    playOrderRef.current = order;
    setPlayPos(0);
    playPosRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank.playlistId]);

  function loadAtPos(pos: number, autoplay: boolean, order?: number[]) {
    const audio = audioRef.current;
    const ord = order ?? playOrderRef.current;
    const tracks = bankTracksRef.current;
    const trackIdx = ord[pos];
    if (!audio || trackIdx == null || !tracks[trackIdx]) return;
    const url = getTrackUrl(tracks[trackIdx]!);
    if (!url) { setError("No audio source"); return; }
    setError(null);
    setPlayPos(pos);
    playPosRef.current = pos;
    audio.src = url;
    audio.loop = loopClipRef.current;
    audio.volume = volumeRef.current;
    if (autoplay) {
      audio.play()
        .then(() => { setIsPlaying(true); isPlayingRef.current = true; })
        .catch((e) => { setError(String(e)); setIsPlaying(false); });
    } else {
      setIsPlaying(false);
    }
  }

  // Audio element — mount once, stays alive for entire component lifetime
  useEffect(() => {
    const audio = new Audio();
    audio.volume = 0.35;
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("durationchange", () => setDuration(isNaN(audio.duration) ? 0 : audio.duration));
    audio.addEventListener("ended", () => {
      if (loopClipRef.current) return;
      const ord = playOrderRef.current;
      const pos = playPosRef.current;
      if (ord.length === 0) { setIsPlaying(false); return; }
      if (pos < ord.length - 1) {
        loadAtPos(pos + 1, true, ord);
      } else if (loopBankRef.current) {
        loadAtPos(0, true, ord);
      } else {
        setIsPlaying(false);
      }
    });
    audio.addEventListener("error", () => {
      if (!audio.currentSrc) return;
      // Try to skip to the next clip rather than halting entirely
      const pos = playPosRef.current;
      const ord = playOrderRef.current;
      if (isPlayingRef.current && pos < ord.length - 1) {
        setError(`Clip unplayable — skipping`);
        setTimeout(() => {
          setError(null);
          loadAtPos(pos + 1, true, ord);
        }, 300);
      } else {
        setError("Playback error — no audio source");
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    });

    return () => { audio.pause(); audio.src = ""; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loopClip;
  }, [loopClip]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Reset playback on bank change (not on collapse/expand)
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setPlayPos(0);
    setShuffle(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [bank.playlistId]);

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    // If no src set yet, or previous src errored, load from current position
    if (!audio.src || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      if (bankTracks.length === 0) return;
      loadAtPos(playPos, true);
      return;
    }
    audio.play().then(() => setIsPlaying(true)).catch((e) => setError(String(e)));
  }

  function handlePause() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function handleStop() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }

  function handleNext() {
    const ord = playOrderRef.current;
    const pos = playPosRef.current;
    if (pos < ord.length - 1) loadAtPos(pos + 1, isPlaying);
    else if (loopBank && ord.length > 0) loadAtPos(0, isPlaying);
  }

  function handlePrev() {
    if (currentTime > 3 && audioRef.current) { audioRef.current.currentTime = 0; return; }
    const ord = playOrderRef.current;
    const pos = playPosRef.current;
    if (pos > 0) loadAtPos(pos - 1, isPlaying);
    else if (loopBank && ord.length > 0) loadAtPos(ord.length - 1, isPlaying);
  }

  function handleToggleShuffle() {
    const next = !shuffle;
    setShuffle(next);
    const n = bankTracks.length;
    if (n === 0) return;
    if (next) {
      const newOrder = buildShuffleOrder(n, currentTrackIdx);
      setPlayOrder(newOrder);
      playOrderRef.current = newOrder;
      setPlayPos(0);
      playPosRef.current = 0;
    } else {
      const newOrder = buildNaturalOrder(n);
      setPlayOrder(newOrder);
      playOrderRef.current = newOrder;
      setPlayPos(currentTrackIdx);
      playPosRef.current = currentTrackIdx;
    }
  }

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const noTracks = bankTracks.length === 0;

  // Collapsed: show a compact status bar only — audio keeps running
  if (collapsed) {
    return (
      <div className="sampler-collapsed-bar">
        <span className="sampler-label">SAMPLER</span>
        <span className="sampler-collapsed-name">{bank.title}</span>
        {isPlaying && <span className="sampler-playing-pip" title="Playing" />}
        {isPlaying ? (
          <button className="sampler-collapsed-btn" onClick={handlePause} title="Pause">⏸</button>
        ) : (
          <button className="sampler-collapsed-btn" onClick={handlePlay} disabled={noTracks} title="Play">▶</button>
        )}
        <button className="sampler-collapsed-btn" onClick={onExpand} title="Expand Sampler">▲</button>
        <button className="sampler-collapsed-btn sampler-collapsed-clear" onClick={() => { handleStop(); onClear(); }} title="Stop &amp; Clear Bank">✕</button>
      </div>
    );
  }

  return (
    <div className="sampler">
      <div className="sampler-header">
        <span className="sampler-label">SAMPLER</span>
        <span className="sampler-bank-name" title={bank.title}>{bank.title}</span>
        <SourceBadge source="REF" className="sampler-source-badge" />
        <button className="sampler-close" onClick={onCollapse} title="Collapse Sampler (keeps playing)">▼</button>
        <button className="sampler-close sampler-clear-btn" onClick={() => { handleStop(); onClear(); }} title="Stop &amp; Clear Bank">✕</button>
      </div>

      <div className="sampler-now-playing">
        {currentTrack ? (
          <>
            <span className="sampler-clip-title">{currentTrack.title}</span>
            {currentTrack.artist && <span className="sampler-clip-artist">{currentTrack.artist}</span>}
          </>
        ) : (
          <span className="sampler-no-clips">No playable clips in bank</span>
        )}
      </div>

      {error && <div className="sampler-error">{error}</div>}

      <div className="sampler-controls">
        <button className="sampler-btn" onClick={handlePrev} disabled={noTracks} title="Previous">⏮</button>
        <button
          className={`sampler-btn sampler-playpause${isPlaying ? " active" : ""}`}
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={noTracks}
          title={isPlaying ? "Pause" : "Play"}
        >{isPlaying ? "⏸" : "▶"}</button>
        <button className="sampler-btn" onClick={handleNext} disabled={noTracks} title="Next">⏭</button>
        <button className="sampler-btn" onClick={handleStop} disabled={!isPlaying} title="Stop">⏹</button>
        <button
          className={`sampler-btn sampler-shuffle${shuffle ? " active" : ""}`}
          onClick={handleToggleShuffle}
          disabled={noTracks}
          title={shuffle ? "Shuffle On" : "Shuffle Off"}
        >⇀</button>
      </div>

      <div className="sampler-progress">
        <span className="sampler-time">{fmtTime(currentTime)}</span>
        <div
          className="sampler-bar"
          onClick={(e) => {
            if (!duration || !audioRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
          }}
        >
          <div className="sampler-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="sampler-time">{fmtTime(duration)}</span>
      </div>

      <div className="sampler-footer">
        <label className="sampler-check">
          <input type="checkbox" checked={loopClip} onChange={(e) => setLoopClip(e.target.checked)} />
          <span>Loop clip</span>
        </label>
        <label className="sampler-check">
          <input type="checkbox" checked={loopBank} onChange={(e) => setLoopBank(e.target.checked)} />
          <span>Loop bank</span>
        </label>
        <div className="sampler-vol-row">
          <span className="sampler-vol-lbl">Vol</span>
          <input
            type="range" min={0} max={1} step={0.01} value={volume}
            className="sampler-vol"
            onChange={(e) => setVolume(Number(e.target.value))}
            title={`Sampler Volume: ${Math.round(volume * 100)}%`}
          />
          <span className="sampler-vol-val">{Math.round(volume * 100)}</span>
        </div>
      </div>

      {!noTracks && (
        <div className="sampler-queue">
          {playOrder.slice(0, 10).map((trackIdx, pos) => {
            const t = bankTracks[trackIdx];
            if (!t) return null;
            return (
              <div
                key={`${t.trackId}-${pos}`}
                className={`sampler-qrow${pos === playPos ? " active" : ""}`}
                onClick={() => loadAtPos(pos, true)}
              >
                <span className="sampler-qidx">{pos + 1}</span>
                <span className="sampler-qtitle">{t.title}</span>
              </div>
            );
          })}
          {playOrder.length > 10 && (
            <div className="sampler-qmore">+{playOrder.length - 10} more clips</div>
          )}
        </div>
      )}
    </div>
  );
}
