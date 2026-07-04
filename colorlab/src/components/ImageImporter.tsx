import React, { useCallback, useRef, useState } from 'react';

interface Props {
  // File is surfaced alongside the image so callers can compute content hash
  // and preserve original source metadata per the ExtractionPipeline spec.
  onImageLoaded: (img: HTMLImageElement, file: File) => void;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

function validateFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return 'Unsupported file type. Use JPG, PNG, WEBP, GIF, or AVIF.';
  if (file.size > 20 * 1024 * 1024) return 'File too large (max 20 MB).';
  return null;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image.')); };
    img.src = url;
  });
}

export default function ImageImporter({ onImageLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const err = validateFile(file);
    if (err) { setError(err); return; }
    try {
      const img = await loadImageFromFile(file);
      onImageLoaded(img, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error loading image.');
    }
  }, [onImageLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  return (
    <div
      className={`importer${dragging ? ' importer--drag' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Import image"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        style={{ display: 'none' }}
        onChange={onInputChange}
      />
      <div className="importer__icon">↑</div>
      <p className="importer__label">Drop an image here or click to browse</p>
      <p className="importer__hint">JPG · PNG · WEBP · GIF · AVIF · max 20 MB</p>
      {error && <p className="importer__error">{error}</p>}
    </div>
  );
}
