import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { reserveRadioLoopId, releaseReservation } from './server/radio/radioIdAssigner'
import { createStagingOperation, cleanupStagingOperation, stagingOperationExists, stagingOperationDir } from './server/radio/radioStagingFs'
import { encodeOpusToFile } from './server/radio/radioOpusEncoder'
import { probeOpusFile } from './server/radio/radioAudioProbe'
import { validateAndFinalizePackage } from './server/radio/radioFinalizeOrchestrator'
import { regenerateManifestOnDisk, readCurrentManifest } from './server/radio/radioManifestBuilder'
import { resolveRadioAsset } from './server/radio/radioAssetServer'
import { readPackageMetadata } from './server/radio/radioPackageMetadata'
import { revealPackageInFinder } from './server/radio/radioPackageReveal'
import { reviseRadioLoopMetadata, type MetadataEditRequest } from './server/radio/radioMetadataRevisionOrchestrator'
import { retireRadioLoop } from './server/radio/radioRetirementOrchestrator'
import { scanRadioLoopVersions } from './server/radio/radioPackageVersionIndex'
import { scanLibraryIndex } from './server/radio/radioLibraryIndex'
import type { RadioApprovalMetadata, RadioArrangementMetadata, RadioLoopSourceReference, RadioMusicalMetadata } from './src/data/radioLoopTypes'
// 0718B_RADIO_Web_Publication_Asset_Export_Bridge
import { sha256File } from './server/radio/radioVersionCloneHelper'
import { isPathConfinedTo } from './server/radio/radioFsUtils'
import { prepareTrackPackage } from './server/radio/radioTrackPackagePipeline'
import { verifyTrackBinding } from './server/radio/radioTrackVerify'
import { trackPackageVersionDir } from './server/radio/radioTrackPackageWriter'
import { readCurrentTrackManifest } from './server/radio/radioTrackManifestBuilder'
import { exportWebBundle, listBundleVersions } from './server/radio/radioWebBundleWriter'
import { validateWebBundle } from './server/radio/radioWebBundleValidator'
import { revealDirectoryInFinder } from './server/radio/radioPackageReveal'
import type { RadioTrackPrepareRequest } from './src/data/radioTrackPackageTypes'
import type { RadioWebBundleExportRequest } from './src/data/radioWebBundleTypes'
// 0722C_MUSIC_Production_Stem_Export
import { reconcileAbandonedStemStaging } from './server/stems/stemStartupReconciliation'
import { checkStemEngine } from './server/stems/stemEngineCheck'
import { stemJobRegistry } from './server/stems/stemJobRegistry'
import { scanStemSetsForTrack, classifyStemSetsForTrack, hasAnyStemSets } from './server/stems/stemSetIndex'
import { trackStemLibraryRoot, safeStemDirName } from './server/stems/stemFsUtils'
import { createStagingOperation as createStemStagingOperation, cleanupStagingOperation as cleanupStemStagingOperation, stagingOperationDir as stemStagingOperationDir } from './server/stems/stemStagingFs'
import { registerExistingStemSet } from './server/stems/stemSalvageOrchestrator'
import { stageLegacyStemFiles } from './server/stems/stemLegacyMigration'
import { resolveTrackSourcePath } from './server/stems/stemFsUtils'
import { sha256File as sha256FileForStems } from './server/radio/radioVersionCloneHelper'
import type { StemRole } from './src/data/trackStemTypes'
// 0812_MUSIC_Suno-Library-Manifest-Integration_v1.0.0 — the server route
// reuses the exact same pure adapter/resolver the client and its tests use
// (music/src/logic/sunoLibrary/), so "which recording resolves to which
// file" can never disagree between what the UI shows and what the server
// actually serves.
import { importSunoLibraryManifests } from './src/logic/sunoLibrary/manifestAdapter'
import {
  resolvePlaybackLocation,
  indexEncodedLocationsById,
  indexCanonicalRecordingsById,
} from './src/logic/sunoLibrary/canonicalIdentity'
import type { ManifestSourceTexts } from './src/logic/sunoLibrary/manifestValidation'
import type { SunoEncodedLocation, SunoCanonicalRecording } from './src/data/sunoLibraryTypes'

interface RadioStagingCreateBody {
  sourceTrackId?: string
  sourceLoopId?: string
}

interface RadioFinalizeBody {
  operationId?: string
  radioLoopId?: string
  packageVersion?: number
  sourceReference?: RadioLoopSourceReference
  musical?: RadioMusicalMetadata
  arrangement?: RadioArrangementMetadata
  approval?: RadioApprovalMetadata
  startedAt?: string
}

interface RadioReviseMetadataBody {
  radioLoopId?: string
  sourcePackageVersion?: number
  title?: string
  roles?: string[]
  energy?: number
  density?: number
  stability?: number
  maximumConsecutiveRepeats?: number
  minimumRestCycles?: number
  transitionIn?: string[]
  transitionOut?: string[]
  publicUseApproved?: boolean
}

interface RadioRetireBody {
  radioLoopId?: string
  reason?: string
}

interface RadioRevealBody {
  radioLoopId?: string
  packageVersion?: number
}

// 0718B_RADIO_Web_Publication_Asset_Export_Bridge
interface RadioTrackSourceHashBody {
  audioRelPath?: string
}

interface RadioWebBundleRevealBody {
  slug?: string
  bundleVersion?: number
}

// 0722C_MUSIC_Production_Stem_Export
interface StemExportStartBody {
  trackId?: string
  audioRelPath?: string
}
interface StemExportCancelBody {
  jobId?: string
}
interface StemSetRevealBody {
  trackId?: string
  stemSetId?: string
}
interface StemRegisterExistingBody {
  operationId?: string
  trackId?: string
  audioRelPath?: string
  roleAssignments?: Record<string, string>
  confirmed?: boolean
  origin?: 'registered_existing'
  engineNotes?: string
}
interface StemLegacyMigrateBody {
  trackId?: string
  audioRelPath?: string
  legacyAudioRelPaths?: Record<string, string>
}
interface StemBadgesBody {
  tracks?: { trackId?: string; audioRelPath?: string }[]
}

// Library root: PLAY_LIBRARY_ROOT env var → else <project-root>/library/music
// Vite cwd is music/, so '../library/music' resolves to the project-root music library.
const LIBRARY_ROOT = process.env.PLAY_LIBRARY_ROOT
  ? path.resolve(process.env.PLAY_LIBRARY_ROOT)
  : path.resolve(process.cwd(), '../library/music')

// RadioLoop Library Foundation (0716B) — recommended location per
// 0716_RADIO_RadioLoop_Library_README_v1.0.0.md §2. Inherits LIBRARY_ROOT's
// existing configurability (PLAY_LIBRARY_ROOT) rather than adding a second
// env var; never sent to the browser as a raw path (see /radio-library-status).
const RADIO_LIBRARY_ROOT = path.join(LIBRARY_ROOT, 'RadioLoopLibrary')

// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — sibling roots, same
// LIBRARY_ROOT configurability. RadioTrackLibrary holds immutable
// full-track Opus packages (the required baseline web asset);
// RadioWebExports holds immutable, versioned, self-contained LOCAL export
// bundles — nothing under either root is ever uploaded or deployed.
const RADIO_TRACK_LIBRARY_ROOT = path.join(LIBRARY_ROOT, 'RadioTrackLibrary')
const RADIO_WEB_EXPORT_ROOT = path.join(LIBRARY_ROOT, 'RadioWebExports')

// 0722C_MUSIC_Production_Stem_Export — fourth sibling root, same
// LIBRARY_ROOT configurability. Holds immutable, versioned, per-track
// Demucs/salvaged stem sets — never source audio, never a top-level track.
const TRACK_STEM_LIBRARY_ROOT = trackStemLibraryRoot(LIBRARY_ROOT)

// 0811_MACHINE-LIFE_MUSIC-Research-Workspace-Handoff_v1.0.0 — read-only
// mirror root for the Machine Life Research workspace's manifest+proxy
// import. NOT under LIBRARY_ROOT (WOS Share is a separate mirror, never a
// second canonical audio archive); MACHINE_LIFE_MIRROR_ROOT env var override
// follows the same configurability precedent as PLAY_LIBRARY_ROOT above.
// Vite cwd is music/, so '../WOS-share/MACHINE_LIFE' resolves to the
// repo-root WOS Share mirror. Server-resolved only — the browser never holds
// this absolute path in persisted state (see /machine-life-mirror-root,
// which returns it for one-time, in-memory use during an import operation
// only, the same pattern /library-root already uses for LIBRARY_ROOT).
const MACHINE_LIFE_MIRROR_ROOT = process.env.MACHINE_LIFE_MIRROR_ROOT
  ? path.resolve(process.env.MACHINE_LIFE_MIRROR_ROOT)
  : path.resolve(process.cwd(), '../WOS-share/MACHINE_LIFE')

// 0812_MUSIC_Suno-Library-Manifest-Integration_v1.0.0 ------------------------
// SUNO_ARCHIVE_ROOT is the external, possibly-disconnected archive holding
// the immutable 00_ACQUISITION/ source (never exposed) and the derived,
// read-only 01_EXTRACTED_MIRROR/ (the ONLY tree ever served to the
// browser). Sibling to wall-of-sound under Projects/, not nested inside it
// — same env-var-override-else-relative-default pattern as
// MACHINE_LIFE_MIRROR_ROOT above.
const SUNO_ARCHIVE_ROOT = process.env.SUNO_ARCHIVE_ROOT
  ? path.resolve(process.env.SUNO_ARCHIVE_ROOT)
  : path.resolve(process.cwd(), '../../SUNO_ARCHIVE')
const SUNO_EXTRACTED_MIRROR_ROOT = path.join(SUNO_ARCHIVE_ROOT, '01_EXTRACTED_MIRROR')
// The lightweight WOS Share authority mirror — five small JSON manifests,
// never audio. Confined route below only ever serves these five whitelisted
// filenames, never an arbitrary path.
const SUNO_LIBRARY_WOS_SHARE_ROOT = process.env.SUNO_LIBRARY_WOS_SHARE_ROOT
  ? path.resolve(process.env.SUNO_LIBRARY_WOS_SHARE_ROOT)
  : path.resolve(process.cwd(), '../WOS-share/SUNO_LIBRARY')
const SUNO_LIBRARY_MANIFEST_NAMES = new Set([
  'suno-acquisition-snapshot.json',
  'suno-audio-inventory.json',
  'suno-duplicate-groups.json',
  'suno-supplemental-assets.json',
  'suno-sync-checkpoint.json',
])

const SUPPORTED_AUDIO = new Set(['.mp3', '.wav', '.aiff', '.aif', '.flac', '.m4a', '.ogg', '.opus'])
const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg; codecs=opus',
}

function mediaError(res: any, status: number, errorType: string, message: string) {
  res.statusCode = status
  res.setHeader('X-Media-Error', errorType)
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Access-Control-Expose-Headers', 'X-Media-Error')
  res.end(message)
}

function resolveFsPath(p: string): string {
  // Absolute paths used as-is; relative paths resolved from cwd (project root)
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}

// 0812_MUSIC_Suno-Library-Manifest-Integration_v1.0.0 ------------------------
// Lazily-built, server-lifetime cache of the parsed WOS Share Suno
// manifests, so /suno-library-audio doesn't re-parse ~29MB of JSON on every
// request. The manifests are static authority files that only change when a
// new acquisition build runs (a rare, explicit operator action) — no
// file-watching invalidation is implemented; restart the dev server after a
// new snapshot is published. Built once, on first request that needs it.
interface SunoManifestIndex {
  snapshotId: string
  locationsById: Map<string, SunoEncodedLocation>
  canonicalById: Map<string, SunoCanonicalRecording>
}
let sunoManifestIndexCache: SunoManifestIndex | null = null

function loadSunoManifestIndex(): SunoManifestIndex | null {
  if (sunoManifestIndexCache) return sunoManifestIndexCache
  const dir = path.join(SUNO_LIBRARY_WOS_SHARE_ROOT, 'MANIFESTS')
  const readOrNull = (name: string): string | null => {
    const p = path.join(dir, name)
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null
  }
  const sources: ManifestSourceTexts = {
    acquisitionSnapshot: readOrNull('suno-acquisition-snapshot.json'),
    audioInventory: readOrNull('suno-audio-inventory.json'),
    duplicateGroups: readOrNull('suno-duplicate-groups.json'),
    supplementalAssets: readOrNull('suno-supplemental-assets.json'),
    syncCheckpoint: readOrNull('suno-sync-checkpoint.json'),
  }
  const result = importSunoLibraryManifests(sources)
  if (result.status === 'BLOCKED') return null
  sunoManifestIndexCache = {
    snapshotId: result.snapshot.snapshotId,
    locationsById: indexEncodedLocationsById(result.encodedLocations),
    canonicalById: indexCanonicalRecordingsById(result.canonicalRecordings),
  }
  return sunoManifestIndexCache
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))) }
      catch (parseError) { reject(parseError) }
    })
    req.on('error', reject)
  })
}

// Correction (plan review): bounded request-size guard for binary uploads
// (WAV bytes posted to /radio-encode-opus). 300MB is far beyond any
// realistic lossless loop WAV; this exists purely as a defensive ceiling,
// not a tuned limit.
const RADIO_MAX_UPLOAD_BYTES = 300 * 1024 * 1024

function readBoundedBinaryBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let aborted = false
    req.on('data', (chunk: Buffer) => {
      if (aborted) return
      total += chunk.length
      if (total > maxBytes) {
        aborted = true
        req.destroy()
        reject(Object.assign(new Error('payload_too_large'), { code: 'PAYLOAD_TOO_LARGE' }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { if (!aborted) resolve(Buffer.concat(chunks)) })
    req.on('error', (e: Error) => { if (!aborted) reject(e) })
  })
}

function radioJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Exposed to browser code as a global constant — use __LIBRARY_ROOT__ in src/
    __LIBRARY_ROOT__: JSON.stringify(LIBRARY_ROOT),
  },
  server: {
    proxy: {
      // 0729_STUDIORICH_Centralized_Library_MAPS_Integration — proxies to
      // Wall's own dev server (.claude/launch.json 'wall-of-sound', port
      // 5500) so pages under /wall-app/* are same-origin with MUSIC. This is
      // what lets the centralized Library's palette bridge and Wall's real
      // Broadcast runtime share one localStorage — no code duplication, no
      // second authority, nothing under wall/ is modified. A production
      // deployment needs an equivalent same-origin reverse-proxy rule
      // wherever this app and wall/ are actually hosted.
      '/wall-app': {
        target: process.env.WALL_ORIGIN || 'http://localhost:5500',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/wall-app/, ''),
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'local-media-server',
      configureServer(server) {
        // 0722C_MUSIC_Production_Stem_Export — reconcile any stem-export
        // staging left behind by a prior dev-server process (a restart
        // mid-job) BEFORE any route can be hit. Never promotes anything it
        // finds; only marks it "interrupted" so the job-status API can
        // surface it distinctly instead of it looking stuck "processing"
        // forever or silently vanishing.
        reconcileAbandonedStemStaging(TRACK_STEM_LIBRARY_ROOT)

        // /music-audio/<relPath> — serve audio files from the library root.
        // Track records store audioRelPath = "catalog/audio/foo.flac"; this
        // route resolves it to LIBRARY_ROOT/catalog/audio/foo.flac.
        server.middlewares.use('/music-audio', (req, res) => {
          const method = (req as any).method as string
          // Strip /music-audio prefix from the URL path
          const rawPath = (req.url ?? '/').replace(/^\/music-audio/, '') || '/'
          // Remove query string if any
          const pathOnly = rawPath.split('?')[0]
          const decoded = decodeURIComponent(pathOnly).replace(/^\/+/, '')

          // Safety: reject any path that contains traversal segments
          if (decoded.split('/').some((seg) => seg === '..' || seg === '.')) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'text/plain')
            res.end('Forbidden')
            return
          }

          const resolved = path.join(LIBRARY_ROOT, decoded)

          // Safety: must stay within LIBRARY_ROOT
          if (!resolved.startsWith(LIBRARY_ROOT + path.sep) && resolved !== LIBRARY_ROOT) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'text/plain')
            res.end('Forbidden')
            return
          }

          const ext = path.extname(resolved).toLowerCase()
          if (!SUPPORTED_AUDIO.has(ext)) {
            mediaError(res, 415, 'UNSUPPORTED_EXT', `Unsupported extension: ${ext}`)
            return
          }

          if (!fs.existsSync(resolved)) {
            mediaError(res, 404, 'FILE_MISSING', `File not found: ${resolved}`)
            return
          }

          let stat: fs.Stats
          try { stat = fs.statSync(resolved) } catch {
            mediaError(res, 500, 'STAT_ERROR', `Cannot stat: ${resolved}`); return
          }
          if (!stat.isFile()) {
            mediaError(res, 400, 'NOT_A_FILE', `Not a file: ${resolved}`); return
          }

          const mime = MIME[ext] ?? 'audio/mpeg'
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (method === 'HEAD') {
            res.setHeader('Content-Length', stat.size)
            res.statusCode = 200
            res.end()
            return
          }

          const range = (req as any).headers.range as string | undefined
          if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1
            const chunkSize = end - start + 1
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
            res.setHeader('Content-Length', chunkSize)
            const stream = fs.createReadStream(resolved, { start, end })
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          } else {
            res.statusCode = 200
            res.setHeader('Content-Length', stat.size)
            const stream = fs.createReadStream(resolved)
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          }
        })

        // RADIO Web Playback Vertical Slice — /radio-web-export/<slug>/v<N>/<...>
        // Static, path-confined serving of an already-exported, immutable
        // Web Bundle (radioWebBundleWriter.ts's own output under
        // RADIO_WEB_EXPORT_ROOT). This is the one missing connection
        // between "Export Web Bundle" and any page that wants to actually
        // play a published RADIO station: the export route only ever wrote
        // to local disk; nothing served those files over HTTP before this.
        // Same traversal/confinement/Range handling as /music-audio above,
        // extended with JSON for the manifest/playlist/checksums files.
        server.middlewares.use('/radio-web-export', (req: IncomingMessage, res: ServerResponse) => {
          const method = req.method
          const rawPath = (req.url ?? '/').replace(/^\/radio-web-export/, '') || '/'
          const pathOnly = rawPath.split('?')[0]
          const decoded = decodeURIComponent(pathOnly).replace(/^\/+/, '')

          if (decoded.split('/').some((seg) => seg === '..' || seg === '.')) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'text/plain')
            res.end('Forbidden')
            return
          }

          const resolved = path.join(RADIO_WEB_EXPORT_ROOT, decoded)
          if (!resolved.startsWith(RADIO_WEB_EXPORT_ROOT + path.sep) && resolved !== RADIO_WEB_EXPORT_ROOT) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'text/plain')
            res.end('Forbidden')
            return
          }

          const ext = path.extname(resolved).toLowerCase()
          const webMime: Record<string, string> = { ...MIME, '.json': 'application/json' }
          if (!webMime[ext]) {
            mediaError(res, 415, 'UNSUPPORTED_EXT', `Unsupported extension: ${ext}`)
            return
          }

          if (!fs.existsSync(resolved)) {
            mediaError(res, 404, 'FILE_MISSING', `File not found: ${resolved}`)
            return
          }

          let stat: fs.Stats
          try { stat = fs.statSync(resolved) } catch {
            mediaError(res, 500, 'STAT_ERROR', `Cannot stat: ${resolved}`); return
          }
          if (!stat.isFile()) {
            mediaError(res, 400, 'NOT_A_FILE', `Not a file: ${resolved}`); return
          }

          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', webMime[ext])
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (method === 'HEAD') {
            res.setHeader('Content-Length', stat.size)
            res.statusCode = 200
            res.end()
            return
          }

          const range = req.headers.range
          if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1
            const chunkSize = end - start + 1
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
            res.setHeader('Content-Length', chunkSize)
            const stream = fs.createReadStream(resolved, { start, end })
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          } else {
            res.statusCode = 200
            res.setHeader('Content-Length', stat.size)
            const stream = fs.createReadStream(resolved)
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          }
        })

        // /library-root — returns the resolved LIBRARY_ROOT path for debugging
        server.middlewares.use('/library-root', (_req, res) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ root: LIBRARY_ROOT, exists: fs.existsSync(LIBRARY_ROOT) }))
        })

        // 0811_MACHINE-LIFE_MUSIC-Research-Workspace-Handoff_v1.0.0 ---------
        // Read-only routes confined to MACHINE_LIFE_MIRROR_ROOT. Manifest
        // text and directory listings reuse the existing unconfined
        // /library-data and /library-ls routes above (no change needed —
        // both already accept any resolved path); only binary proxy audio
        // needs a new route, since /music-audio is confined to LIBRARY_ROOT.
        // GET only; never writes, deletes, or modifies anything under
        // MACHINE_LIFE_MIRROR_ROOT.

        // GET /machine-life-mirror-root — same "resolved root for one-time
        // client use, never persisted" pattern as /library-root above.
        server.middlewares.use('/machine-life-mirror-root', (_req, res) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ root: MACHINE_LIFE_MIRROR_ROOT, exists: fs.existsSync(MACHINE_LIFE_MIRROR_ROOT) }))
        })

        // GET /machine-life-evidence-data?path=<absolute path under MACHINE_LIFE_MIRROR_ROOT>
        // Serves waveform/spectrogram PNG evidence, confined the same way as
        // /machine-life-audio-data below. Read-only; no Range support needed
        // for small evidence images.
        server.middlewares.use('/machine-life-evidence-data', (req, res) => {
          const method = (req as any).method as string
          if (method !== 'GET' && method !== 'HEAD') {
            res.statusCode = 405; res.end('Method Not Allowed'); return
          }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const requestedPath = url.searchParams.get('path')
          if (!requestedPath) { res.statusCode = 400; res.end('missing path'); return }

          const resolved = path.resolve(requestedPath)
          if (!resolved.startsWith(MACHINE_LIFE_MIRROR_ROOT + path.sep) && resolved !== MACHINE_LIFE_MIRROR_ROOT) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'text/plain')
            res.end('Forbidden')
            return
          }
          const ext = path.extname(resolved).toLowerCase()
          const imageMime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }
          if (!imageMime[ext]) {
            mediaError(res, 415, 'UNSUPPORTED_EXT', `Unsupported extension: ${ext}`)
            return
          }
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            mediaError(res, 404, 'FILE_MISSING', `File not found: ${resolved}`)
            return
          }
          res.setHeader('Content-Type', imageMime[ext])
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (method === 'HEAD') { res.statusCode = 200; res.end(); return }
          res.statusCode = 200
          const stream = fs.createReadStream(resolved)
          stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
          stream.pipe(res)
        })

        // GET /machine-life-audio-data?path=<absolute path under MACHINE_LIFE_MIRROR_ROOT>
        // Range-aware binary streaming, same Content-Range handling as
        // /music-audio, confined to MACHINE_LIFE_MIRROR_ROOT instead of
        // LIBRARY_ROOT. Used only to preview/fetch a Machine Life MP3 proxy
        // for re-upload through the existing /library-import endpoint.
        server.middlewares.use('/machine-life-audio-data', (req, res) => {
          const method = (req as any).method as string
          if (method !== 'GET' && method !== 'HEAD') {
            res.statusCode = 405; res.end('Method Not Allowed'); return
          }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const requestedPath = url.searchParams.get('path')
          if (!requestedPath) { res.statusCode = 400; res.end('missing path'); return }

          const resolved = path.resolve(requestedPath)
          if (!resolved.startsWith(MACHINE_LIFE_MIRROR_ROOT + path.sep) && resolved !== MACHINE_LIFE_MIRROR_ROOT) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'text/plain')
            res.end('Forbidden')
            return
          }

          const ext = path.extname(resolved).toLowerCase()
          if (!SUPPORTED_AUDIO.has(ext)) {
            mediaError(res, 415, 'UNSUPPORTED_EXT', `Unsupported extension: ${ext}`)
            return
          }
          if (!fs.existsSync(resolved)) {
            mediaError(res, 404, 'FILE_MISSING', `File not found: ${resolved}`)
            return
          }
          let stat: fs.Stats
          try { stat = fs.statSync(resolved) } catch {
            mediaError(res, 500, 'STAT_ERROR', `Cannot stat: ${resolved}`); return
          }
          if (!stat.isFile()) {
            mediaError(res, 400, 'NOT_A_FILE', `Not a file: ${resolved}`); return
          }

          const mime = MIME[ext] ?? 'audio/mpeg'
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (method === 'HEAD') {
            res.setHeader('Content-Length', stat.size)
            res.statusCode = 200
            res.end()
            return
          }

          const range = (req as any).headers.range as string | undefined
          if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1
            const chunkSize = end - start + 1
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
            res.setHeader('Content-Length', chunkSize)
            const stream = fs.createReadStream(resolved, { start, end })
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          } else {
            res.statusCode = 200
            res.setHeader('Content-Length', stat.size)
            const stream = fs.createReadStream(resolved)
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          }
        })

        // 0812_MUSIC_Suno-Library-Manifest-Integration_v1.0.0 ---------------
        // Three read-only routes. /suno-library-audio is the security-
        // sensitive one (spec §9.1): it accepts ONLY an opaque, manifest-
        // authorized archive asset ID — never a filesystem path from the
        // browser — and resolves the real file server-side through the same
        // resolvePlaybackLocation() the client and its tests use. Every
        // extractedRelativePath this can ever serve already comes from a
        // SunoEncodedLocation whose path was populated only from
        // zip-batch-member manifest records rooted under
        // 01_EXTRACTED_MIRROR/ — there is no code path here that can
        // construct or resolve to anything under 00_ACQUISITION/.

        // GET /suno-archive-availability — is 01_EXTRACTED_MIRROR/ reachable
        // right now. Never returns the raw archive root path (unlike
        // /library-root/ /machine-life-mirror-root's "resolved root for
        // one-time client use" convention) — the UI only needs online/
        // offline, not the filesystem location, and the audio route below
        // never needs the client to know it either.
        server.middlewares.use('/suno-archive-availability', (_req, res) => {
          const online = fs.existsSync(SUNO_EXTRACTED_MIRROR_ROOT)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ state: online ? 'online' : 'offline', checkedAt: new Date().toISOString() }))
        })

        // GET /suno-library-manifest/<name> — streams one of the five
        // whitelisted WOS Share authority manifests verbatim (never an
        // arbitrary filename, never anything from REPORTS/ or SPECS/, which
        // spec §4 explicitly says must not be parsed as application data).
        server.middlewares.use('/suno-library-manifest', (req: IncomingMessage, res: ServerResponse) => {
          const method = req.method
          if (method !== 'GET' && method !== 'HEAD') {
            res.statusCode = 405; res.end('Method Not Allowed'); return
          }
          const rawPath = (req.url ?? '/').replace(/^\/suno-library-manifest/, '') || '/'
          const name = decodeURIComponent(rawPath.split('?')[0].replace(/^\/+/, ''))
          if (!SUNO_LIBRARY_MANIFEST_NAMES.has(name)) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'unknown_manifest' }))
            return
          }
          const resolved = path.join(SUNO_LIBRARY_WOS_SHARE_ROOT, 'MANIFESTS', name)
          if (!fs.existsSync(resolved)) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'manifest_not_found' }))
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (method === 'HEAD') { res.end(); return }
          const stream = fs.createReadStream(resolved)
          stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
          stream.pipe(res)
        })

        // GET /suno-library-audio/<archiveAssetId> — see route-family
        // comment above. Range-capable, same streaming shape as
        // /music-audio, with an added realpath-based symlink-escape guard
        // that isPathConfinedTo alone does not provide (confirmed during
        // preflight research: isPathConfinedTo is a plain string-prefix
        // check with no fs.realpathSync step anywhere in this codebase).
        server.middlewares.use('/suno-library-audio', (req: IncomingMessage, res: ServerResponse) => {
          const method = req.method
          if (method !== 'GET' && method !== 'HEAD') {
            res.statusCode = 405; res.end('Method Not Allowed'); return
          }

          const rawPath = (req.url ?? '/').replace(/^\/suno-library-audio/, '') || '/'
          const requestedId = decodeURIComponent(rawPath.split('?')[0].replace(/^\/+/, ''))
          // A valid archive asset ID is a single opaque path segment. Any
          // slash, backslash, or traversal token means this is not an ID at
          // all — reject outright rather than let it reach path resolution.
          if (!requestedId || /[\\/]/.test(requestedId) || requestedId === '.' || requestedId === '..') {
            mediaError(res, 400, 'INVALID_ASSET_ID', 'Invalid archive asset ID')
            return
          }

          const index = loadSunoManifestIndex()
          if (!index) {
            mediaError(res, 503, 'MANIFEST_UNAVAILABLE', 'Suno library manifest could not be loaded')
            return
          }

          const resolution = resolvePlaybackLocation(requestedId, index.locationsById, index.canonicalById)
          if (resolution.kind === 'unavailable') {
            mediaError(res, 404, 'ASSET_UNAVAILABLE', 'This recording has no extracted copy available for playback')
            return
          }

          const candidate = path.join(SUNO_EXTRACTED_MIRROR_ROOT, resolution.extractedRelativePath)
          if (!isPathConfinedTo(SUNO_EXTRACTED_MIRROR_ROOT, candidate)) {
            mediaError(res, 403, 'PATH_OUTSIDE_MIRROR', 'Resolved path is outside the extracted mirror')
            return
          }

          let realRoot: string
          let realCandidate: string
          try {
            realRoot = fs.realpathSync(SUNO_EXTRACTED_MIRROR_ROOT)
            realCandidate = fs.realpathSync(candidate)
          } catch {
            mediaError(res, 404, 'FILE_MISSING', `File not found: ${resolution.extractedRelativePath}`)
            return
          }
          if (!isPathConfinedTo(realRoot, realCandidate)) {
            mediaError(res, 403, 'SYMLINK_ESCAPE', 'Resolved path escapes the extracted mirror via a symlink')
            return
          }

          const ext = path.extname(realCandidate).toLowerCase()
          if (!SUPPORTED_AUDIO.has(ext)) {
            mediaError(res, 415, 'UNSUPPORTED_EXT', `Unsupported extension: ${ext}`)
            return
          }

          let stat: fs.Stats
          try { stat = fs.statSync(realCandidate) } catch {
            mediaError(res, 500, 'STAT_ERROR', `Cannot stat: ${resolution.extractedRelativePath}`); return
          }
          if (!stat.isFile()) {
            mediaError(res, 400, 'NOT_A_FILE', `Not a file: ${resolution.extractedRelativePath}`); return
          }

          const mime = MIME[ext] ?? 'audio/mpeg'
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Expose-Headers', 'X-Suno-Playback-Fallback, X-Suno-Playback-Fallback-For')
          if (resolution.kind === 'fallback') {
            // Discloses substitution in the same response the audio comes
            // back on, so the UI doesn't need a second round-trip to know
            // playback used an equivalent encoded location (spec: "The UI
            // must disclose when playback uses an equivalent encoded
            // location").
            res.setHeader('X-Suno-Playback-Fallback', 'true')
            res.setHeader('X-Suno-Playback-Fallback-For', resolution.requestedArchiveAssetId)
          }

          if (method === 'HEAD') {
            res.setHeader('Content-Length', stat.size)
            res.statusCode = 200
            res.end()
            return
          }

          const range = req.headers.range
          if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1
            const chunkSize = end - start + 1
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
            res.setHeader('Content-Length', chunkSize)
            const stream = fs.createReadStream(realCandidate, { start, end })
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          } else {
            res.statusCode = 200
            res.setHeader('Content-Length', stat.size)
            const stream = fs.createReadStream(realCandidate)
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          }
        })

        // /library-data?path=... — read a text file (CSV) from the local filesystem
        server.middlewares.use('/library-data', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const filePath = url.searchParams.get('path')
          if (!filePath) { res.statusCode = 400; res.setHeader('Content-Type', 'text/plain'); res.end(''); return }
          const resolved = resolveFsPath(filePath)
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); res.end(''); return
          }
          try {
            const text = fs.readFileSync(resolved, 'utf-8')
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(text)
          } catch {
            res.statusCode = 500; res.end('')
          }
        })

        // /library-ls?path=... — list audio files in a directory, returns JSON array
        server.middlewares.use('/library-ls', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const dirPath = url.searchParams.get('path')
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (!dirPath) { res.statusCode = 400; res.end('[]'); return }
          const resolved = resolveFsPath(dirPath)
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            res.statusCode = 404; res.end('[]'); return
          }
          try {
            const entries: Array<{name: string; path: string}> = []
            function walk(dir: string, relBase: string) {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name)
                const rel = path.join(relBase, entry.name)
                if (entry.isDirectory()) { walk(full, rel); continue }
                if (SUPPORTED_AUDIO.has(path.extname(entry.name).toLowerCase())) {
                  entries.push({ name: entry.name, path: full })
                }
              }
            }
            walk(resolved, '')
            res.statusCode = 200
            res.end(JSON.stringify(entries))
          } catch {
            res.statusCode = 500; res.end('[]')
          }
        })

        // /library-ls-text?path=...&ext=.md — list text files in a directory (non-recursive, shallow)
        server.middlewares.use('/library-ls-text', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const dirPath = url.searchParams.get('path')
          const ext = url.searchParams.get('ext') ?? '.md'
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (!dirPath) { res.statusCode = 400; res.end('[]'); return }
          const resolved = resolveFsPath(dirPath)
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            res.statusCode = 404; res.end('[]'); return
          }
          try {
            const entries = fs.readdirSync(resolved, { withFileTypes: true })
              .filter((e) => e.isFile() && e.name.endsWith(ext))
              .map((e) => ({ name: e.name, path: path.join(resolved, e.name) }))
            res.statusCode = 200
            res.end(JSON.stringify(entries))
          } catch {
            res.statusCode = 500; res.end('[]')
          }
        })

        // /library-write?path=... — write JSON to a file (POST body = JSON text)
        server.middlewares.use('/library-write', (req, res) => {
          if ((req as any).method !== 'POST') {
            res.statusCode = 405; res.end('Method Not Allowed'); return
          }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const filePath = url.searchParams.get('path')
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (!filePath) { res.statusCode = 400; res.end('{"ok":false}'); return }
          const resolved = resolveFsPath(filePath)
          // Only allow writes inside LIBRARY_ROOT for safety
          if (!resolved.startsWith(LIBRARY_ROOT)) {
            res.statusCode = 403; res.end('{"ok":false}'); return
          }
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf-8')
              // Validate it's valid JSON before writing
              JSON.parse(body)
              fs.mkdirSync(path.dirname(resolved), { recursive: true })
              fs.writeFileSync(resolved, body, 'utf-8')
              res.statusCode = 200
              res.end('{"ok":true}')
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, error: String(e) }))
            }
          })
        })

        // /library-import?filename=<name>&dest=catalog/audio — copy uploaded binary to LIBRARY_ROOT/dest/filename
        server.middlewares.use('/library-import', (req, res) => {
          if ((req as any).method !== 'POST') {
            res.statusCode = 405; res.end('Method Not Allowed'); return
          }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const filename = url.searchParams.get('filename')
          const dest = url.searchParams.get('dest') ?? 'catalog/audio'
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (!filename) { res.statusCode = 400; res.end('{"ok":false,"error":"missing filename"}'); return }
          // Sanitise: no path traversal
          const safeName = path.basename(filename)
          if (!SUPPORTED_AUDIO.has(path.extname(safeName).toLowerCase())) {
            res.statusCode = 415; res.end('{"ok":false,"error":"unsupported extension"}'); return
          }
          const destDir = path.resolve(LIBRARY_ROOT, dest)
          if (!destDir.startsWith(LIBRARY_ROOT)) {
            res.statusCode = 403; res.end('{"ok":false,"error":"forbidden path"}'); return
          }
          const destFile = path.join(destDir, safeName)
          const existed = fs.existsSync(destFile)
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              fs.mkdirSync(destDir, { recursive: true })
              fs.writeFileSync(destFile, Buffer.concat(chunks))
              const relPath = path.join(dest, safeName).replace(/\\/g, '/')
              res.statusCode = 200
              res.end(JSON.stringify({ ok: true, relPath, existed, size: Buffer.concat(chunks).length }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, error: String(e) }))
            }
          })
        })

        // --- RadioLoop Library Foundation (0716B) routes -----------------
        // Same guard conventions as /library-write /library-import above:
        // all filesystem access confined to RADIO_LIBRARY_ROOT, JSON
        // validated before use, binary uploads size-capped.

        // GET /radio-library-status — writability only, never the path
        // itself (guardrail: no developer-only filesystem detail in the
        // primary interface).
        server.middlewares.use('/radio-library-status', (_req, res) => {
          let writable: boolean
          try {
            fs.mkdirSync(RADIO_LIBRARY_ROOT, { recursive: true })
            fs.accessSync(RADIO_LIBRARY_ROOT, fs.constants.W_OK)
            writable = true
          } catch { writable = false }
          radioJson(res, 200, { writable })
        })

        // POST /radio-staging-create — body {sourceTrackId, sourceLoopId}
        server.middlewares.use('/radio-staging-create', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as RadioStagingCreateBody
            const sourceTrackId = String(body?.sourceTrackId ?? '')
            const sourceLoopId = String(body?.sourceLoopId ?? '')
            if (!sourceTrackId || !sourceLoopId) { radioJson(res, 400, { ok: false, error: 'missing_source_ids' }); return }
            const operationId = randomUUID()
            const alloc = await reserveRadioLoopId(RADIO_LIBRARY_ROOT, operationId, sourceTrackId, sourceLoopId)
            createStagingOperation(RADIO_LIBRARY_ROOT, operationId)
            radioJson(res, 200, { ok: true, operationId, radioLoopId: alloc.radioLoopId, packageVersion: alloc.packageVersion })
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /radio-encode-opus?operationId=&target=core|stem:<name> — body = WAV bytes
        server.middlewares.use('/radio-encode-opus', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const operationId = url.searchParams.get('operationId') ?? ''
          const target = url.searchParams.get('target') ?? ''
          if (!operationId || !stagingOperationExists(RADIO_LIBRARY_ROOT, operationId)) {
            radioJson(res, 404, { ok: false, error: 'staging_operation_not_found' }); return
          }
          const stagingDir = stagingOperationDir(RADIO_LIBRARY_ROOT, operationId)
          let inputWavPath: string, outputOpusPath: string
          if (target === 'core') {
            inputWavPath = path.join(stagingDir, 'input-core.wav')
            outputOpusPath = path.join(stagingDir, 'core.opus')
          } else {
            const m = /^stem:(.+)$/.exec(target)
            if (!m) { radioJson(res, 400, { ok: false, error: 'invalid_target' }); return }
            const safeName = m[1].replace(/[^a-zA-Z0-9_-]/g, '')
            if (!safeName) { radioJson(res, 400, { ok: false, error: 'invalid_stem_name' }); return }
            inputWavPath = path.join(stagingDir, `input-stem-${safeName}.wav`)
            outputOpusPath = path.join(stagingDir, 'stems', `${safeName}.opus`)
          }
          readBoundedBinaryBody(req, RADIO_MAX_UPLOAD_BYTES).then(async (wavBytes) => {
            fs.mkdirSync(path.dirname(inputWavPath), { recursive: true })
            fs.writeFileSync(inputWavPath, wavBytes)
            const encodeResult = await encodeOpusToFile(inputWavPath, outputOpusPath)
            if (!encodeResult.ok) {
              radioJson(res, 200, { ok: false, byteSize: 0, issues: [{ code: 'RADIO_ENCODE_FAILED', message: 'ffmpeg failed to encode the staged WAV', severity: 'error' }], stderrTail: encodeResult.stderrTail })
              return
            }
            const probe = await probeOpusFile(outputOpusPath)
            radioJson(res, 200, {
              ok: probe.ok, byteSize: encodeResult.byteSize, codec: probe.codec, container: probe.container,
              channels: probe.channels, sampleRate: probe.sampleRate, durationSeconds: probe.durationSeconds,
              issues: probe.issues, stderrTail: encodeResult.stderrTail,
            })
          }).catch((e: unknown) => {
            if (e instanceof Error && (e as NodeJS.ErrnoException).code === 'PAYLOAD_TOO_LARGE') { radioJson(res, 413, { ok: false, error: 'payload_too_large' }); return }
            radioJson(res, 500, { ok: false, error: String(e) })
          })
        })

        // POST /radio-package-finalize — body {operationId, radioLoopId, packageVersion, sourceReference, musical, arrangement, approval}
        server.middlewares.use('/radio-package-finalize', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as RadioFinalizeBody
            const result = await validateAndFinalizePackage({
              radioLibraryRoot: RADIO_LIBRARY_ROOT,
              operationId: String(body?.operationId ?? ''),
              radioLoopId: String(body?.radioLoopId ?? ''),
              packageVersion: Number(body?.packageVersion ?? 0),
              sourceReference: body?.sourceReference ?? { trackId: '', loopId: '', startSeconds: 0, endSeconds: 0, resolvedAt: new Date().toISOString() },
              musical: body?.musical ?? {},
              arrangement: body?.arrangement ?? { roles: [], familyIds: [] },
              approval: body?.approval ?? { publicUseApproved: false, approvedAt: new Date().toISOString() },
              startedAt: String(body?.startedAt ?? new Date().toISOString()),
            })
            radioJson(res, 200, {
              ok: result.ok, rolledBack: result.rolledBack, stemsOmitted: result.stemsOmitted,
              stemsOmittedReason: result.stemsOmittedReason, issues: result.issues, report: result.report,
            })
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /radio-manifest-rebuild — standalone, idempotent reconciliation
        server.middlewares.use('/radio-manifest-rebuild', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          const result = regenerateManifestOnDisk(RADIO_LIBRARY_ROOT, new Date().toISOString())
          radioJson(res, 200, { ok: result.ok, entryCount: result.manifest?.entries.length ?? 0, issues: result.issues })
        })

        // GET /radio-manifest
        server.middlewares.use('/radio-manifest', (_req, res) => {
          const manifest = readCurrentManifest(RADIO_LIBRARY_ROOT)
          radioJson(res, 200, manifest ?? { schemaVersion: '1.0.0', generatedAt: null, entries: [] })
        })

        // POST /radio-staging-cleanup?operationId=
        server.middlewares.use('/radio-staging-cleanup', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const operationId = url.searchParams.get('operationId') ?? ''
          if (!operationId) { radioJson(res, 400, { ok: false, error: 'missing_operation_id' }); return }
          cleanupStagingOperation(RADIO_LIBRARY_ROOT, operationId)
          releaseReservation(RADIO_LIBRARY_ROOT, operationId).then(() => radioJson(res, 200, { ok: true }))
        })

        // --- RadioLoop Library Workspace (0717A) routes ------------------
        // Same guard conventions as the 0716B /radio-* routes above.

        // GET /radio-package-asset?radioLoopId=&packageVersion=&asset=core|stem:<name>
        // Path-confined, status-checked, byte-range-capable — mirrors
        // /music-audio's Content-Range handling above.
        server.middlewares.use('/radio-package-asset', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const radioLoopId = url.searchParams.get('radioLoopId') ?? ''
          const packageVersion = Number(url.searchParams.get('packageVersion') ?? '')
          const asset = url.searchParams.get('asset') ?? ''
          if (!radioLoopId || !Number.isFinite(packageVersion) || !asset) {
            radioJson(res, 400, { ok: false, error: 'missing_params' }); return
          }
          const resolved = resolveRadioAsset(RADIO_LIBRARY_ROOT, radioLoopId, packageVersion, asset)
          if (!resolved.ok) { radioJson(res, resolved.httpStatus, { ok: false, code: resolved.code, error: resolved.message }); return }

          const stat = fs.statSync(resolved.filePath)
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', resolved.mimeType)
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (req.method === 'HEAD') {
            res.setHeader('Content-Length', stat.size)
            res.statusCode = 200
            res.end()
            return
          }

          const range = req.headers.range
          if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
            res.setHeader('Content-Length', end - start + 1)
            fs.createReadStream(resolved.filePath, { start, end }).pipe(res)
          } else {
            res.statusCode = 200
            res.setHeader('Content-Length', stat.size)
            fs.createReadStream(resolved.filePath).pipe(res)
          }
        })

        // POST /radio-package-reveal — body {radioLoopId, packageVersion}
        server.middlewares.use('/radio-package-reveal', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as RadioRevealBody
            const radioLoopId = String(body?.radioLoopId ?? '')
            const packageVersion = Number(body?.packageVersion ?? 0)
            if (!radioLoopId || !packageVersion) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
            const result = await revealPackageInFinder(RADIO_LIBRARY_ROOT, radioLoopId, packageVersion)
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /radio-package-revise-metadata — body: MetadataEditRequest fields
        server.middlewares.use('/radio-package-revise-metadata', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as RadioReviseMetadataBody
            const request: MetadataEditRequest = {
              radioLoopId: String(body?.radioLoopId ?? ''),
              sourcePackageVersion: Number(body?.sourcePackageVersion ?? 0),
              title: body?.title,
              roles: body?.roles ?? [],
              energy: body?.energy,
              density: body?.density,
              stability: body?.stability,
              maximumConsecutiveRepeats: body?.maximumConsecutiveRepeats,
              minimumRestCycles: body?.minimumRestCycles,
              transitionIn: body?.transitionIn,
              transitionOut: body?.transitionOut,
              publicUseApproved: Boolean(body?.publicUseApproved),
            }
            // Fresh operationId per request — never client-supplied, never
            // reused across attempts (see radioMetadataRevisionOrchestrator.ts).
            const operationId = randomUUID()
            const result = await reviseRadioLoopMetadata(RADIO_LIBRARY_ROOT, operationId, request)
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /radio-package-retire — body {radioLoopId, reason} (whole-RadioLoop scope only)
        server.middlewares.use('/radio-package-retire', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as RadioRetireBody
            const operationId = randomUUID()
            const result = await retireRadioLoop(RADIO_LIBRARY_ROOT, operationId, {
              radioLoopId: String(body?.radioLoopId ?? ''),
              reason: String(body?.reason ?? ''),
            })
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // GET /radio-package-versions?radioLoopId= — complete version history, retired included
        server.middlewares.use('/radio-package-versions', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const radioLoopId = url.searchParams.get('radioLoopId') ?? ''
          if (!radioLoopId) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
          radioJson(res, 200, { versions: scanRadioLoopVersions(RADIO_LIBRARY_ROOT, radioLoopId) })
        })

        // GET /radio-package?radioLoopId=&packageVersion= — portable metadata.json
        // only. Deliberately registered AFTER every longer /radio-package-*
        // route above: connect's mount-path matching requires the character
        // right after a matched mount path to be '/' or '.' (a hyphen does
        // not qualify), so registration order shouldn't matter here — kept
        // this way anyway as a zero-cost defensive measure against relying
        // on that exact matching detail.
        server.middlewares.use('/radio-package', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const radioLoopId = url.searchParams.get('radioLoopId') ?? ''
          const packageVersion = Number(url.searchParams.get('packageVersion') ?? '')
          if (!radioLoopId || !Number.isFinite(packageVersion)) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
          const metadata = readPackageMetadata(RADIO_LIBRARY_ROOT, radioLoopId, packageVersion)
          if (!metadata) { radioJson(res, 404, { ok: false, error: 'package_not_found' }); return }
          radioJson(res, 200, metadata)
        })

        // GET /radio-library-index — one entry per RadioLoop ID, session-independent, retired included
        server.middlewares.use('/radio-library-index', (_req, res) => {
          radioJson(res, 200, { entries: scanLibraryIndex(RADIO_LIBRARY_ROOT) })
        })

        // --- RADIO Web Publication Asset Export Bridge (0718B) routes ---
        // Same guard conventions as every /radio-* route above: all
        // filesystem access confined to its own library root, JSON
        // validated before use, browser never executes ffmpeg, UI never
        // touches the filesystem directly.

        // POST /radio-track-source-hash — body {audioRelPath}. Confines the
        // path under LIBRARY_ROOT and returns only its sha256 — never a
        // filesystem detail, same guardrail as /radio-library-status.
        server.middlewares.use('/radio-track-source-hash', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then((rawBody) => {
            const body = rawBody as RadioTrackSourceHashBody
            const audioRelPath = String(body?.audioRelPath ?? '')
            if (!audioRelPath) { radioJson(res, 400, { ok: false, error: 'missing_audio_rel_path' }); return }
            const resolved = path.resolve(LIBRARY_ROOT, audioRelPath)
            if (!isPathConfinedTo(LIBRARY_ROOT, resolved)) { radioJson(res, 400, { ok: false, error: 'path_outside_library' }); return }
            if (!fs.existsSync(resolved)) { radioJson(res, 404, { ok: false, error: 'source_not_found' }); return }
            radioJson(res, 200, { ok: true, sourceAssetHash: sha256File(resolved) })
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /radio-track-prepare — body: RadioTrackPrepareRequest. One
        // request per track — the full pipeline (hash/decode/encode/
        // probe/decode-verify/finalize) runs and either fully succeeds or
        // fully rolls back inside this single call.
        server.middlewares.use('/radio-track-prepare', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const request = rawBody as RadioTrackPrepareRequest
            if (!request?.sourceTrackId || !request?.audioRelPath || !request?.approval) {
              radioJson(res, 400, { ok: false, reused: false, issues: [{ code: 'RADIO_TRACK_PREPARE_MISSING_FIELDS', message: 'sourceTrackId, audioRelPath, and approval are required', severity: 'error' }] })
              return
            }
            const result = await prepareTrackPackage({ trackLibraryRoot: RADIO_TRACK_LIBRARY_ROOT, musicLibraryRoot: LIBRARY_ROOT, request })
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, reused: false, issues: [{ code: 'RADIO_TRACK_PREPARE_INVALID_BODY', message: 'invalid_json_body', severity: 'error' }] }))
        })

        // GET /radio-track-verify?radioTrackId=&packageVersion=&sourceAssetHash=&packageManifestHash=
        // Reports facts only — never regenerates or rebinds anything.
        server.middlewares.use('/radio-track-verify', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const radioTrackId = url.searchParams.get('radioTrackId') ?? ''
          const packageVersion = Number(url.searchParams.get('packageVersion') ?? '')
          const sourceAssetHash = url.searchParams.get('sourceAssetHash') ?? ''
          const packageManifestHash = url.searchParams.get('packageManifestHash') ?? ''
          if (!radioTrackId || !Number.isFinite(packageVersion) || !sourceAssetHash || !packageManifestHash) {
            radioJson(res, 400, { ok: false, error: 'missing_params' }); return
          }
          const result = verifyTrackBinding({ trackLibraryRoot: RADIO_TRACK_LIBRARY_ROOT, musicLibraryRoot: LIBRARY_ROOT, radioTrackId, packageVersion, sourceAssetHash, packageManifestHash })
          radioJson(res, 200, result)
        })

        // GET /radio-track-package?radioTrackId=&packageVersion= — portable
        // metadata.json only (mirrors /radio-package for loops).
        server.middlewares.use('/radio-track-package', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const radioTrackId = url.searchParams.get('radioTrackId') ?? ''
          const packageVersion = Number(url.searchParams.get('packageVersion') ?? '')
          if (!radioTrackId || !Number.isFinite(packageVersion)) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
          const metadataPath = path.join(trackPackageVersionDir(RADIO_TRACK_LIBRARY_ROOT, radioTrackId, packageVersion), 'metadata.json')
          if (!fs.existsSync(metadataPath)) { radioJson(res, 404, { ok: false, error: 'package_not_found' }); return }
          try {
            radioJson(res, 200, JSON.parse(fs.readFileSync(metadataPath, 'utf-8')))
          } catch {
            radioJson(res, 500, { ok: false, error: 'unreadable_metadata' })
          }
        })

        // GET /radio-track-manifest — aggregate RadioTrack catalog manifest
        server.middlewares.use('/radio-track-manifest', (_req, res) => {
          const manifest = readCurrentTrackManifest(RADIO_TRACK_LIBRARY_ROOT)
          radioJson(res, 200, manifest ?? { schemaVersion: '1.0.0', generatedAt: null, entries: [] })
        })

        // POST /radio-web-bundle-export — body: RadioWebBundleExportRequest.
        // Every payload is read server-side from the bound immutable
        // RadioTrack package manifests — client-supplied display/musical/
        // section fields are never trusted for bundle content.
        server.middlewares.use('/radio-web-bundle-export', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, issues: [{ code: 'method_not_allowed', message: 'POST required', severity: 'error' }] }); return }
          readJsonBody(req).then(async (rawBody) => {
            const request = rawBody as RadioWebBundleExportRequest
            if (!request?.slug || !request?.stationId || !Array.isArray(request?.entries)) {
              radioJson(res, 400, { ok: false, issues: [{ code: 'RADIO_WEB_BUNDLE_MISSING_FIELDS', message: 'slug, stationId, and entries are required', severity: 'error' }] })
              return
            }
            const result = await exportWebBundle({ webExportRoot: RADIO_WEB_EXPORT_ROOT, trackLibraryRoot: RADIO_TRACK_LIBRARY_ROOT, request })
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, issues: [{ code: 'RADIO_WEB_BUNDLE_INVALID_BODY', message: 'invalid_json_body', severity: 'error' }] }))
        })

        // GET /radio-web-bundle-versions?slug= — every existing local
        // bundle version for one station slug, ascending.
        server.middlewares.use('/radio-web-bundle-versions', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const slug = url.searchParams.get('slug') ?? ''
          if (!slug) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
          radioJson(res, 200, { versions: listBundleVersions(RADIO_WEB_EXPORT_ROOT, slug) })
        })

        // POST /radio-web-bundle-validate — body {slug, bundleVersion}.
        // Resolves the root server-side from validated identifiers only —
        // never a client-supplied path.
        server.middlewares.use('/radio-web-bundle-validate', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, issues: [{ code: 'method_not_allowed', message: 'POST required', severity: 'error' }] }); return }
          readJsonBody(req).then((rawBody) => {
            const body = rawBody as RadioWebBundleRevealBody
            const slug = String(body?.slug ?? '')
            const bundleVersion = Number(body?.bundleVersion ?? 0)
            if (!slug || !bundleVersion) { radioJson(res, 400, { ok: false, issues: [{ code: 'missing_params', message: 'slug and bundleVersion are required', severity: 'error' }] }); return }
            const bundleDir = path.join(RADIO_WEB_EXPORT_ROOT, slug, `v${bundleVersion}`)
            const result = validateWebBundle(bundleDir, { trackLibraryRoot: RADIO_TRACK_LIBRARY_ROOT })
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, issues: [{ code: 'invalid_json_body', message: 'invalid_json_body', severity: 'error' }] }))
        })

        // POST /radio-web-bundle-reveal — body {slug, bundleVersion}
        server.middlewares.use('/radio-web-bundle-reveal', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as RadioWebBundleRevealBody
            const slug = String(body?.slug ?? '')
            const bundleVersion = Number(body?.bundleVersion ?? 0)
            if (!slug || !bundleVersion) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
            const bundleDir = path.join(RADIO_WEB_EXPORT_ROOT, slug, `v${bundleVersion}`)
            const result = await revealDirectoryInFinder(bundleDir)
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // --- 0722C_MUSIC_Production_Stem_Export routes -------------------
        // Same guard conventions as the RadioLoop/RadioTrack routes above:
        // all filesystem access confined to TRACK_STEM_LIBRARY_ROOT/
        // LIBRARY_ROOT, JSON validated before use, binary uploads streamed
        // to disk (never buffered whole in memory).

        server.middlewares.use('/stem-engine-status', (_req, res) => {
          checkStemEngine().then((result) => radioJson(res, 200, result))
        })

        // POST /stem-export-start — body {trackId, audioRelPath}
        server.middlewares.use('/stem-export-start', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as StemExportStartBody
            const trackId = String(body?.trackId ?? '')
            const audioRelPath = String(body?.audioRelPath ?? '')
            if (!trackId || !audioRelPath) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
            const sourcePath = resolveTrackSourcePath(LIBRARY_ROOT, audioRelPath)
            if (!isPathConfinedTo(LIBRARY_ROOT, sourcePath) || !fs.existsSync(sourcePath)) {
              radioJson(res, 404, { ok: false, error: 'source_not_found' }); return
            }
            // Dedupe key uses a cheap raw-file hash, never a full decode —
            // "the same parent, unchanged since the last request" must not
            // spawn a second job just to compute a fingerprint.
            const parentFingerprintHint = sha256FileForStems(sourcePath)
            const { jobId, focused } = stemJobRegistry.startJob(trackId, audioRelPath, parentFingerprintHint, 'htdemucs', TRACK_STEM_LIBRARY_ROOT, LIBRARY_ROOT)
            radioJson(res, 200, { ok: true, jobId, focused })
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        server.middlewares.use('/stem-export-status', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const jobId = url.searchParams.get('jobId') ?? ''
          const job = jobId ? stemJobRegistry.getStatus(jobId) : null
          if (!job) { radioJson(res, 404, { ok: false, error: 'job_not_found' }); return }
          radioJson(res, 200, { ok: true, job })
        })

        server.middlewares.use('/stem-export-cancel', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then((rawBody) => {
            const body = rawBody as StemExportCancelBody
            const jobId = String(body?.jobId ?? '')
            if (!jobId) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
            const ok = stemJobRegistry.cancelJob(jobId)
            radioJson(res, 200, { ok })
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // GET /stem-sets?trackId=&audioRelPath= — the filesystem-scanned,
        // live-classified index. Never cached client-side as a persisted
        // "hasStems" flag; callers re-fetch whenever they need current state.
        server.middlewares.use('/stem-sets', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const trackId = url.searchParams.get('trackId') ?? ''
          const audioRelPath = url.searchParams.get('audioRelPath') ?? ''
          if (!trackId || !audioRelPath) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
          const safeTrackId = safeStemDirName(trackId)
          const sets = scanStemSetsForTrack(TRACK_STEM_LIBRARY_ROOT, safeTrackId)
          const sourcePath = resolveTrackSourcePath(LIBRARY_ROOT, audioRelPath)
          const scratchOpId = `identity-scratch-${randomUUID()}`
          classifyStemSetsForTrack(sets, {
            stemLibraryRoot: TRACK_STEM_LIBRARY_ROOT,
            sourcePath,
            scratchWavPathFor: (stemSetId) => path.join(stemStagingOperationDir(TRACK_STEM_LIBRARY_ROOT, scratchOpId), `${stemSetId}.wav`),
          }).then((lifecycles) => {
            cleanupStemStagingOperation(TRACK_STEM_LIBRARY_ROOT, scratchOpId)
            radioJson(res, 200, { ok: true, sets, lifecycles: Object.fromEntries(lifecycles) })
          })
        })

        // GET /stem-set-asset?trackId=&audioRelPath=&stemSetId=&role= —
        // ONLY serves when this specific set's LIVE-recomputed lifecycle is
        // "current" — never "archived" (an archived set may still match a
        // parent's audio in principle, but this build never feeds one
        // through synchronized parent-linked playback; archived sets are
        // Finder-inspectable only). This is the concrete mechanism behind
        // "revalidate CURRENT before load and before start."
        server.middlewares.use('/stem-set-asset', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const trackId = url.searchParams.get('trackId') ?? ''
          const audioRelPath = url.searchParams.get('audioRelPath') ?? ''
          const stemSetId = url.searchParams.get('stemSetId') ?? ''
          const role = url.searchParams.get('role') as StemRole | null
          if (!trackId || !audioRelPath || !stemSetId || !role) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
          const safeTrackId = safeStemDirName(trackId)
          const sets = scanStemSetsForTrack(TRACK_STEM_LIBRARY_ROOT, safeTrackId)
          const set = sets.find((s) => s.id === stemSetId)
          if (!set) { radioJson(res, 404, { ok: false, error: 'stem_set_not_found' }); return }
          const sourcePath = resolveTrackSourcePath(LIBRARY_ROOT, audioRelPath)
          const scratchOpId = `identity-scratch-${randomUUID()}`
          classifyStemSetsForTrack(sets, {
            stemLibraryRoot: TRACK_STEM_LIBRARY_ROOT,
            sourcePath,
            scratchWavPathFor: (id) => path.join(stemStagingOperationDir(TRACK_STEM_LIBRARY_ROOT, scratchOpId), `${id}.wav`),
          }).then((lifecycles) => {
            cleanupStemStagingOperation(TRACK_STEM_LIBRARY_ROOT, scratchOpId)
            const lifecycle = lifecycles.get(stemSetId)
            if (lifecycle?.lifecycle !== 'current') {
              radioJson(res, 403, { ok: false, error: 'not_current', lifecycle: lifecycle?.lifecycle ?? 'unknown', reason: lifecycle?.reason })
              return
            }
            const file = set.stems[role]
            if (!file) { radioJson(res, 404, { ok: false, error: 'role_not_found' }); return }
            const absPath = path.join(TRACK_STEM_LIBRARY_ROOT, file.relativeArchivePath)
            if (!isPathConfinedTo(TRACK_STEM_LIBRARY_ROOT, absPath) || !fs.existsSync(absPath)) {
              radioJson(res, 404, { ok: false, error: 'file_missing' }); return
            }
            const stat = fs.statSync(absPath)
            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Content-Type', 'audio/wav')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Access-Control-Allow-Origin', '*')
            if (req.method === 'HEAD') { res.setHeader('Content-Length', stat.size); res.statusCode = 200; res.end(); return }
            const range = req.headers.range
            if (range) {
              const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
              const start = parseInt(startStr, 10)
              const end = endStr ? parseInt(endStr, 10) : stat.size - 1
              res.statusCode = 206
              res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
              res.setHeader('Content-Length', end - start + 1)
              fs.createReadStream(absPath, { start, end }).pipe(res)
            } else {
              res.statusCode = 200
              res.setHeader('Content-Length', stat.size)
              fs.createReadStream(absPath).pipe(res)
            }
          })
        })

        // POST /stem-badges — body {tracks:[{trackId,audioRelPath}]}. Cheap
        // batch status for the Library grid's "S" badge: skips
        // classification entirely for tracks with no stem-set directory at
        // all (the overwhelming majority), and only runs the fast
        // stat-tier revalidation (never a decode) for tracks that do.
        server.middlewares.use('/stem-badges', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as StemBadgesBody
            const tracks = (body?.tracks ?? []).filter((t) => t.trackId && t.audioRelPath) as { trackId: string; audioRelPath: string }[]
            const badges: Record<string, { lifecycle: string; reason: string } | null> = {}
            for (const t of tracks) {
              const safeTrackId = safeStemDirName(t.trackId)
              if (!hasAnyStemSets(TRACK_STEM_LIBRARY_ROOT, safeTrackId)) { badges[t.trackId] = null; continue }
              const sets = scanStemSetsForTrack(TRACK_STEM_LIBRARY_ROOT, safeTrackId)
              const sourcePath = resolveTrackSourcePath(LIBRARY_ROOT, t.audioRelPath)
              const scratchOpId = `identity-scratch-${randomUUID()}`
              const lifecycles = await classifyStemSetsForTrack(sets, {
                stemLibraryRoot: TRACK_STEM_LIBRARY_ROOT,
                sourcePath,
                scratchWavPathFor: (id) => path.join(stemStagingOperationDir(TRACK_STEM_LIBRARY_ROOT, scratchOpId), `${id}.wav`),
              })
              cleanupStemStagingOperation(TRACK_STEM_LIBRARY_ROOT, scratchOpId)
              // Prefer reporting "current" if any set is current; otherwise
              // the newest set's own state (sets is already newest-first).
              const current = sets.find((s) => lifecycles.get(s.id)?.lifecycle === 'current')
              const chosen = current ? lifecycles.get(current.id) : (sets[0] ? lifecycles.get(sets[0].id) : undefined)
              badges[t.trackId] = chosen ?? null
            }
            radioJson(res, 200, { ok: true, badges })
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /stem-set-reveal — body {trackId, stemSetId}. Any lifecycle
        // may be revealed in Finder (that's the sanctioned way to inspect
        // an archived/outdated/orphaned set) — only synchronized playback
        // is CURRENT-gated.
        server.middlewares.use('/stem-set-reveal', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as StemSetRevealBody
            const trackId = String(body?.trackId ?? '')
            const stemSetId = String(body?.stemSetId ?? '')
            if (!trackId || !stemSetId) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
            const safeTrackId = safeStemDirName(trackId)
            const sets = scanStemSetsForTrack(TRACK_STEM_LIBRARY_ROOT, safeTrackId)
            const set = sets.find((s) => s.id === stemSetId)
            if (!set) { radioJson(res, 404, { ok: false, error: 'stem_set_not_found' }); return }
            const dir = path.join(TRACK_STEM_LIBRARY_ROOT, set.archiveDirectory)
            const result = await revealDirectoryInFinder(dir)
            radioJson(res, 200, result)
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /stem-salvage-stage — creates a fresh staging operation for
        // "Register Existing Stem Set…" and returns its operationId.
        server.middlewares.use('/stem-salvage-stage', (_req, res) => {
          const operationId = randomUUID()
          createStemStagingOperation(TRACK_STEM_LIBRARY_ROOT, operationId)
          radioJson(res, 200, { ok: true, operationId })
        })

        // POST /stem-salvage-upload?operationId=&role=&filename= — the raw
        // request body IS the file's bytes, streamed directly to disk via
        // fs.createWriteStream (never buffered whole in application
        // memory — a real transfer mechanism, not a hand-wave). One call
        // per file (browser File objects are valid fetch() bodies).
        server.middlewares.use('/stem-salvage-upload', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const operationId = url.searchParams.get('operationId') ?? ''
          const role = url.searchParams.get('role') ?? ''
          const filename = url.searchParams.get('filename') ?? ''
          if (!operationId || !role || !filename || !stagingOperationExistsForStems(operationId)) {
            radioJson(res, 400, { ok: false, error: 'missing_or_invalid_params' }); return
          }
          const safeName = `${role}-${path.basename(filename)}`
          const destPath = path.join(stemStagingOperationDir(TRACK_STEM_LIBRARY_ROOT, operationId), safeName)
          const writeStream = fs.createWriteStream(destPath)
          let bytesWritten = 0
          req.on('data', (chunk: Buffer) => { bytesWritten += chunk.length })
          req.pipe(writeStream)
          writeStream.on('finish', () => radioJson(res, 200, { ok: true, fileName: safeName, size: bytesWritten }))
          writeStream.on('error', (e) => radioJson(res, 500, { ok: false, error: String(e) }))
        })

        function stagingOperationExistsForStems(operationId: string): boolean {
          return fs.existsSync(stemStagingOperationDir(TRACK_STEM_LIBRARY_ROOT, operationId))
        }

        // POST /stem-register-existing — validates+promotes the already-
        // staged files (shared by the salvage dialog and the Legacy Stem
        // Migration panel).
        server.middlewares.use('/stem-register-existing', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as StemRegisterExistingBody
            const operationId = String(body?.operationId ?? '')
            const trackId = String(body?.trackId ?? '')
            const audioRelPath = String(body?.audioRelPath ?? '')
            const roleAssignments = (body?.roleAssignments ?? {}) as Record<StemRole, string>
            if (!operationId || !trackId || !audioRelPath) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
            const stagingDir = stemStagingOperationDir(TRACK_STEM_LIBRARY_ROOT, operationId)
            if (!fs.existsSync(stagingDir)) { radioJson(res, 404, { ok: false, error: 'staging_not_found' }); return }
            const result = await registerExistingStemSet({
              stemLibraryRoot: TRACK_STEM_LIBRARY_ROOT,
              musicLibraryRoot: LIBRARY_ROOT,
              stagingDir,
              sourceTrackId: trackId,
              audioRelPath,
              roleAssignments,
              confirmed: Boolean(body?.confirmed),
              origin: 'registered_existing',
              engineNotes: body?.engineNotes,
            })
            if (!result.ok) cleanupStemStagingOperation(TRACK_STEM_LIBRARY_ROOT, operationId)
            radioJson(res, result.ok ? 200 : 400, result)
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        // POST /stem-legacy-migrate — copies the 4 already-known legacy
        // derived-stem audio files (no browser upload needed, they're
        // already on disk under LIBRARY_ROOT) into staging, then runs the
        // exact same validate+promote pipeline as manual salvage.
        server.middlewares.use('/stem-legacy-migrate', (req, res) => {
          if (req.method !== 'POST') { radioJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
          readJsonBody(req).then(async (rawBody) => {
            const body = rawBody as StemLegacyMigrateBody
            const trackId = String(body?.trackId ?? '')
            const audioRelPath = String(body?.audioRelPath ?? '')
            const legacyAudioRelPaths = (body?.legacyAudioRelPaths ?? {}) as Record<StemRole, string>
            if (!trackId || !audioRelPath) { radioJson(res, 400, { ok: false, error: 'missing_params' }); return }
            const operationId = randomUUID()
            const staged = stageLegacyStemFiles(LIBRARY_ROOT, TRACK_STEM_LIBRARY_ROOT, operationId, legacyAudioRelPaths)
            if (!staged.ok || !staged.stagingDir || !staged.roleAssignments) {
              radioJson(res, 400, { ok: false, error: staged.reason ?? 'staging_failed' }); return
            }
            const result = await registerExistingStemSet({
              stemLibraryRoot: TRACK_STEM_LIBRARY_ROOT,
              musicLibraryRoot: LIBRARY_ROOT,
              stagingDir: staged.stagingDir,
              sourceTrackId: trackId,
              audioRelPath,
              roleAssignments: staged.roleAssignments,
              confirmed: true,
              origin: 'registered_existing',
              engineNotes: 'legacy_migration',
            })
            if (!result.ok) cleanupStemStagingOperation(TRACK_STEM_LIBRARY_ROOT, operationId)
            radioJson(res, result.ok ? 200 : 400, result)
          }).catch(() => radioJson(res, 400, { ok: false, error: 'invalid_json_body' }))
        })

        server.middlewares.use('/media', (req, res) => {
          const method = (req as any).method as string
          const url = new URL(req.url ?? '/', 'http://localhost')
          const filePath = url.searchParams.get('path')

          if (!filePath) {
            mediaError(res, 400, 'NO_PATH', 'Missing path parameter')
            return
          }

          const ext = path.extname(filePath).toLowerCase()
          if (!SUPPORTED_AUDIO.has(ext)) {
            mediaError(res, 415, 'UNSUPPORTED_EXT', `Unsupported extension: ${ext}`)
            return
          }

          const resolved = path.resolve(filePath)

          if (!fs.existsSync(resolved)) {
            mediaError(res, 404, 'FILE_MISSING', `File not found: ${resolved}`)
            return
          }

          let stat: fs.Stats
          try {
            stat = fs.statSync(resolved)
          } catch (e) {
            mediaError(res, 500, 'STAT_ERROR', `Cannot stat file: ${resolved}`)
            return
          }

          if (!stat.isFile()) {
            mediaError(res, 400, 'NOT_A_FILE', `Path is not a file: ${resolved}`)
            return
          }

          const mime = MIME[ext] ?? 'audio/mpeg'

          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')

          // HEAD request — just confirm existence
          if (method === 'HEAD') {
            res.setHeader('Content-Length', stat.size)
            res.statusCode = 200
            res.end()
            return
          }

          const range = (req as any).headers.range as string | undefined

          if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1
            const chunkSize = end - start + 1

            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
            res.setHeader('Content-Length', chunkSize)

            const stream = fs.createReadStream(resolved, { start, end })
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          } else {
            res.statusCode = 200
            res.setHeader('Content-Length', stat.size)

            const stream = fs.createReadStream(resolved)
            stream.on('error', () => mediaError(res, 500, 'STREAM_ERROR', 'Stream error'))
            stream.pipe(res)
          }
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      // RADIO Web Playback Vertical Slice — a second, standalone HTML
      // entry point alongside the main MUSIC app. Vite only builds
      // index.html by default; this adds radio-player.html so `npm run
      // build` emits a self-contained, deployable public player bundle.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        radioPlayer: path.resolve(__dirname, 'radio-player.html'),
      },
    },
  },
})
