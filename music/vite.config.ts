import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Library root: PLAY_LIBRARY_ROOT env var → else <project-root>/library/music
// Vite cwd is music/, so '../library/music' resolves to the project-root music library.
const LIBRARY_ROOT = process.env.PLAY_LIBRARY_ROOT
  ? path.resolve(process.env.PLAY_LIBRARY_ROOT)
  : path.resolve(process.cwd(), '../library/music')

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
