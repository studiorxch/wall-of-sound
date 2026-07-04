import { useState, useRef, useEffect } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";

type Props = {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  onClose: () => void;
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
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Move pinFirst to position 0 so current track stays playing
  if (pinFirst != null) {
    const pos = arr.indexOf(pinFirst);
    if (pos > 0) { [arr[0], arr[pos]] = [arr[pos], arr[0]]; }
  }
  return arr;
}

export function DeckBPlayer({ playlist, libraryTracks, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // playPos = index into playOrder; playOrder = indices into playlistTracks
  const [playPos, setPlayPos] = useState(0);
  const [playOrder, setPlayOrder] = useState<number[]>([]);
  const [volume, setVolume] = useState(0.35);
  const [shuffle, setShuffle] = useState(false);
  const [loopTrack, setLoopTrack] = useState(false);
  const [loopPlaylist, setLoopPlaylist] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for stale-closure-safe event handlers
  const playPosRef = useRef(0);
  const playOrderRef = useRef<number[]>([]);
  const loopTrackRef = useRef(false);
  const loopPlaylistRef = useRef(true);
  const isPlayingRef = useRef(false);
  const playlistTracksRef = useRef<Track[]>([]);
  const volumeRef = useRef(0.35);

  useEffect(() => { playPosRef.current = playPos; }, [playPos]);
  useEffect(() => { playOrderRef.current = playOrder; }, [playOrder]);
  useEffect(() => { loopTrackRef.current = loopTrack; }, [loopTrack]);
  useEffect(() => { loopPlaylistRef.current = loopPlaylist; }, [loopPlaylist]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // Build ordered playable track list from playlist slots
  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const playlistTracks = playlist.slots
    .map((s) => s.assignedTrackId ? tracksById.get(s.assignedTrackId) : undefined)
    .filter((t): t is Track => t != null && getTrackUrl(t) != null);
  playlistTracksRef.current = playlistTracks;

  // Effective track index (into playlistTracks) at current position
  const currentTrackIdx = playOrder[playPos] ?? 0;
  const currentTrack = playlistTracks[currentTrackIdx];

  // Initialize playOrder when playlist changes
  useEffect(() => {
    const order = buildNaturalOrder(playlistTracks.length);
    setPlayOrder(order);
    playOrderRef.current = order;
    setPlayPos(0);
    playPosRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.playlistId]);

  function loadAtPos(pos: number, autoplay: boolean, order?: number[]) {
    const audio = audioRef.current;
    const ord = order ?? playOrderRef.current;
    const tracks = playlistTracksRef.current;
    const trackIdx = ord[pos];
    if (!audio || trackIdx == null || !tracks[trackIdx]) return;
    const url = getTrackUrl(tracks[trackIdx]!);
    if (!url) { setError("No audio source"); return; }
    setError(null);
    setPlayPos(pos);
    playPosRef.current = pos;
    audio.src = url;
    audio.loop = loopTrackRef.current;
    audio.volume = volumeRef.current;
    if (autoplay) {
      audio.play()
        .then(() => { setIsPlaying(true); isPlayingRef.current = true; })
        .catch((e) => { setError(String(e)); setIsPlaying(false); });
    } else {
      setIsPlaying(false);
    }
  }

  // Audio element setup — once on mount
  useEffect(() => {
    const audio = new Audio();
    audio.volume = 0.35;
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("durationchange", () => setDuration(isNaN(audio.duration) ? 0 : audio.duration));
    audio.addEventListener("ended", () => {
      if (loopTrackRef.current) return; // audio.loop handles this
      const ord = playOrderRef.current;
      const pos = playPosRef.current;
      if (ord.length === 0) { setIsPlaying(false); return; }
      if (pos < ord.length - 1) {
        loadAtPos(pos + 1, true, ord);
      } else if (loopPlaylistRef.current) {
        loadAtPos(0, true, ord);
      } else {
        setIsPlaying(false);
      }
    });
    audio.addEventListener("error", () => {
      if (!audio.currentSrc) return;
      setError("Playback error");
      setIsPlaying(false);
    });

    return () => { audio.pause(); audio.src = ""; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync audio.loop
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loopTrack;
  }, [loopTrack]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Reset when playlist changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setPlayPos(0);
    setShuffle(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [playlist.playlistId]);

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src && playlistTracks.length > 0) {
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
    else if (loopPlaylist && ord.length > 0) loadAtPos(0, isPlaying);
  }

  function handlePrev() {
    if (currentTime > 3 && audioRef.current) {
      audioRef.current.currentTime = 0;
      return;
    }
    const ord = playOrderRef.current;
    const pos = playPosRef.current;
    if (pos > 0) loadAtPos(pos - 1, isPlaying);
    else if (loopPlaylist && ord.length > 0) loadAtPos(ord.length - 1, isPlaying);
  }

  function handleToggleShuffle() {
    const nextShuffle = !shuffle;
    setShuffle(nextShuffle);
    const n = playlistTracks.length;
    if (n === 0) return;
    if (nextShuffle) {
      // Build shuffled order, keeping current track at position 0
      const newOrder = buildShuffleOrder(n, currentTrackIdx);
      setPlayOrder(newOrder);
      playOrderRef.current = newOrder;
      setPlayPos(0);
      playPosRef.current = 0;
    } else {
      // Restore natural order, seek to current track's natural position
      const newOrder = buildNaturalOrder(n);
      setPlayOrder(newOrder);
      playOrderRef.current = newOrder;
      setPlayPos(currentTrackIdx);
      playPosRef.current = currentTrackIdx;
    }
  }

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const noTracks = playlistTracks.length === 0;

  return (
    <div className="deck-b">
      <div className="deck-b-header">
        <span className="deck-b-label">B</span>
        <span className="deck-b-title" title={playlist.title}>{playlist.title}</span>
        <button className="deck-b-close" onClick={() => { handleStop(); onClose(); }} title="Unload Deck B">×</button>
      </div>

      {currentTrack ? (
        <div className="deck-b-track">
          <span className="deck-b-track-title">{currentTrack.title}</span>
          {currentTrack.artist && <span className="deck-b-track-artist">{currentTrack.artist}</span>}
        </div>
      ) : (
        <div className="deck-b-track deck-b-no-tracks">No playable tracks in playlist</div>
      )}

      {error && <div className="deck-b-error">{error}</div>}

      <div className="deck-b-controls">
        <button className="deck-b-btn" onClick={handlePrev} disabled={noTracks} title="Previous">⏮</button>
        <button
          className={`deck-b-btn deck-b-playpause${isPlaying ? " active" : ""}`}
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={noTracks}
          title={isPlaying ? "Pause" : "Play"}
        >{isPlaying ? "⏸" : "▶"}</button>
        <button className="deck-b-btn" onClick={handleNext} disabled={noTracks} title="Next">⏭</button>
        <button className="deck-b-btn" onClick={handleStop} disabled={!isPlaying} title="Stop">⏹</button>
        <button
          className={`deck-b-btn deck-b-shuffle${shuffle ? " active" : ""}`}
          onClick={handleToggleShuffle}
          disabled={noTracks}
          title={shuffle ? "Shuffle On — click to disable" : "Shuffle Off — click to enable"}
        >⇀</button>
      </div>

      <div className="deck-b-progress">
        <span className="deck-b-time">{fmtTime(currentTime)}</span>
        <div
          className="deck-b-bar"
          onClick={(e) => {
            if (!duration || !audioRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
          }}
        >
          <div className="deck-b-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="deck-b-time">{fmtTime(duration)}</span>
      </div>

      <div className="deck-b-footer">
        <label className="deck-b-check">
          <input type="checkbox" checked={loopTrack} onChange={(e) => setLoopTrack(e.target.checked)} />
          <span>Loop track</span>
        </label>
        <label className="deck-b-check">
          <input type="checkbox" checked={loopPlaylist} onChange={(e) => setLoopPlaylist(e.target.checked)} />
          <span>Loop</span>
        </label>
        <div className="deck-b-vol-row">
          <span className="deck-b-vol-lbl">Vol</span>
          <input
            type="range" min={0} max={1} step={0.01} value={volume}
            className="deck-b-vol"
            onChange={(e) => setVolume(Number(e.target.value))}
            title={`Deck B Volume: ${Math.round(volume * 100)}%`}
          />
          <span className="deck-b-vol-val">{Math.round(volume * 100)}</span>
        </div>
      </div>

      {!noTracks && (
        <div className="deck-b-queue">
          {playOrder.slice(0, 10).map((trackIdx, pos) => {
            const t = playlistTracks[trackIdx];
            if (!t) return null;
            return (
              <div
                key={`${t.trackId}-${pos}`}
                className={`deck-b-qrow${pos === playPos ? " active" : ""}`}
                onClick={() => loadAtPos(pos, true)}
              >
                <span className="deck-b-qidx">{pos + 1}</span>
                <span className="deck-b-qtitle">{t.title}</span>
              </div>
            );
          })}
          {playOrder.length > 10 && (
            <div className="deck-b-qmore">+{playOrder.length - 10} more</div>
          )}
        </div>
      )}
    </div>
  );
}
