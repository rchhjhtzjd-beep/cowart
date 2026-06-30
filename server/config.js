import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// --- Path resolution ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectDir = resolve(process.env.COWART_PROJECT_DIR ?? join(__dirname, '..'))

// --- Server ---
export const PORT = parseInt(process.env.PORT || process.env.COWART_PORT || '43218', 10)
export const HOST = process.env.COWART_HOST || '127.0.0.1'
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// --- Canvas storage ---
export const canvasDir = resolve(process.env.COWART_CANVAS_DIR ?? join(projectDir, 'canvas'))
export const canvasFile = join(canvasDir, 'cowart-canvas.json')
export const selectionFile = join(canvasDir, 'cowart-selection.json')
export const viewStateFile = join(canvasDir, 'cowart-view-state.json')
export const canvasPagesDir = join(canvasDir, 'pages')
export const canvasAssetsDir = join(canvasDir, 'assets')
export const pagesManifestFile = join(canvasPagesDir, 'manifest.json')
export const canvasFileName = 'cowart-canvas.json'

// --- URL routes ---
export const pageIdPrefix = 'page:'
export const globalAssetsRoute = '/assets/'
export const pageAssetsRoute = '/page-assets/'

// --- MIME types ---
export const mimeTypes = new Map([
  ['.apng', 'image/apng'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
])

// --- Frontend dist path (production) ---
export const distPath = join(projectDir, 'dist')

// --- Project root ---
export { projectDir }
