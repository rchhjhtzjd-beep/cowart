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
  saveViewState
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
