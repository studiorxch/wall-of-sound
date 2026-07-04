import React, { useCallback, useRef, useState } from 'react';
import type { ColorlabPalette, HarmonyMode } from '../types/colorlab';
import type { ColorlabSwatch } from '../types/colorlab';
import {
  generateRandom,
  generateFromSeed,
  generateHarmony,
  regenerateUnlocked,
} from '../lib/paletteGenerators';
import { makePalette, savePalette } from '../lib/colorlabStorage';
import ImageImporter from './ImageImporter';
import ImageCanvas from './ImageCanvas';
import type { ColorSelector, CleanupMode, SourceCandidatesRecord, CleanupPayload } from '../types/palette';
import {
  createNormalizedBuffer,
  extractCandidates,
  makeExtractionSettings,
  makeDeduplicationKey,
  ENGINE_VERSION,
  DETERMINISTIC_SEED,
  TARGET_RESOLUTION,
} from '../lib/colorExtraction';
import { runCleanup } from '../lib/paletteCleanup';
import { createSourceCandidates } from '../lib/paletteStorage';
import { CANDIDATE_TIER_COUNTS } from '../types/palette';

type CreateMode = 'random' | 'seed' | 'harmony' | 'manual' | 'image';

const HARMONY_MODES: { value: HarmonyMode; label: string }[] = [
  { value: 'complementary',    label: 'Complementary' },
  { value: 'analogous',        label: 'Analogous' },
  { value: 'triadic',          label: 'Triadic' },
  { value: 'tetradic',         label: 'Tetradic' },
  { value: 'split_complementary', label: 'Split Comp' },
  { value: 'monochrome',       label: 'Monochrome' },
];

const MODE_LABELS: Record<CreateMode, string> = {
  random: 'Random',
  seed: 'Seed Color',
  harmony: 'Harmony',
  manual: 'Manual',
  image: 'From Image',
};

interface Props {
  onSaved: () => void;
}

async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return 'sha256:' + Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeThumbnail(canvas: HTMLCanvasElement): string {
  const t = document.createElement('canvas');
  const scale = Math.min(120 / canvas.width, 120 / canvas.height, 1);
  t.width = Math.round(canvas.width * scale);
  t.height = Math.round(canvas.height * scale);
  t.getContext('2d')?.drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.6);
}

export default function PaletteGeneratorPanel({ onSaved }: Props) {
  const [mode, setMode] = useState<CreateMode>('random');
  const [count, setCount] = useState(5);
  const [swatches, setSwatches] = useState<ColorlabSwatch[]>(() =>
    generateRandom(5).map(hex => ({ id: crypto.randomUUID(), hex, locked: false }))
  );
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed mode
  const [seedHex, setSeedHex] = useState('#4a90d9');
  const seedPickerRef = useRef<HTMLInputElement>(null);

  // Harmony mode
  const [harmonyMode, setHarmonyMode] = useState<HarmonyMode>('complementary');
  const [harmonyBase, setHarmonyBase] = useState('#6c63ff');
  const harmonyPickerRef = useRef<HTMLInputElement>(null);

  // Image extraction
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSelectors, setImageSelectors] = useState<ColorSelector[]>([]);
  const [imageSourceRecord, setImageSourceRecord] = useState<SourceCandidatesRecord | null>(null);
  const [imageCleanupPayload, setImageCleanupPayload] = useState<CleanupPayload | null>(null);
  const [cleanupMode, setCleanupMode] = useState<CleanupMode>('balanced');
  const [extractStatus, setExtractStatus] = useState('');
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const generateSwatches = useCallback((newMode: CreateMode, c: number) => {
    if (newMode === 'random') {
      setSwatches(generateRandom(c).map(hex => ({ id: crypto.randomUUID(), hex, locked: false })));
    } else if (newMode === 'seed') {
      setSwatches(generateFromSeed(seedHex, c).map(hex => ({ id: crypto.randomUUID(), hex, locked: false })));
    } else if (newMode === 'harmony') {
      setSwatches(generateHarmony(harmonyBase, harmonyMode, c).map(hex => ({ id: crypto.randomUUID(), hex, locked: false })));
    } else if (newMode === 'manual') {
      setSwatches([{ id: crypto.randomUUID(), hex: '#888888', locked: false }]);
    }
  }, [seedHex, harmonyBase, harmonyMode]);

  const switchMode = useCallback((m: CreateMode) => {
    setMode(m);
    setSaved(false);
    setError(null);
    if (m !== 'image') generateSwatches(m, count);
  }, [count, generateSwatches]);

  const handleRegenerate = useCallback(() => {
    if (mode === 'random') {
      setSwatches(regenerateUnlocked(swatches));
    } else {
      generateSwatches(mode, count);
    }
    setSaved(false);
  }, [mode, swatches, count, generateSwatches]);

  const handleCountChange = useCallback((c: number) => {
    setCount(c);
    generateSwatches(mode, c);
  }, [mode, generateSwatches]);

  const toggleLock = useCallback((id: string) => {
    setSwatches(prev => prev.map(s => s.id === id ? { ...s, locked: !s.locked } : s));
  }, []);

  const addManualSwatch = useCallback(() => {
    setSwatches(prev => [...prev, { id: crypto.randomUUID(), hex: '#888888', locked: false }]);
  }, []);

  const updateManualSwatch = useCallback((id: string, hex: string) => {
    setSwatches(prev => prev.map(s => s.id === id ? { ...s, hex } : s));
  }, []);

  const removeManualSwatch = useCallback((id: string) => {
    setSwatches(prev => prev.filter(s => s.id !== id));
  }, []);

  // Image extraction
  const applyImageCleanup = useCallback((source: SourceCandidatesRecord, cmode: CleanupMode) => {
    const payload = runCleanup(source, cmode, 'pending', 'pending');
    setImageCleanupPayload(payload);
    const initialSelectors: ColorSelector[] = payload.curatedColors.map((c, i) => ({
      id: crypto.randomUUID(),
      x: 0.1 + (i % 4) * 0.25,
      y: 0.25 + Math.floor(i / 4) * 0.5,
      color: c.rgb,
    }));
    setImageSelectors(initialSelectors);
    // Mirror into swatches for the preview strip
    setSwatches(payload.curatedColors.map(c => ({ id: crypto.randomUUID(), hex: c.hex, locked: false })));
  }, []);

  const handleImageLoaded = useCallback(async (img: HTMLImageElement, file: File) => {
    setImage(img);
    setImageSelectors([]);
    setImageSourceRecord(null);
    setImageCleanupPayload(null);
    setExtractStatus('Hashing…');
    try {
      const contentHash = await hashFile(file);
      setExtractStatus('Normalizing…');
      const normalizedBuffer = createNormalizedBuffer(img, TARGET_RESOLUTION);
      const thumbnail = makeThumbnail(normalizedBuffer);
      setExtractStatus('Extracting…');
      const candidateCount = CANDIDATE_TIER_COUNTS.medium;
      const provisionalSettings = makeExtractionSettings(candidateCount, 0);
      const { candidateColors, samplingCount } = extractCandidates(normalizedBuffer, provisionalSettings);
      const finalSettings = makeExtractionSettings(candidateCount, samplingCount);
      const dedupKey = makeDeduplicationKey(contentHash, finalSettings);
      const now = Date.now();
      const id = crypto.randomUUID();
      const record: SourceCandidatesRecord = {
        id, source_candidates_ref: id, lifecycleState: 'SOURCE_CANDIDATES',
        dedupKey,
        sourceImage: { filename: file.name, width: img.naturalWidth, height: img.naturalHeight, mimeType: file.type, contentHash, frameIndex: 0 },
        provenance: {
          extractedAt: new Date(now).toISOString(),
          engine: { version: ENGINE_VERSION, hashAlgorithm: 'sha256' },
          deterministicSeed: DETERMINISTIC_SEED,
          normalization: { targetResolution: TARGET_RESOLUTION, colorSpace: 'RGBA_8BIT', alphaHandling: 'EXCLUDE_ALPHA_LT_255' },
          sampling: { samplingMode: 'step', samplingCount },
        },
        extraction: { method: 'dominant_cluster', candidateCount },
        candidateColors, extractedAt: now, thumbnail,
      };
      const { record: sealed } = await createSourceCandidates(record);
      setImageSourceRecord(sealed);
      setExtractStatus('');
      applyImageCleanup(sealed, cleanupMode);
    } catch {
      setExtractStatus('Extraction failed');
    }
  }, [cleanupMode, applyImageCleanup]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setError('Please name your palette.'); return; }
    const activeSwatches = mode === 'image'
      ? (imageCleanupPayload?.curatedColors.map(c => ({ id: crypto.randomUUID(), hex: c.hex, locked: false })) ?? [])
      : swatches;
    if (activeSwatches.length === 0) { setError('Add at least one color.'); return; }

    setSaving(true);
    setError(null);
    try {
      const sourceType = mode === 'image' ? 'image_extracted' :
                         mode === 'seed' ? 'seed_color' :
                         mode === 'harmony' ? 'harmony' :
                         mode === 'manual' ? 'manual' : 'generated';
      const p = makePalette(name.trim(), activeSwatches.map(s => s.hex), sourceType);
      await savePalette(p);
      setSaved(true);
      setName('');
      setError(null);
      onSaved();
    } catch {
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  }, [name, mode, swatches, imageCleanupPayload, onSaved]);

  const previewSwatches = mode === 'image'
    ? (imageCleanupPayload?.curatedColors.map((c, i) => ({ id: `img-${i}`, hex: c.hex, locked: false })) ?? [])
    : swatches;

  return (
    <div className="gen-panel">
      {/* Mode tabs */}
      <div className="gen-panel__modes">
        {(Object.keys(MODE_LABELS) as CreateMode[]).map(m => (
          <button
            key={m}
            className={`mode-btn${mode === m ? ' mode-btn--active' : ''}`}
            onClick={() => switchMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="gen-panel__body">
        {/* Controls per mode */}
        {mode === 'random' && (
          <div className="gen-panel__controls">
            <div className="gen-panel__control-row">
              <span className="gen-panel__control-label">Colors</span>
              <div className="gen-panel__size-btns">
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    className={`mode-btn${count === n ? ' mode-btn--active' : ''}`}
                    onClick={() => handleCountChange(n)}
                  >{n}</button>
                ))}
              </div>
            </div>
            <button className="btn btn--ghost" onClick={handleRegenerate}>Regenerate unlocked</button>
          </div>
        )}

        {mode === 'seed' && (
          <div className="gen-panel__controls">
            <div className="gen-panel__control-row">
              <span className="gen-panel__control-label">Seed color</span>
              <div
                className="gen-panel__color-pick"
                style={{ background: seedHex }}
                onClick={() => seedPickerRef.current?.click()}
              >
                <input ref={seedPickerRef} type="color" value={seedHex}
                  className="gen-panel__hidden-picker"
                  onChange={e => setSeedHex(e.target.value)} />
              </div>
              <input
                className="gen-panel__hex-input"
                value={seedHex}
                onChange={e => setSeedHex(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="gen-panel__control-row">
              <span className="gen-panel__control-label">Colors</span>
              <div className="gen-panel__size-btns">
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <button key={n} className={`mode-btn${count === n ? ' mode-btn--active' : ''}`}
                    onClick={() => handleCountChange(n)}>{n}</button>
                ))}
              </div>
            </div>
            <button className="btn btn--ghost"
              onClick={() => setSwatches(generateFromSeed(seedHex, count).map(hex => ({ id: crypto.randomUUID(), hex, locked: false })))}>
              Generate
            </button>
          </div>
        )}

        {mode === 'harmony' && (
          <div className="gen-panel__controls">
            <div className="gen-panel__control-row">
              <span className="gen-panel__control-label">Base color</span>
              <div
                className="gen-panel__color-pick"
                style={{ background: harmonyBase }}
                onClick={() => harmonyPickerRef.current?.click()}
              >
                <input ref={harmonyPickerRef} type="color" value={harmonyBase}
                  className="gen-panel__hidden-picker"
                  onChange={e => setHarmonyBase(e.target.value)} />
              </div>
            </div>
            <div className="gen-panel__harmony-modes">
              {HARMONY_MODES.map(hm => (
                <button
                  key={hm.value}
                  className={`mode-btn${harmonyMode === hm.value ? ' mode-btn--active' : ''}`}
                  onClick={() => setHarmonyMode(hm.value)}
                >
                  {hm.label}
                </button>
              ))}
            </div>
            <div className="gen-panel__control-row">
              <span className="gen-panel__control-label">Colors</span>
              <div className="gen-panel__size-btns">
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <button key={n} className={`mode-btn${count === n ? ' mode-btn--active' : ''}`}
                    onClick={() => handleCountChange(n)}>{n}</button>
                ))}
              </div>
            </div>
            <button className="btn btn--ghost"
              onClick={() => setSwatches(generateHarmony(harmonyBase, harmonyMode, count).map(hex => ({ id: crypto.randomUUID(), hex, locked: false })))}>
              Generate
            </button>
          </div>
        )}

        {mode === 'manual' && (
          <div className="gen-panel__controls">
            <div className="gen-panel__manual-swatches">
              {swatches.map(s => (
                <div key={s.id} className="gen-panel__manual-row">
                  <div className="gen-panel__color-pick" style={{ background: s.hex }}
                    onClick={() => document.getElementById(`mpick-${s.id}`)?.click()}>
                    <input
                      id={`mpick-${s.id}`}
                      type="color"
                      value={s.hex}
                      className="gen-panel__hidden-picker"
                      onChange={e => updateManualSwatch(s.id, e.target.value)}
                    />
                  </div>
                  <input
                    className="gen-panel__hex-input"
                    value={s.hex}
                    onChange={e => updateManualSwatch(s.id, e.target.value)}
                    spellCheck={false}
                  />
                  <button className="icon-btn icon-btn--danger"
                    onClick={() => removeManualSwatch(s.id)}
                    disabled={swatches.length <= 1}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn btn--ghost btn--sm" onClick={addManualSwatch}>+ Add color</button>
          </div>
        )}

        {mode === 'image' && (
          <div className="gen-panel__image-flow">
            {!image ? (
              <ImageImporter onImageLoaded={handleImageLoaded} />
            ) : (
              <>
                {extractStatus && <p className="extraction-status">{extractStatus}</p>}
                <div className="gen-panel__image-canvas">
                  <ImageCanvas
                    image={image}
                    selectors={imageSelectors}
                    onSelectorsChange={setImageSelectors}
                    canvasRef={imageCanvasRef}
                  />
                </div>
                <div className="gen-panel__cleanup-modes">
                  <span className="gen-panel__control-label">Cleanup</span>
                  {(['balanced', 'cinematic', 'neon', 'lo_fi', 'infrastructure'] as CleanupMode[]).map(m => (
                    <button
                      key={m}
                      className={`mode-btn${cleanupMode === m ? ' mode-btn--active' : ''}`}
                      onClick={() => {
                        setCleanupMode(m);
                        if (imageSourceRecord) applyImageCleanup(imageSourceRecord, m);
                      }}
                    >{m}</button>
                  ))}
                </div>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => { setImage(null); setImageSourceRecord(null); setImageCleanupPayload(null); }}
                >
                  ← New image
                </button>
              </>
            )}
          </div>
        )}

        {/* Swatch preview (non-image modes, or post-extraction) */}
        {(mode !== 'image' || previewSwatches.length > 0) && (
          <div className="gen-panel__preview">
            <div className="gen-panel__strip">
              {previewSwatches.map(s => (
                <div
                  key={s.id}
                  className={`gen-panel__strip-swatch${s.locked ? ' gen-panel__strip-swatch--locked' : ''}`}
                  style={{ background: s.hex }}
                  onClick={() => mode !== 'image' && toggleLock(s.id)}
                  title={`${s.hex}${s.locked ? ' (locked)' : ' — click to lock'}`}
                >
                  {s.locked && <span className="gen-panel__lock-icon">🔒</span>}
                </div>
              ))}
            </div>
            <div className="gen-panel__hex-row">
              {previewSwatches.map(s => (
                <span key={s.id} className="gen-panel__hex-label">{s.hex.toUpperCase()}</span>
              ))}
            </div>
          </div>
        )}

        {/* Save */}
        <div className="gen-panel__save">
          <input
            className="gen-panel__name-input"
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false); }}
            placeholder="Name this palette…"
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
          {error && <p className="gen-panel__error">{error}</p>}
          {saved && <p className="gen-panel__success">Saved to library</p>}
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save to Library'}
          </button>
        </div>
      </div>
    </div>
  );
}
