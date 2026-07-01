import express from 'express'
import cors from 'cors'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canvasFile,
  distPath,
  globalAssetsRoute,
  HOST,
  IS_PRODUCTION,
  mimeTypes,
  pageAssetsRoute,
  PORT
} from './config.js'
import {
  isSelectionState,
  isViewState,
  loadCanvasSnapshot,
  loadSelection,
  loadViewState,
  localAssetFilePathFromUrl,
  readRequestBody,
  sanitizeCanvasSnapshotForServer,
  saveAssetToGlobal,
  saveCanvasSnapshot,
  saveSelection,
  saveViewState,
  loadImageHistory,
  saveImageHistory,
  appendImageHistory,
  deleteImageHistoryEntry,
  loadPageManifest,
  savePageManifest,
  createPageRecord,
  deletePageFile,
  renamePageInManifest
} from './store.js'

// ---------------------------------------------------------------------------
// SSE broadcast
// ---------------------------------------------------------------------------

const canvasEventClients = new Set()
let canvasEventVersion = 0

function sendCanvasEvent(res, payload) {
  res.write(`event: canvas-changed\n`)
  res.write(`id: ${payload.version}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

export function broadcastCanvasChanged(result) {
  const payload = {
    version: ++canvasEventVersion,
    updatedAt: new Date().toISOString(),
    storage: result.storage,
    paths: result.paths
  }

  for (const client of canvasEventClients) {
    if (client.destroyed) {
      canvasEventClients.delete(client)
      continue
    }

    try {
      sendCanvasEvent(client, payload)
    } catch {
      canvasEventClients.delete(client)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload)
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()

// CORS for dev (Vite on 5174/43217, Express on 43218)
app.use(cors())

// Parse JSON bodies (limit matches the existing 50MB canvas limit)
app.use(express.json({ limit: '55mb' }))

// ---------------------------------------------------------------------------
// Static asset serving
// ---------------------------------------------------------------------------

// Serve Vite build artifacts (JS, CSS, favicon, etc.) from dist/ first.
// This handles /assets/index-*.js, /cowart-logo.svg, etc.
// When a file is not found in dist/, express.static calls next()
// and the canvas asset middlewares below pick it up.
app.use(express.static(distPath))

// Canvas user-uploaded assets — only reached when the file is NOT in dist/
app.use('/assets', async (req, res, next) => {
  if (!req.path || req.path === '/') { next(); return }
  serveAssetFile(req, res, next)
})

app.use('/page-assets', async (req, res, next) => {
  if (!req.path || req.path === '/') { next(); return }
  serveAssetFile(req, res, next)
})

async function serveAssetFile(req, res, next) {
  const filePath = localAssetFilePathFromUrl(req.originalUrl)
  if (!filePath) {
    res.status(403).send('Forbidden')
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      res.status(404).send('Not found')
      return
    }
    res.status(200)
    res.setHeader('content-type', mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream')
    res.setHeader('content-length', String(fileStat.size))
    res.setHeader('cache-control', 'no-cache')
    createReadStream(filePath).pipe(res)
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).send('Not found')
      return
    }
    next(error)
  }
}

// ---------------------------------------------------------------------------
// API: Asset upload
// ---------------------------------------------------------------------------

app.post('/api/asset', async (req, res) => {
  try {
    const { imageData, mimeType, name } = req.body

    if (!imageData || typeof imageData !== 'string') {
      sendJson(res, 400, { error: 'Missing imageData' })
      return
    }

    const result = await saveAssetToGlobal(imageData, mimeType, name)
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

// ---------------------------------------------------------------------------
// API: Canvas events (SSE)
// ---------------------------------------------------------------------------

app.get('/api/canvas-events', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no'
  })
  res.write(`: connected\n\n`)

  canvasEventClients.add(res)
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`)
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    canvasEventClients.delete(res)
  })
})

// ---------------------------------------------------------------------------
// API: Selection state
// ---------------------------------------------------------------------------

app.get('/api/selection', async (req, res) => {
  try {
    const result = await loadSelection()
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.put('/api/selection', async (req, res) => {
  try {
    const selection = req.body
    if (!isSelectionState(selection)) {
      sendJson(res, 400, { error: 'Expected a Cowart selection state.' })
      return
    }

    await saveSelection(selection)
    sendJson(res, 200, { ok: true, path: canvasFile })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

// ---------------------------------------------------------------------------
// API: View state
// ---------------------------------------------------------------------------

app.get('/api/view-state', async (req, res) => {
  try {
    const result = await loadViewState()
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.put('/api/view-state', async (req, res) => {
  try {
    const viewState = req.body
    if (!isViewState(viewState)) {
      sendJson(res, 400, { error: 'Expected a Cowart view state.' })
      return
    }

    await saveViewState(viewState)
    sendJson(res, 200, { ok: true, path: canvasFile })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

// ---------------------------------------------------------------------------
// API: Canvas snapshot
// ---------------------------------------------------------------------------

app.get('/api/canvas', async (req, res) => {
  try {
    const result = await loadCanvasSnapshot()
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.put('/api/canvas', async (req, res) => {
  try {
    const snapshot = req.body
    if (!snapshot || !snapshot.store || !snapshot.schema) {
      sendJson(res, 400, { error: 'Expected a tldraw store snapshot.' })
      return
    }

    const sanitized = await sanitizeCanvasSnapshotForServer(snapshot)
    if (!sanitized.snapshot) {
      sendJson(res, 400, {
        error: 'Invalid tldraw store snapshot.',
        skippedRecords: sanitized.skippedRecords
      })
      return
    }

    const result = await saveCanvasSnapshot(sanitized.snapshot)
    sendJson(res, 200, { ok: true, ...result, skippedRecords: sanitized.skippedRecords })
    broadcastCanvasChanged(result)
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

// ---------------------------------------------------------------------------
// API: Page management
// ---------------------------------------------------------------------------

app.get('/api/pages', async (req, res) => {
  try {
    const manifest = await loadPageManifest()
    sendJson(res, 200, manifest)
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.post('/api/pages', async (req, res) => {
  try {
    const { name } = req.body || {}
    const pageId = `page:${randomUUID()}`
    const manifest = await loadPageManifest()
    const lastIndex = manifest.pages.length > 0
      ? Math.max(...manifest.pages.map((p) => p.index))
      : ''
    const newIndex = lastIndex > '' ? String.fromCharCode(lastIndex.charCodeAt(0) + 1) : 'a'
    const result = await createPageRecord(pageId, name || `页面 ${manifest.pages.length + 1}`, newIndex)
    sendJson(res, 200, { pageId: result.pageId, name: result.name })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.delete('/api/pages/:pageId', async (req, res) => {
  try {
    const pageId = req.params.pageId
    await deletePageFile(pageId)
    const manifest = await loadPageManifest()
    manifest.pages = manifest.pages.filter((p) => p.id !== pageId)
    await savePageManifest(manifest)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.put('/api/pages/:pageId/rename', async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name) {
      sendJson(res, 400, { error: 'Missing name' })
      return
    }
    const manifest = await renamePageInManifest(req.params.pageId, name)
    sendJson(res, 200, manifest)
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

// ---------------------------------------------------------------------------
// API: Image history
// ---------------------------------------------------------------------------

app.get('/api/image-history', async (req, res) => {
  try {
    const history = await loadImageHistory()
    sendJson(res, 200, { history })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.post('/api/image-history', async (req, res) => {
  try {
    const entry = req.body
    if (!entry || !entry.assetUrl) {
      sendJson(res, 400, { error: 'Missing assetUrl' })
      return
    }
    await appendImageHistory(entry)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

app.delete('/api/image-history/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10)
    if (!Number.isFinite(index)) {
      sendJson(res, 400, { error: 'Invalid index' })
      return
    }
    const history = await deleteImageHistoryEntry(index)
    sendJson(res, 200, { history })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
})

// ---------------------------------------------------------------------------
// API: Generate image (backend proxy to Agnes AI)

const AGNES_API_URL = 'https://apihub.agnes-ai.com/v1/images/generations'
const AGNES_API_KEY = process.env.AGNES_API_KEY
const AGNES_MODEL = 'agnes-image-2.1-flash'

const AGNES_SIZE_MAP = {
  '1-1': '1024x1024', '3-2': '1024x768', '2-3': '768x1024',
  '4-3': '1024x768', '3-4': '768x1024', '16-9': '1024x576', '9-16': '576x1024'
}

app.post('/api/generate', async (req, res) => {
  try {
    if (!AGNES_API_KEY) { sendJson(res, 500, { error: 'AGNES_API_KEY not configured' }); return }
    const { prompt, aspectId, customWidth, customHeight, referenceImages, negativePrompt, seed } = req.body
    if (!prompt?.trim()) { sendJson(res, 400, { error: 'Prompt required' }); return }

    let size = '1024x768'
    if (customWidth && customHeight) size = `${customWidth}x${customHeight}`
    else if (aspectId && AGNES_SIZE_MAP[aspectId]) size = AGNES_SIZE_MAP[aspectId]

    const body = { model: AGNES_MODEL, prompt: prompt.trim(), size, extra_body: { response_format: 'b64_json' } }
    if (negativePrompt?.trim()) body.extra_body.negative_prompt = negativePrompt.trim()
    if (typeof seed === 'number' && seed >= 0 && seed <= 2147483647) body.extra_body.seed = seed
    if (referenceImages?.length > 0) body.extra_body.image = referenceImages

    const r = await fetch(AGNES_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) { const t = await r.text(); sendJson(res, r.status, { error: `Agnes API error (${r.status})` }); return }
    const d = await r.json()
    sendJson(res, 200, { data: d.data || [] })
  } catch (e) { sendJson(res, 500, { error: e.message }) }
})
// Production: serve built frontend
// ---------------------------------------------------------------------------

if (IS_PRODUCTION) {
  app.get('*', (req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/assets/') && !req.path.startsWith('/page-assets/')) {
      res.sendFile(distPath + '/index.html')
    }
  })
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use((err, req, res, _next) => {
  console.error('[cowart-server] Unhandled error:', err)
  sendJson(res, 500, { error: err.message || 'Internal server error' })
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export function startServer() {
  const port = parseInt(process.env.PORT || PORT, 10)

  return new Promise((resolveStart) => {
    const server = app.listen(port, HOST, () => {
      console.log(`[cowart-server] Canvas backend running at http://${HOST}:${port}`)
      console.log(`[cowart-server] Canvas data dir: ${canvasFile}`)
      if (IS_PRODUCTION) {
        console.log(`[cowart-server] Serving frontend from: ${distPath}`)
      }
      resolveStart(server)
    })
  })
}

// Allow running directly: node server/index.js
const runningDirectly = fileURLToPath(import.meta.url) === pathResolve(process.argv[1] || '')
if (runningDirectly) {
  startServer()
}
