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
  plugins: [
    react(),
    {
      name: 'local-media-server',
      configureServer(server) {
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

        // /library-root — returns the resolved LIBRARY_ROOT path for debugging
        server.middlewares.use('/library-root', (_req, res) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ root: LIBRARY_ROOT, exists: fs.existsSync(LIBRARY_ROOT) }))
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
})
