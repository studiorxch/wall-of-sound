import { useState, useRef } from "react";
import type { PlaylistRecord, PlaylistImage } from "../data/playProjectTypes";

type Props = {
  playlist: PlaylistRecord;
  onClose: () => void;
  onTitleChange: (t: string) => void;
  onDescriptionChange: (d: string) => void;
  onCoverImageChange: (img: PlaylistImage | undefined) => void;
  onBackgroundImageChange: (img: PlaylistImage | undefined) => void;
  onMoodTagsChange: (tags: string[]) => void;
};

function nowIso() { return new Date().toISOString(); }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function ArtworkSlot({
  label, image, onFile, onClear,
  fileRef,
}: {
  label: string;
  image: PlaylistImage | undefined;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  fileRef: React.RefObject<HTMLInputElement>;
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
  onCoverImageChange, onBackgroundImageChange, onMoodTagsChange,
}: Props) {
  const [tagsInput, setTagsInput] = useState(playlist.mood?.tags?.join(", ") ?? "");
  const coverFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    onCoverImageChange({ src, source: "uploaded", createdAt: nowIso(), alt: file.name });
    e.target.value = "";
  }

  async function handleBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    onBackgroundImageChange({ src, source: "uploaded", createdAt: nowIso(), alt: file.name });
    e.target.value = "";
  }

  function commitTags() {
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onMoodTagsChange(tags);
  }

  return (
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
              onClear={() => onBackgroundImageChange(undefined)}
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
    </div>
  );
}
