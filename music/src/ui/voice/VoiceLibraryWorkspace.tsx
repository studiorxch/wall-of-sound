import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PlaybackStatus } from "../../data/playbackTypes";
import type {
  SpeechProviderDescriptor,
  SpeechProviderVoiceOption,
  SpeechProviderVoicePresentation,
  VoiceAsset,
  VoiceGroup,
  VoiceIdentity,
  VoiceLibraryPreferences,
  VoiceProfile,
  VoicePresentation,
} from "../../data/voiceLibraryTypes";
import { pickAudioFiles } from "../../logic/audioImport";
import { createVoiceImportDraft, importVoiceFiles, type VoiceImportDraft } from "../../logic/voice/voiceImport";
import { applyVoiceAssetDeletion } from "../../logic/voice/voiceLineage";
import { editVoiceAssetMetadata } from "../../logic/voice/voiceAssetMetadata";
import { deleteVoiceFileOnDisk, revealVoiceFileInFinder } from "../../logic/voice/voiceFileClient";
import {
  buildGeneratedVoiceAsset,
  fetchSpeechProviderVoices,
  fetchSpeechProviders,
  generateProviderVoicePreview,
  generateSpeechPreview,
  saveGeneratedVoiceAudio,
} from "../../logic/voice/voiceGenerationService";
import {
  VOICE_COLUMN_REGISTRY,
  VOICE_COLOR_TOKENS,
  createVoiceGroup,
  createVoiceProfile,
} from "../../logic/voice/voiceLibraryState";
import {
  buildVoiceDisplayContext,
  buildVoiceFilterOptions,
  cycleVoiceSort,
  filterVoiceAssets,
  applyVoiceSort,
} from "../../logic/voice/voiceLibraryView";
import { isVoiceTextEditingTarget } from "../../logic/voice/voiceKeyboard";
import { formatProviderVoiceLanguage, formatProviderVoiceRegion, providerVoiceLocaleSearchText } from "../../logic/voice/providerVoiceLocale";
import { positionVoicePopover } from "../../logic/voice/voicePopoverPosition";
import {
  clearLibrarySelection,
  emptyLibrarySelectionState,
  extendLibrarySelectionFromFocus,
  moveLibraryFocus,
  resolvePointerSelect,
  resolveSelectAllVisible,
  toggleFocusedLibrarySelection,
} from "../../logic/library/librarySelection";
import { isVoiceRowControlTarget, voiceRowSelectionModifiers } from "../../logic/voice/voiceRowSelection";
import { VoiceColumnsPanel } from "./VoiceColumnsPanel";

interface VoiceLibraryWorkspaceProps {
  assets: VoiceAsset[];
  groups: VoiceGroup[];
  profiles: VoiceProfile[];
  preferences: VoiceLibraryPreferences;
  onSaveAssets: (next: VoiceAsset[]) => void;
  onSaveGroups: (next: VoiceGroup[]) => void;
  onSaveProfiles: (next: VoiceProfile[]) => void;
  onUpdatePreferences: (next: VoiceLibraryPreferences) => void;
  auditionTrackId: string | null;
  playbackStatus: PlaybackStatus;
  onAuditionExternal: (meta: { trackId: string; title: string; artist: string; bpm?: number; camelotKey?: string; energy?: number }, audioUrl: string) => void;
  onPauseTrack: () => void;
  onResumeTrack: () => void;
}

type VoicePage = "library" | "generate";

type EditorMode = "create" | "edit";
type EditableVoiceMetadataField = "name" | "text";

interface VoiceMetadataEditor {
  assetId: string;
  field: EditableVoiceMetadataField;
  name: string;
  text: string;
  error: string | null;
}

const COLOR_TOKEN_STYLES: Record<string, string> = {
  slate: "#8a94a6",
  sky: "#64b5f6",
  amber: "#f6b04c",
  green: "#6fcf97",
  rose: "#f07a9c",
  violet: "#9b7df5",
  teal: "#39b8b0",
  orange: "#f28c48",
  blue: "#5d8dff",
  pink: "#ff7fb9",
};

const SOURCE_OPTIONS: Array<{ value: VoiceAsset["source"]; label: string }> = [
  { value: "imported", label: "Imported" },
  { value: "ableton", label: "Ableton" },
  { value: "firefly", label: "Firefly" },
  { value: "recorded", label: "Recorded" },
  { value: "other", label: "Other" },
];

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "0:00";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function measureAudioBlobDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const audio = document.createElement("audio");
    return await new Promise((resolve) => {
      audio.preload = "metadata";
      audio.src = url;
      audio.onloadedmetadata = () => resolve(Math.max(0, Math.round(audio.duration * 1000)));
      audio.onerror = () => resolve(0);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function colorValue(token: string | null): string {
  if (!token) return "rgba(255,255,255,0.18)";
  return COLOR_TOKEN_STYLES[token] ?? token;
}

function VoiceChip({ label, colorToken }: { label: string; colorToken: string | null }) {
  return (
    <span className="voice-chip" style={{ borderColor: colorValue(colorToken), color: colorValue(colorToken) }}>
      {label}
    </span>
  );
}

function RatingCell({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  return (
    <span className="star-rating" data-voice-row-control onClick={(event) => event.stopPropagation()}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button key={n} className={`star-btn${(value ?? 0) >= n ? " filled" : ""}`} onClick={() => onChange(value === n ? null : n)}>★</button>
      ))}
    </span>
  );
}

interface GroupEditorProps {
  groups: VoiceGroup[];
  onSave: (next: VoiceGroup[]) => void;
  onClose: () => void;
}

function GroupEditorDialog({ groups, onSave, onClose }: GroupEditorProps) {
  const [mode, setMode] = useState<EditorMode>("create");
  const [selectedId, setSelectedId] = useState<string>(groups[0]?.id ?? "");
  const [name, setName] = useState("");
  const [colorToken, setColorToken] = useState<string | null>(VOICE_COLOR_TOKENS[0]);

  function loadGroup(group: VoiceGroup | undefined) {
    setName(group?.name ?? "");
    setColorToken(group?.colorToken ?? VOICE_COLOR_TOKENS[0]);
  }

  function saveGroup() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === "create") {
      onSave([...groups, createVoiceGroup({ name: trimmed, colorToken })]);
      setName("");
      setColorToken(VOICE_COLOR_TOKENS[0]);
      return;
    }
    onSave(groups.map((group) => (group.id === selectedId ? { ...group, name: trimmed, colorToken, updatedAt: new Date().toISOString() } : group)));
  }

  return (
    <div className="npw-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="npw-modal voice-modal">
        <div className="npw-header">
          <div className="npw-header-title">Groups</div>
          <button className="npw-close" onClick={onClose}>✕</button>
        </div>
        <div className="voice-form-grid">
          <label>Mode
            <select value={mode} onChange={(event) => {
              const nextMode = event.target.value as EditorMode;
              setMode(nextMode);
              if (nextMode === "edit") {
                const fallbackId = selectedId || groups[0]?.id || "";
                setSelectedId(fallbackId);
                loadGroup(groups.find((group) => group.id === fallbackId));
                return;
              }
              setName("");
              setColorToken(VOICE_COLOR_TOKENS[0]);
            }}>
              <option value="create">Create</option>
              <option value="edit">Edit</option>
            </select>
          </label>
          {mode === "edit" && (
            <label>Existing Group
              <select value={selectedId} onChange={(event) => {
                const nextId = event.target.value;
                setSelectedId(nextId);
                loadGroup(groups.find((group) => group.id === nextId));
              }}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
          )}
          <label>Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>Color
            <select value={colorToken ?? ""} onChange={(event) => setColorToken(event.target.value || null)}>
              <option value="">None</option>
              {VOICE_COLOR_TOKENS.map((token) => <option key={token} value={token}>{token}</option>)}
            </select>
          </label>
        </div>
        <div className="npw-actions">
          <button className="npw-btn npw-btn--ghost" onClick={onClose}>Close</button>
          <button className="npw-btn npw-btn--primary" onClick={saveGroup}>{mode === "create" ? "Add Group" : "Save Group"}</button>
        </div>
      </div>
    </div>
  );
}

interface ProfileEditorProps {
  profiles: VoiceProfile[];
  providers: SpeechProviderDescriptor[];
  providerVoices: SpeechProviderVoiceOption[];
  providerAdapterId: string;
  onSave: (next: VoiceProfile[]) => void;
  onCreated: (profile: VoiceProfile) => void;
  onClose: () => void;
}

const PROVIDER_PREVIEW_FALLBACK = "StudioRich VOICE library. Your next sound begins here.";
type ProviderVoicePresentationFilter = "all" | Exclude<SpeechProviderVoicePresentation, "unknown">;

const PROVIDER_VOICE_PRESENTATION_FILTERS: Array<{ id: ProviderVoicePresentationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
  { id: "neutral_other", label: "Neutral / Other" },
];

function ProviderVoiceBrowser({ providerVoices, providerId, selectedVoiceId, onSelect }: {
  providerVoices: SpeechProviderVoiceOption[];
  providerId: string;
  selectedVoiceId: string;
  onSelect: (voice: SpeechProviderVoiceOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [presentationFilter, setPresentationFilter] = useState<ProviderVoicePresentationFilter>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const filteredVoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return providerVoices.filter((voice) => {
      const matchesPresentation = presentationFilter === "all"
        || voice.presentation === presentationFilter
        || (presentationFilter === "neutral_other" && (voice.presentation == null || voice.presentation === "unknown"));
      return matchesPresentation && (!normalized || `${voice.label} ${providerVoiceLocaleSearchText(voice.language)}`.toLowerCase().includes(normalized));
    });
  }, [presentationFilter, providerVoices, query]);
  const languageGroups = useMemo(() => {
    const grouped = new Map<string, SpeechProviderVoiceOption[]>();
    for (const voice of filteredVoices) {
      const key = formatProviderVoiceLanguage(voice.language);
      grouped.set(key, [...(grouped.get(key) ?? []), voice]);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [filteredVoices]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl) return;
    previewAudioRef.current?.play().catch(() => {
      setPreviewError("Preview is ready, but autoplay was blocked. Use the player controls to listen.");
    });
  }, [previewUrl]);

  async function previewVoice(voice: SpeechProviderVoiceOption) {
    setPreviewingId(voice.id);
    setPreviewError(null);
    try {
      const preview = await generateProviderVoicePreview(providerId, voice.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(preview.audioData));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewingId(null);
    }
  }

  return (
    <div className="voice-provider-browser">
      <div className="voice-provider-browser__presentation" role="group" aria-label="Voice presentation">
        {PROVIDER_VOICE_PRESENTATION_FILTERS.map((filter) => (
          <button key={filter.id} type="button" className={`tb-btn sm${presentationFilter === filter.id ? " active" : ""}`} aria-pressed={presentationFilter === filter.id} onClick={() => { setPresentationFilter(filter.id); setActiveIndex(0); }}>
            {filter.label}
          </button>
        ))}
      </div>
      <label>Provider Voice
        <input
          aria-label="Search provider voices"
          value={query}
          placeholder="Search name or locale"
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(0, filteredVoices.length - 1))); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
            if (event.key === "Enter" && filteredVoices[activeIndex]) { event.preventDefault(); onSelect(filteredVoices[activeIndex]); }
          }}
        />
      </label>
      <div className="voice-provider-browser__list" role="listbox" aria-label="Provider voices">
        {languageGroups.map(([language, voices]) => (
          <div key={language} className="voice-provider-browser__group">
            <div className="voice-provider-browser__locale">{language}</div>
            {voices.map((voice) => {
              const index = filteredVoices.indexOf(voice);
              const selected = voice.id === selectedVoiceId;
              return (
                <div key={voice.id} className={`voice-provider-browser__row${selected ? " selected" : ""}${index === activeIndex ? " active" : ""}`} role="option" aria-selected={selected}>
                  <button type="button" className="voice-provider-browser__select" onClick={() => onSelect(voice)}>
                    <strong>{voice.label}</strong>
                    <span>{formatProviderVoiceRegion(voice.language)}</span>
                  </button>
                  <button type="button" className="voice-provider-browser__preview" aria-label={`Preview ${voice.label}`} title={`Preview ${voice.label}`} onClick={() => { void previewVoice(voice); }} disabled={previewingId === voice.id || !providerId}>
                    {previewingId === voice.id ? "…" : "▶"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {filteredVoices.length === 0 && <div className="voice-provider-browser__empty">No provider voices match this search.</div>}
      </div>
      {previewingId && <div className="voice-provider-browser__status" role="status">Generating temporary preview...</div>}
      {previewUrl && <audio ref={previewAudioRef} className="voice-provider-browser__audio" controls src={previewUrl} onError={() => setPreviewError("The provider returned audio that could not be played.")} />}
      {previewError && <div className="voice-error">{previewError}</div>}
      <div className="voice-provider-browser__hint">Preview phrase: {PROVIDER_PREVIEW_FALLBACK}</div>
    </div>
  );
}

function ProfileColorSwatches({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  return (
    <div className="voice-color-swatches" role="group" aria-label="Profile color">
      <button type="button" title="No color" aria-label="No color" className={`voice-color-swatch${value == null ? " selected" : ""}`} onClick={() => onChange(null)} aria-pressed={value == null}>
        <span className="voice-color-swatch__dot voice-color-swatch__dot--none" />{value == null && <span className="voice-color-swatch__check" aria-hidden="true">✓</span>}
      </button>
      {VOICE_COLOR_TOKENS.map((token) => (
        <button key={token} type="button" title={token} aria-label={`${token} color`} className={`voice-color-swatch${value === token ? " selected" : ""}`} onClick={() => onChange(token)} aria-pressed={value === token}>
          <span className="voice-color-swatch__dot" style={{ background: colorValue(token) }} />{value === token && <span className="voice-color-swatch__check" aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  );
}

function ProfileEditorDialog({ profiles, providers, providerVoices, providerAdapterId, onSave, onCreated, onClose }: ProfileEditorProps) {
  const [mode, setMode] = useState<EditorMode>("create");
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.id ?? "");
  const [name, setName] = useState("");
  const [colorToken, setColorToken] = useState<string | null>(VOICE_COLOR_TOKENS[0]);
  const [identity, setIdentity] = useState<VoiceIdentity | "">("");
  const [customIdentityLabel, setCustomIdentityLabel] = useState("");
  const [presentation, setPresentation] = useState<VoicePresentation | "">("");
  const [language, setLanguage] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerVoiceId, setProviderVoiceId] = useState("");
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");

  function loadProfile(profile: VoiceProfile | undefined) {
    setName(profile?.name ?? "");
    setColorToken(profile?.colorToken ?? VOICE_COLOR_TOKENS[0]);
    setIdentity(profile?.identity ?? "");
    setCustomIdentityLabel(profile?.customIdentityLabel ?? "");
    setPresentation(profile?.presentation ?? "");
    setLanguage(profile?.language ?? "");
    setProviderId(profile?.provider ?? "");
    setProviderVoiceId(profile?.providerVoiceId ?? "");
    setModel(profile?.model ?? "");
    setNotes(profile?.notes ?? "");
  }

  function buildProfile() {
    return {
      name: name.trim(),
      colorToken,
      identity: identity || null,
      customIdentityLabel: identity === "custom" ? (customIdentityLabel.trim() || null) : null,
      presentation: presentation || null,
      language: language.trim() || null,
      provider: providerId || null,
      providerVoiceId: providerVoiceId || null,
      model: model.trim() || null,
      notes: notes.trim() || null,
    };
  }

  function changeMode(nextMode: EditorMode) {
    setMode(nextMode);
    if (nextMode === "edit") {
      const fallbackId = selectedId || profiles[0]?.id || "";
      setSelectedId(fallbackId);
      loadProfile(profiles.find((profile) => profile.id === fallbackId));
      return;
    }
    loadProfile(undefined);
  }

  function saveProfile() {
    if (!name.trim()) return;
    if (mode === "create") {
      const created = createVoiceProfile(buildProfile());
      onSave([...profiles, created]);
      onCreated(created);
      onClose();
      return;
    }
    onSave(
      profiles.map((profile) =>
        profile.id === selectedId
          ? { ...profile, ...buildProfile(), updatedAt: new Date().toISOString() }
          : profile,
      ),
    );
  }

  return (
    <div className="npw-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="npw-modal voice-modal voice-modal--wide voice-profile-modal">
        <div className="npw-header">
          <div className="npw-header-title">Voice Profiles</div>
          <div className="voice-profile-mode" role="group" aria-label="Profile mode">
            <button type="button" className={mode === "create" ? "active" : ""} aria-pressed={mode === "create"} onClick={() => changeMode("create")}>Create</button>
            <button type="button" className={mode === "edit" ? "active" : ""} aria-pressed={mode === "edit"} disabled={profiles.length === 0} onClick={() => changeMode("edit")}>Edit</button>
          </div>
          <button className="npw-close" onClick={onClose}>✕</button>
        </div>
        <div className="voice-form-grid voice-form-grid--two voice-profile-form">
          <div className="voice-profile-top-fields">
            {mode === "edit" && (
              <label className="voice-profile-top-fields__existing">Existing Profile
                <select value={selectedId} onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedId(nextId);
                  loadProfile(profiles.find((profile) => profile.id === nextId));
                }}>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </label>
            )}
            <label className="voice-profile-top-fields__name">Name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>Color
              <ProfileColorSwatches value={colorToken} onChange={setColorToken} />
            </label>
            <label>Provider
              <select value={providerId || providerAdapterId} onChange={(event) => { setProviderId(event.target.value); setProviderVoiceId(""); }}>
                <option value="">Select provider</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.available}>{provider.displayName}{provider.available ? "" : " (Unavailable)"}</option>)}
              </select>
            </label>
          </div>
          <div className="voice-form-grid__full">
            <ProviderVoiceBrowser
              providerVoices={providerVoices}
              providerId={providerId || providerAdapterId}
              selectedVoiceId={providerVoiceId}
              onSelect={(voice) => { setProviderVoiceId(voice.id); setProviderId(providerId || providerAdapterId); setLanguage((current) => current || voice.language || ""); }}
            />
          </div>
        </div>
        <div className="npw-actions">
          <button className="npw-btn npw-btn--ghost" onClick={onClose}>Close</button>
          <button className="npw-btn npw-btn--primary" onClick={saveProfile}>{mode === "create" ? "Add Profile" : "Save Profile"}</button>
        </div>
      </div>
    </div>
  );
}

interface ImportDialogProps {
  drafts: VoiceImportDraft[];
  groups: VoiceGroup[];
  profiles: VoiceProfile[];
  assets: VoiceAsset[];
  onClose: () => void;
  onImport: (nextDrafts: VoiceImportDraft[]) => void;
}

function ImportDialog({ drafts, groups, profiles, assets, onClose, onImport }: ImportDialogProps) {
  const [items, setItems] = useState(drafts);

  function updateDraft(index: number, patch: Partial<VoiceImportDraft>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="npw-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="npw-modal voice-modal voice-modal--wide">
        <div className="npw-header">
          <div className="npw-header-title">Import Voice Assets</div>
          <button className="npw-close" onClick={onClose}>✕</button>
        </div>
        <div className="voice-import-list">
          {items.map((draft, index) => (
            <div key={`${draft.file.name}-${index}`} className="voice-import-card">
              <div className="voice-import-card__title">{draft.file.name}</div>
              <div className="voice-form-grid voice-form-grid--two">
                <label>Name
                  <input value={draft.name} onChange={(event) => updateDraft(index, { name: event.target.value })} />
                </label>
                <label>Source
                  <select value={draft.source} onChange={(event) => {
                    const nextSource = event.target.value as VoiceImportDraft["source"];
                    const label = SOURCE_OPTIONS.find((option) => option.value === nextSource)?.label ?? nextSource;
                    updateDraft(index, { source: nextSource, sourceLabel: label });
                  }}>
                    {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>Group
                  <select value={draft.groupId ?? ""} onChange={(event) => updateDraft(index, { groupId: event.target.value || null })}>
                    <option value="">None</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <label>Voice
                  <select value={draft.voiceProfileId ?? ""} onChange={(event) => updateDraft(index, { voiceProfileId: event.target.value || null })}>
                    <option value="">None</option>
                    {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                  </select>
                </label>
                <label>Variation Of
                  <select value={draft.parentAssetId ?? ""} onChange={(event) => updateDraft(index, { parentAssetId: event.target.value || null })}>
                    <option value="">New asset</option>
                    {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} v{asset.version}</option>)}
                  </select>
                </label>
                <label>Text
                  <input value={draft.text ?? ""} onChange={(event) => updateDraft(index, { text: event.target.value || null })} placeholder="Optional transcript" />
                </label>
                <label className="voice-form-grid__full">Notes
                  <textarea value={draft.notes ?? ""} onChange={(event) => updateDraft(index, { notes: event.target.value || null })} rows={2} />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="npw-actions">
          <button className="npw-btn npw-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="npw-btn npw-btn--primary" onClick={() => onImport(items)}>Save to Library</button>
        </div>
      </div>
    </div>
  );
}

export function VoiceLibraryWorkspace({
  assets,
  groups,
  profiles,
  preferences,
  onSaveAssets,
  onSaveGroups,
  onSaveProfiles,
  onUpdatePreferences,
  auditionTrackId,
  playbackStatus,
  onAuditionExternal,
  onPauseTrack,
  onResumeTrack,
}: VoiceLibraryWorkspaceProps) {
  const [page, setPage] = useState<VoicePage>("library");
  const [searchText, setSearchText] = useState("");
  const [selection, setSelection] = useState(emptyLibrarySelectionState());
  const [showColumns, setShowColumns] = useState(false);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [pendingImportDrafts, setPendingImportDrafts] = useState<VoiceImportDraft[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [metadataEditor, setMetadataEditor] = useState<VoiceMetadataEditor | null>(null);
  const ignoreMetadataBlurRef = useRef(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<"group" | "voice" | null>(null);
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const [providers, setProviders] = useState<SpeechProviderDescriptor[]>([]);
  const [providerVoices, setProviderVoices] = useState<SpeechProviderVoiceOption[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [generateForm, setGenerateForm] = useState({
    providerId: "",
    voiceProfileId: "",
    name: "",
    text: "",
    groupId: "",
    parentAssetId: "",
    notes: "",
  });
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    blob: Blob;
    url: string;
    providerId: string;
    provider: string;
    providerVoiceId: string | null;
    model: string | null;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    if (page !== "generate" && !showProfileEditor) return;
    fetchSpeechProviders()
      .then((nextProviders) => {
        setProviders(nextProviders);
        setProvidersError(null);
        if (!generateForm.providerId && nextProviders[0]) {
          setGenerateForm((current) => ({ ...current, providerId: nextProviders[0].id }));
        }
      })
      .catch((error) => {
        setProvidersError(error instanceof Error ? error.message : String(error));
      });
  }, [page, showProfileEditor, generateForm.providerId]);

  useEffect(() => {
    const providerId = generateForm.providerId || providers[0]?.id;
    if (!providerId) return;
    fetchSpeechProviderVoices(providerId)
      .then((voices) => setProviderVoices(voices))
      .catch(() => setProviderVoices([]));
  }, [generateForm.providerId, providers]);

  useEffect(() => {
    function dismissFilter(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".voice-filter-menu, .voice-filter-button")) setOpenFilterMenu(null);
    }
    document.addEventListener("mousedown", dismissFilter);
    return () => document.removeEventListener("mousedown", dismissFilter);
  }, []);

  const context = useMemo(() => buildVoiceDisplayContext(groups, profiles), [groups, profiles]);
  const visibleAssets = useMemo(
    () => applyVoiceSort(filterVoiceAssets(assets, searchText, preferences.filters, context), preferences.sort, context),
    [assets, searchText, preferences.filters, preferences.sort, context],
  );
  const visibleIds = useMemo(() => visibleAssets.map((asset) => asset.id), [visibleAssets]);
  const selectedAssets = useMemo(() => assets.filter((asset) => selection.selectedIds.has(asset.id)), [assets, selection.selectedIds]);
  const filterOptions = useMemo(() => buildVoiceFilterOptions(assets, groups, profiles), [assets, groups, profiles]);
  const visibleColumns = useMemo(
    () =>
      preferences.columnOrder.filter(
        (id) => preferences.columns.find((column) => column.id === id)?.visible ?? false,
      ),
    [preferences.columnOrder, preferences.columns],
  );
  const currentPreviewProfile = profiles.find((profile) => profile.id === generateForm.voiceProfileId) ?? null;

  function updatePreferenceFilters(next: VoiceLibraryPreferences["filters"]) {
    onUpdatePreferences({ ...preferences, filters: next, updatedAt: new Date().toISOString() });
  }

  function handleRowClick(assetId: string, event: React.MouseEvent) {
    if (isVoiceRowControlTarget(event.target)) return;
    setSelection((current) => resolvePointerSelect(current, assetId, visibleIds, voiceRowSelectionModifiers(event.nativeEvent)));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isVoiceTextEditingTarget(event.target)) return;
    if (event.key === "Escape" && openFilterMenu) {
      event.preventDefault();
      setOpenFilterMenu(null);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection((current) => resolveSelectAllVisible(current, visibleIds));
      return;
    }
    if (event.key === "Escape") {
      setSelection((current) => clearLibrarySelection(current));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelection((current) => event.shiftKey ? extendLibrarySelectionFromFocus(current, visibleIds, 1) : moveLibraryFocus(current, visibleIds, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelection((current) => event.shiftKey ? extendLibrarySelectionFromFocus(current, visibleIds, -1) : moveLibraryFocus(current, visibleIds, -1));
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      setSelection((current) => toggleFocusedLibrarySelection(current));
    }
  }

  function openLibraryPlayback(asset: VoiceAsset) {
    const groupName = asset.groupId ? (groups.find((group) => group.id === asset.groupId)?.name ?? "Voice") : "Voice";
    const voiceName = asset.voiceProfileId ? (profiles.find((profile) => profile.id === asset.voiceProfileId)?.name ?? groupName) : groupName;
    onAuditionExternal({ trackId: asset.id, title: asset.name, artist: voiceName }, `/music-audio/${asset.filePath}`);
  }

  async function beginImport() {
    const files = await pickAudioFiles();
    if (files.length === 0) return;
    const defaultParent = selectedAssets.length === 1 ? selectedAssets[0].id : null;
    setPendingImportDrafts(files.map((file) => createVoiceImportDraft(file, defaultParent)));
  }

  async function commitImport(nextDrafts: VoiceImportDraft[]) {
    setImportBusy(true);
    try {
      const result = await importVoiceFiles(nextDrafts, assets);
      if (result.imported.length > 0) onSaveAssets([...assets, ...result.imported]);
      setPendingImportDrafts(null);
      if (result.failed.length > 0) {
        setWorkspaceNotice(result.failed.map((failure) => `${failure.fileName}: ${failure.error}`).join(" | "));
      } else {
        setWorkspaceNotice(`Saved ${result.imported.length} voice asset${result.imported.length === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setWorkspaceNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setImportBusy(false);
    }
  }

  async function handleDelete(deleteFiles: boolean) {
    const ids = deleteTargetIds ?? [];
    if (ids.length === 0) return;
    const targets = assets.filter((asset) => ids.includes(asset.id));
    const errors: string[] = [];
    if (deleteFiles) {
      for (const asset of targets) {
        const result = await deleteVoiceFileOnDisk(asset.filePath);
        if (!result.ok) errors.push(`${asset.fileName}: ${result.reason ?? "delete_failed"}`);
      }
    }
    const deletion = applyVoiceAssetDeletion(assets, ids);
    onSaveAssets(deletion.assets);
    setDeleteTargetIds(null);
    setSelection(emptyLibrarySelectionState());
    setWorkspaceNotice(errors.length > 0 ? `Removed library records. File delete issues: ${errors.join(" | ")}` : `Removed ${ids.length} voice asset${ids.length === 1 ? "" : "s"}.`);
  }

  async function handleReveal(filePath: string) {
    const result = await revealVoiceFileInFinder(filePath);
    setWorkspaceNotice(result.ok ? "Revealed file in Finder." : `Couldn't reveal file: ${result.reason ?? "unknown_error"}.`);
  }

  function updateAsset(assetId: string, patch: Partial<VoiceAsset>) {
    onSaveAssets(assets.map((asset) => (asset.id === assetId ? { ...asset, ...patch, updatedAt: new Date().toISOString() } : asset)));
  }

  function beginMetadataEdit(asset: VoiceAsset, field: EditableVoiceMetadataField) {
    setMetadataEditor({ assetId: asset.id, field, name: asset.name, text: asset.text ?? "", error: null });
  }

  function cancelMetadataEdit() {
    setMetadataEditor(null);
  }

  function updateMetadataEditor(field: EditableVoiceMetadataField, value: string) {
    setMetadataEditor((current) => current ? { ...current, [field]: value, error: null } : current);
  }

  function handleMetadataEditorKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitMetadataEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      ignoreMetadataBlurRef.current = true;
      cancelMetadataEdit();
    }
  }

  function handleMetadataEditorBlur() {
    if (ignoreMetadataBlurRef.current) {
      ignoreMetadataBlurRef.current = false;
      return;
    }
    commitMetadataEdit();
  }

  function commitMetadataEdit() {
    if (!metadataEditor) return;
    const asset = assets.find((candidate) => candidate.id === metadataEditor.assetId);
    if (!asset) { setMetadataEditor(null); return; }
    const result = editVoiceAssetMetadata(asset, metadataEditor);
    if (!result.ok) {
      setMetadataEditor((current) => current ? { ...current, error: result.error } : current);
      return;
    }
    onSaveAssets(assets.map((candidate) => candidate.id === asset.id ? result.asset : candidate));
    setMetadataEditor(null);
  }

  function applyBulkPatch(patch: Partial<VoiceAsset>) {
    const ids = new Set(selectedAssets.map((asset) => asset.id));
    onSaveAssets(assets.map((asset) => (ids.has(asset.id) ? { ...asset, ...patch, updatedAt: new Date().toISOString() } : asset)));
  }

  function exportSelectedCsv() {
    const lines = [
      "name,text,duration_ms,rating,group,voice,source,provider,model,file_name,file_path,version,created_at,updated_at",
      ...selectedAssets.map((asset) => [
        JSON.stringify(asset.name),
        JSON.stringify(asset.text ?? ""),
        asset.durationMs,
        asset.rating ?? "",
        JSON.stringify(asset.groupId ? (groups.find((group) => group.id === asset.groupId)?.name ?? "") : ""),
        JSON.stringify(asset.voiceProfileId ? (profiles.find((profile) => profile.id === asset.voiceProfileId)?.name ?? "") : ""),
        asset.source,
        JSON.stringify(asset.provider ?? ""),
        JSON.stringify(asset.model ?? ""),
        JSON.stringify(asset.fileName),
        JSON.stringify(asset.filePath),
        asset.version,
        asset.createdAt,
        asset.updatedAt,
      ].join(",")),
    ];
    downloadTextFile("voice-library-selection.csv", lines.join("\n"));
  }

  async function runGeneratePreview() {
    if (!currentPreviewProfile) {
      setGenerateError("Choose a voice profile first.");
      return;
    }
    setGenerateBusy(true);
    setGenerateError(null);
    try {
      const generated = await generateSpeechPreview(
        generateForm.providerId,
        { text: generateForm.text, voiceProfileId: currentPreviewProfile.id },
        currentPreviewProfile,
      );
      if (preview?.url) URL.revokeObjectURL(preview.url);
      const url = URL.createObjectURL(generated.audioData);
      setPreview({
        blob: generated.audioData,
        url,
        providerId: generateForm.providerId,
        provider: generated.provider,
        providerVoiceId: generated.providerVoiceId,
        model: generated.model,
      });
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerateBusy(false);
    }
  }

  async function savePreviewToLibrary() {
    if (!preview || !currentPreviewProfile) return;
    try {
      const fileNameBase = (generateForm.name.trim() || generateForm.text.trim().slice(0, 32) || "voice-preview")
        .replace(/[^\w -]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase();
      const fileName = `${fileNameBase || "voice-preview"}.wav`;
      const savedAudio = await saveGeneratedVoiceAudio(preview.blob, fileName);
      const durationMs = await measureAudioBlobDuration(preview.blob);
      const nextAsset = buildGeneratedVoiceAsset(
        assets,
        savedAudio,
        currentPreviewProfile,
        {
          audioData: preview.blob,
          mimeType: preview.blob.type,
          provider: preview.provider,
          providerVoiceId: preview.providerVoiceId,
          model: preview.model,
        },
        {
          name: generateForm.name.trim() || currentPreviewProfile.name,
          text: generateForm.text,
          durationMs,
          groupId: generateForm.groupId || null,
          parentAssetId: generateForm.parentAssetId || null,
          notes: generateForm.notes || null,
        },
      );
      onSaveAssets([...assets, nextAsset]);
      setWorkspaceNotice(`Saved generated asset "${nextAsset.name}" to VOICE.`);
      setPage("library");
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : String(error));
    }
  }

  function toggleFilterValue(kind: "groupIds" | "voiceProfileIds", value: string) {
    const current = preferences.filters[kind];
    const exists = current.includes(value);
    updatePreferenceFilters({
      ...preferences.filters,
      [kind]: exists ? current.filter((item) => item !== value) : [...current, value],
    });
  }

  function openPropertyFilter(columnId: "group" | "voice", target: HTMLButtonElement) {
    if (openFilterMenu === columnId) {
      setOpenFilterMenu(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    setFilterPopoverPosition(positionVoicePopover(rect, { width: window.innerWidth, height: window.innerHeight }));
    setOpenFilterMenu(columnId);
  }

  const providersAvailable = providers.filter((provider) => provider.available);

  return (
    <div className="voice-workspace" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="lib-breadcrumb">
        <span className="lib-breadcrumb-root lib-breadcrumb-root--static">MUSIC</span>
        <span className="lib-breadcrumb-sep">/</span>
        {page === "library" ? (
          <span className="lib-breadcrumb-root lib-breadcrumb-root--static">VOICE</span>
        ) : (
          <button type="button" className="lib-breadcrumb-root" onClick={() => setPage("library")}>VOICE</button>
        )}
        {page === "generate" && (
          <>
            <span className="lib-breadcrumb-sep">/</span>
            <span className="lib-breadcrumb-page">GENERATE</span>
          </>
        )}
      </div>

      {workspaceNotice && <div className="voice-notice">{workspaceNotice}</div>}

      {page === "library" ? (
        <>
          <div className="voice-toolbar">
            <input
              className="cat-filter-search voice-search"
              placeholder="Search voice library..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <div className="voice-toolbar__actions">
              <button className="tb-btn sm" onClick={() => setShowColumns(true)}>Columns</button>
              <button className="tb-btn sm" onClick={() => setShowGroupEditor(true)}>Groups</button>
              <button className="tb-btn sm" onClick={() => setShowProfileEditor(true)}>Voices</button>
              <button className="tb-btn sm" onClick={() => { void beginImport(); }} disabled={importBusy}>{importBusy ? "Importing..." : "Import"}</button>
              <button className="tb-btn sm" onClick={() => setPage("generate")}>+ Generate</button>
            </div>
          </div>

          {selectedAssets.length > 0 && (
            <div className="voice-selection-bar">
              <span>{selectedAssets.length} selected</span>
              <select value="" onChange={(event) => { if (event.target.value) applyBulkPatch({ groupId: event.target.value || null }); event.target.value = ""; }}>
                <option value="">Group</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <select value="" onChange={(event) => { if (event.target.value || event.target.value === "") applyBulkPatch({ voiceProfileId: event.target.value || null }); event.target.value = ""; }}>
                <option value="">Voice</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
              <select value="" onChange={(event) => {
                if (event.target.value) applyBulkPatch({ rating: Number(event.target.value) });
                event.target.value = "";
              }}>
                <option value="">Rating</option>
                {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}
              </select>
              <button className="tb-btn sm" onClick={exportSelectedCsv}>Export CSV</button>
              <button className="tb-btn sm remove-btn" onClick={() => setDeleteTargetIds(selectedAssets.map((asset) => asset.id))}>Delete</button>
              <button className="tb-btn sm" onClick={() => setSelection(emptyLibrarySelectionState())}>Clear</button>
            </div>
          )}

          <div className="voice-table-wrap">
            <table className="voice-table">
              <thead>
                <tr>
                  {visibleColumns.map((columnId) => {
                    const definition = VOICE_COLUMN_REGISTRY.find((column) => column.id === columnId);
                    if (!definition) return null;
                    const isSorted = preferences.sort?.columnId === columnId;
                    const filterActive = columnId === "group"
                      ? preferences.filters.groupIds.length > 0
                      : columnId === "voice"
                        ? preferences.filters.voiceProfileIds.length > 0
                        : false;
                    return (
                      <th key={columnId} className={`voice-table__header${filterActive ? " voice-table__header--active" : ""}`}>
                        <button
                          type="button"
                          className="voice-header-button"
                          onClick={() => {
                            if (!definition.sortable || columnId === "play") return;
                            onUpdatePreferences({
                              ...preferences,
                              sort: cycleVoiceSort(preferences.sort, columnId),
                              updatedAt: new Date().toISOString(),
                            });
                          }}
                        >
                          {definition.label}
                          {definition.sortable && columnId !== "play" && <span>{isSorted ? (preferences.sort?.direction === "asc" ? " ↑" : " ↓") : " ↕"}</span>}
                        </button>
                        {definition.filterable && (
                          <div className="voice-header-filter">
                            <button
                              type="button"
                              className={`voice-filter-button${filterActive ? " active" : ""}`}
                              onClick={(event) => openPropertyFilter(columnId, event.currentTarget)}
                            >
                              ⌄
                            </button>
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleAssets.map((asset) => {
                  const isSelected = selection.selectedIds.has(asset.id);
                  const isCurrent = auditionTrackId === asset.id;
                  const group = groups.find((item) => item.id === asset.groupId) ?? null;
                  const profile = profiles.find((item) => item.id === asset.voiceProfileId) ?? null;
                  const editingName = metadataEditor?.assetId === asset.id && metadataEditor.field === "name";
                  const editingText = metadataEditor?.assetId === asset.id && metadataEditor.field === "text";
                  return (
                    <tr key={asset.id} className={`${isSelected ? "row-selected " : ""}${isCurrent ? "row-auditioning" : ""}`} onClick={(event) => handleRowClick(asset.id, event)}>
                      {visibleColumns.map((columnId) => (
                        <td key={`${asset.id}-${columnId}`}>
                          {columnId === "play" ? (
                            <button
                              className={`tb-btn sm col-play-btn${isCurrent ? " tb-btn-playing" : ""}`}
                              data-voice-row-control
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isCurrent && playbackStatus === "playing") onPauseTrack();
                                else if (isCurrent && playbackStatus === "paused") onResumeTrack();
                                else openLibraryPlayback(asset);
                              }}
                            >
                              {isCurrent && playbackStatus === "playing" ? "⏸" : "▶"}
                            </button>
                          ) : columnId === "name" ? (
                            <div className="voice-name-cell">
                              {editingName ? (
                                <span className="voice-inline-editor" data-voice-row-control>
                                  <input
                                    autoFocus
                                    aria-label={`Edit name for ${asset.name}`}
                                    value={metadataEditor.name}
                                    onChange={(event) => updateMetadataEditor("name", event.target.value)}
                                    onKeyDown={handleMetadataEditorKeyDown}
                                    onBlur={handleMetadataEditorBlur}
                                  />
                                  {metadataEditor.error && <small role="alert">{metadataEditor.error}</small>}
                                </span>
                              ) : (
                                <span className="voice-editable-cell" title="Double-click to edit name" onDoubleClick={(event) => { event.stopPropagation(); beginMetadataEdit(asset, "name"); }}>{asset.name}</span>
                              )}
                              <span className="voice-row-actions">
                                <button type="button" className="tb-btn sm" data-voice-row-control onClick={(event) => { event.stopPropagation(); beginMetadataEdit(asset, "name"); }}>Edit</button>
                                <button type="button" className="tb-btn sm" data-voice-row-control onClick={(event) => { event.stopPropagation(); void handleReveal(asset.filePath); }}>Reveal</button>
                                <button type="button" className="tb-btn sm remove-btn" data-voice-row-control onClick={(event) => { event.stopPropagation(); setDeleteTargetIds([asset.id]); }}>Delete</button>
                              </span>
                            </div>
                          ) : columnId === "text" ? (
                            editingText ? (
                              <span className="voice-inline-editor" data-voice-row-control>
                                <input
                                  autoFocus
                                  aria-label={`Edit text for ${asset.name}`}
                                  placeholder="Add transcript"
                                  value={metadataEditor.text}
                                  onChange={(event) => updateMetadataEditor("text", event.target.value)}
                                  onKeyDown={handleMetadataEditorKeyDown}
                                  onBlur={handleMetadataEditorBlur}
                                />
                                {metadataEditor.error && <small role="alert">{metadataEditor.error}</small>}
                              </span>
                            ) : (
                              <span className="voice-cell-truncate voice-editable-cell" title="Double-click to edit text" onDoubleClick={(event) => { event.stopPropagation(); beginMetadataEdit(asset, "text"); }}>{asset.text ?? "—"}</span>
                            )
                          ) : columnId === "duration" ? (
                            formatDuration(asset.durationMs)
                          ) : columnId === "rating" ? (
                            <RatingCell value={asset.rating} onChange={(value) => updateAsset(asset.id, { rating: value })} />
                          ) : columnId === "group" ? (
                            group ? <VoiceChip label={group.name} colorToken={group.colorToken} /> : "—"
                          ) : columnId === "voice" ? (
                            profile ? <VoiceChip label={profile.name} colorToken={profile.colorToken} /> : "—"
                          ) : columnId === "source" ? (
                            asset.sourceLabel ?? asset.source
                          ) : columnId === "version" ? (
                            `v${asset.version}`
                          ) : columnId === "provider" ? (
                            asset.provider ?? "—"
                          ) : columnId === "model" ? (
                            asset.model ?? "—"
                          ) : columnId === "created" ? (
                            new Date(asset.createdAt).toLocaleDateString()
                          ) : columnId === "modified" ? (
                            new Date(asset.updatedAt).toLocaleDateString()
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleAssets.length === 0 && <div className="voice-empty">No voice assets match the current search and filters.</div>}
          </div>
        </>
      ) : (
        <div className="voice-generate">
          <div className="voice-generate__actions">
            <button className="tb-btn sm" onClick={() => setPage("library")}>Back to Library</button>
            <button className="tb-btn sm" onClick={() => setShowProfileEditor(true)}>Manage Voices</button>
          </div>
          {providersError && <div className="voice-error">{providersError}</div>}
          {providersAvailable.length === 0 && (
            <div className="voice-error">
              {providers[0]?.reasonUnavailable ?? "No speech provider is configured."}
            </div>
          )}
          <div className="voice-form-grid voice-form-grid--two">
            <label>Script
              <textarea value={generateForm.text} onChange={(event) => setGenerateForm((current) => ({ ...current, text: event.target.value }))} rows={5} />
            </label>
            <div className="voice-form-grid__stack">
              <label>Voice Profile
                <select value={generateForm.voiceProfileId} onChange={(event) => setGenerateForm((current) => ({ ...current, voiceProfileId: event.target.value, name: current.name || profiles.find((profile) => profile.id === event.target.value)?.name || "" }))}>
                  <option value="">Select profile</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </label>
              <label>Provider
                <select value={generateForm.providerId} onChange={(event) => setGenerateForm((current) => ({ ...current, providerId: event.target.value }))}>
                  <option value="">Select provider</option>
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}{provider.available ? "" : " (Unavailable)"}</option>)}
                </select>
              </label>
              <label>Name
                <input value={generateForm.name} onChange={(event) => setGenerateForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>Group
                <select value={generateForm.groupId} onChange={(event) => setGenerateForm((current) => ({ ...current, groupId: event.target.value }))}>
                  <option value="">None</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label>Variation Of
                <select value={generateForm.parentAssetId} onChange={(event) => setGenerateForm((current) => ({ ...current, parentAssetId: event.target.value }))}>
                  <option value="">New asset</option>
                  {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} v{asset.version}</option>)}
                </select>
              </label>
              <label>Notes
                <textarea value={generateForm.notes} onChange={(event) => setGenerateForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
              </label>
            </div>
          </div>
          <div className="voice-generate__buttons">
            <button className="npw-btn npw-btn--primary" disabled={generateBusy || !providersAvailable.length} onClick={() => { void runGeneratePreview(); }}>
              {generateBusy ? "Generating..." : "Generate"}
            </button>
          </div>
          {generateError && <div className="voice-error">{generateError}</div>}
          {preview && (
            <div className="voice-preview">
              <div className="voice-preview__meta">
                Preview
                {preview.provider ? ` • ${preview.provider}` : ""}
                {preview.providerVoiceId ? ` • ${preview.providerVoiceId}` : ""}
              </div>
              <audio controls src={preview.url} />
              <button className="npw-btn npw-btn--primary" onClick={() => { void savePreviewToLibrary(); }}>Save to Library</button>
            </div>
          )}
        </div>
      )}

      {showColumns && (
        <VoiceColumnsPanel
          preferences={preferences}
          onUpdate={onUpdatePreferences}
          onClose={() => setShowColumns(false)}
        />
      )}
      {showGroupEditor && <GroupEditorDialog groups={groups} onSave={onSaveGroups} onClose={() => setShowGroupEditor(false)} />}
      {showProfileEditor && (
        <ProfileEditorDialog
          profiles={profiles}
          providers={providers}
          providerVoices={providerVoices}
          providerAdapterId={generateForm.providerId || providersAvailable[0]?.id || ""}
          onSave={onSaveProfiles}
          onCreated={(profile) => setGenerateForm((current) => ({
            ...current,
            voiceProfileId: profile.id,
            name: current.name || profile.name,
            providerId: current.providerId || profile.provider || providersAvailable[0]?.id || "",
          }))}
          onClose={() => setShowProfileEditor(false)}
        />
      )}
      {pendingImportDrafts && (
        <ImportDialog
          drafts={pendingImportDrafts}
          groups={groups}
          profiles={profiles}
          assets={assets}
          onClose={() => setPendingImportDrafts(null)}
          onImport={(nextDrafts) => { void commitImport(nextDrafts); }}
        />
      )}
      {deleteTargetIds && (
        <div className="npw-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTargetIds(null); }}>
          <div className="npw-modal voice-modal">
            <div className="npw-header">
              <div className="npw-header-title">Remove Voice Assets</div>
              <button className="npw-close" onClick={() => setDeleteTargetIds(null)}>✕</button>
            </div>
            <div className="voice-delete-copy">
              Remove {deleteTargetIds.length} voice asset{deleteTargetIds.length === 1 ? "" : "s"}?
            </div>
            <div className="npw-actions voice-delete-actions">
              <button className="npw-btn npw-btn--ghost" onClick={() => setDeleteTargetIds(null)}>Cancel</button>
              <button className="npw-btn" onClick={() => { void handleDelete(false); }}>Remove Records</button>
              <button className="npw-btn npw-btn--primary" onClick={() => { void handleDelete(true); }}>Remove Records + Audio Files</button>
            </div>
          </div>
        </div>
      )}
      {openFilterMenu && filterPopoverPosition && createPortal(
        <div
          className="voice-filter-menu voice-filter-menu--portal"
          style={{ left: filterPopoverPosition.left, top: filterPopoverPosition.top, maxHeight: filterPopoverPosition.maxHeight }}
          role="dialog"
          aria-label={`${openFilterMenu === "group" ? "Group" : "Voice"} filters`}
        >
          {(openFilterMenu === "group" ? filterOptions.groups : filterOptions.voices).map((option) => (
            <label key={option.id} className="voice-filter-menu__row">
              <input
                type="checkbox"
                checked={(openFilterMenu === "group" ? preferences.filters.groupIds : preferences.filters.voiceProfileIds).includes(option.id)}
                onChange={() => toggleFilterValue(openFilterMenu === "group" ? "groupIds" : "voiceProfileIds", option.id)}
              />
              <VoiceChip label={`${option.label} (${option.count})`} colorToken={option.colorToken} />
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
