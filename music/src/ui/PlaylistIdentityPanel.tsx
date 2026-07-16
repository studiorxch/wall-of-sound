import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { PlaylistRecord, PlaylistImage } from "../data/playProjectTypes";

type Props = {
  playlist: PlaylistRecord;
  onClose: () => void;
  onTitleChange: (t: string) => void;
  onDescriptionChange: (d: string) => void;
  onCoverImageChange: (img: PlaylistImage | undefined) => void;
  onBackgroundImageChange: (img: PlaylistImage | undefined) => void;
  onBroadcastBgChange: (src: string | undefined) => void;
  onMoodTagsChange: (tags: string[]) => void;
};

function nowIso() { return new Date().toISOString(); }

// UI thumbnail — small enough for localStorage, fine for cover art slots
const THUMB_MAX_DIM = 400;
const THUMB_QUALITY = 0.75;

// Broadcast background — large-display asset, must hold up at 1080p/4K
const BROADCAST_MAX_DIM = 3840;
const BROADCAST_QUALITY = 0.92;

function compressToDataUrl(
  file: File,
  maxDim: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  });
}

function compressThumb(file: File): Promise<string> {
  return compressToDataUrl(file, THUMB_MAX_DIM, THUMB_QUALITY);
}

function compressBroadcast(file: File): Promise<string> {
  return compressToDataUrl(file, BROADCAST_MAX_DIM, BROADCAST_QUALITY);
}

function ArtworkSlot({
  label, image, onFile, onClear,
  fileRef,
}: {
  label: string;
  image: PlaylistImage | undefined;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="pip-artwork-slot">
      <div className="pip-artwork-label">{label}</div>
      <div className="pip-artwork-thumb">
        {image?.src
          ? <img src={image.src} alt={image.alt ?? label} className="pip-artwork-img" />
          : <div className="pip-artwork-empty">—</div>
        }
      </div>
      <div className="pip-artwork-actions">
        <button className="pip-artwork-btn" onClick={() => fileRef.current?.click()}>
          {image ? "Change" : "Choose File"}
        </button>
        {image && (
          <button className="pip-artwork-btn pip-artwork-btn--clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*"
        style={{ display: "none" }} onChange={onFile} />
    </div>
  );
}

export function PlaylistIdentityPanel({
  playlist, onClose,
  onTitleChange, onDescriptionChange,
  onCoverImageChange, onBackgroundImageChange, onBroadcastBgChange, onMoodTagsChange,
}: Props) {
  const [tagsInput, setTagsInput] = useState(playlist.mood?.tags?.join(", ") ?? "");
  const coverFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = await compressThumb(file);
    onCoverImageChange({ src, source: "uploaded", createdAt: nowIso(), alt: file.name });
    e.target.value = "";
  }

  async function handleBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Generate both sizes in parallel — thumb for UI slots, broadcast for fullscreen
    const [thumbSrc, broadcastSrc] = await Promise.all([
      compressThumb(file),
      compressBroadcast(file),
    ]);
    onBackgroundImageChange({ src: thumbSrc, source: "uploaded", createdAt: nowIso(), alt: file.name });
    onBroadcastBgChange(broadcastSrc);
    e.target.value = "";
  }

  function commitTags() {
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onMoodTagsChange(tags);
  }

  return createPortal(
    <div className="export-modal-overlay" onClick={onClose}>
      <div
        className="export-modal pip-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-modal-header">
          <span>Playlist Identity</span>
          <button className="export-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="pip-body">
          {/* Left — Artwork */}
          <div className="pip-col-art">
            <ArtworkSlot
              label="Cover"
              image={playlist.coverImage}
              onFile={handleCoverFile}
              onClear={() => onCoverImageChange(undefined)}
              fileRef={coverFileRef}
            />
            <ArtworkSlot
              label="Background"
              image={playlist.backgroundImage}
              onFile={handleBgFile}
              onClear={() => { onBackgroundImageChange(undefined); onBroadcastBgChange(undefined); }}
              fileRef={bgFileRef}
            />
          </div>

          {/* Right — Details */}
          <div className="pip-col-details">
            <div className="pip-field">
              <label className="pip-label">Title</label>
              <input
                className="pip-input"
                value={playlist.title}
                onChange={(e) => onTitleChange(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="pip-field pip-field--grow">
              <label className="pip-label">Description / Mood Note</label>
              <textarea
                className="pip-textarea"
                value={playlist.description ?? ""}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Night map drift / urban electronic set…"
                spellCheck={false}
              />
            </div>

            <div className="pip-field">
              <label className="pip-label">Mood Tags</label>
              <input
                className="pip-input"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onBlur={commitTags}
                onKeyDown={(e) => { if (e.key === "Enter") commitTags(); }}
                placeholder="urban, night, lofi, transit, club…"
                spellCheck={false}
              />
              {(playlist.mood?.tags?.length ?? 0) > 0 && (
                <div className="pip-tags">
                  {playlist.mood!.tags!.map((tag) => (
                    <span key={tag} className="pip-tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="export-modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button className="tb-btn ph-btn-primary" onClick={onClose}>Save Changes</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
