import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import {
  canvasAssetsDir,
  canvasDir,
  canvasFile,
  canvasFileName,
  canvasPagesDir,
  globalAssetsRoute,
  mimeTypes,
  pageAssetsRoute,
  pageIdPrefix,
  pagesManifestFile,
  selectionFile,
  viewStateFile
} from './config.js'
import { isCanvasSnapshot, sanitizeCanvasSnapshotForTldraw } from './canvasSnapshot.js'

// ---------------------------------------------------------------------------
// Request body helpers
// ---------------------------------------------------------------------------

export function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 50 * 1024 * 1024) {
        rejectBody(new Error('Canvas payload is too large.'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(body))
    req.on('error', rejectBody)
  })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isSelectionState(value) {
  return value && typeof value === 'object' && Array.isArray(value.selectedShapes)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isViewState(value) {
  return (
    value &&
    typeof value === 'object' &&
    value.version === 1 &&
    (value.currentPageId === null || typeof value.currentPageId === 'string') &&
    value.camera &&
    typeof value.camera === 'object' &&
    isFiniteNumber(value.camera.x) &&
    isFiniteNumber(value.camera.y) &&
    isFiniteNumber(value.camera.z)
  )
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

export function isSafeChildPath(parent, child) {
  const pathToChild = relative(parent, child)
  return pathToChild && !pathToChild.startsWith('..') && !pathToChild.includes(`..${sep}`)
}

// ---------------------------------------------------------------------------
// Page path helpers
// ---------------------------------------------------------------------------

export function pageDirName(pageId) {
  return encodeURIComponent(pageId.replace(pageIdPrefix, ''))
}

export function pageFilePath(pageId) {
  return join(canvasPagesDir, pageDirName(pageId), canvasFileName)
}

export function pageAssetsDir(pageId) {
  return join(canvasPagesDir, pageDirName(pageId), 'assets')
}

export function pageAssetUrl(pageId, fileName) {
  return `${pageAssetsRoute}${pageDirName(pageId)}/${encodeURIComponent(fileName)}`
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

export function getPageRecords(snapshot) {
  return Object.values(snapshot.store)
    .filter((record) => record?.typeName === 'page')
    .sort((a, b) => String(a.index ?? '').localeCompare(String(b.index ?? '')))
}

function getAssetIdsForShapes(shapes) {
  return new Set(
    shapes
      .map((shape) => shape?.props?.assetId)
      .filter((assetId) => typeof assetId === 'string')
  )
}

export function getShapeRecordsForPage(snapshot, pageId) {
  const shapesByParent = new Map()
  for (const record of Object.values(snapshot.store)) {
    if (record?.typeName !== 'shape') continue
    const siblings = shapesByParent.get(record.parentId) ?? []
    siblings.push(record)
    shapesByParent.set(record.parentId, siblings)
  }

  const shapes = []
  const queue = [...(shapesByParent.get(pageId) ?? [])]
  while (queue.length > 0) {
    const shape = queue.shift()
    shapes.push(shape)
    queue.push(...(shapesByParent.get(shape.id) ?? []))
  }
  return shapes
}

function isBindingForShapes(record, shapeIds) {
  if (record?.typeName !== 'binding') return false
  const fromId = record.fromId ?? record.props?.fromId
  const toId = record.toId ?? record.props?.toId
  return shapeIds.has(fromId) || shapeIds.has(toId)
}

export function snapshotForPage(snapshot, page) {
  const pageId = page.id
  const pageShapes = getShapeRecordsForPage(snapshot, pageId)
  const shapeIds = new Set(pageShapes.map((shape) => shape.id))
  const assetIds = getAssetIdsForShapes(pageShapes)
  const store = {}

  for (const record of Object.values(snapshot.store)) {
    if (!record?.id) continue
    if (record.typeName === 'page') {
      if (record.id === pageId) store[record.id] = record
      continue
    }
    if (record.typeName === 'shape') {
      if (shapeIds.has(record.id)) store[record.id] = record
      continue
    }
    if (record.typeName === 'asset') {
      if (assetIds.has(record.id)) store[record.id] = record
      continue
    }
    if (record.typeName === 'binding') {
      if (isBindingForShapes(record, shapeIds)) store[record.id] = record
      continue
    }
    store[record.id] = record
  }

  return {
    schema: snapshot.schema,
    store
  }
}

// ---------------------------------------------------------------------------
// Asset utilities
// ---------------------------------------------------------------------------

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case 'image/apng': return '.apng'
    case 'image/avif': return '.avif'
    case 'image/gif':  return '.gif'
    case 'image/jpeg': return '.jpg'
    case 'image/png':  return '.png'
    case 'image/svg+xml': return '.svg'
    case 'image/webp': return '.webp'
    default:           return '.bin'
  }
}

export function sanitizeAssetFileName(name, fallbackName, mimeType) {
  const rawName = basename(String(name || fallbackName || 'asset'))
  const extension = extname(rawName) || extensionFromMimeType(mimeType)
  const baseName = rawName
    .slice(0, rawName.length - extname(rawName).length)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${baseName || 'asset'}${extension}`
}

export function parseDataUrl(src) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s.exec(src)
  if (!match) return null
  const mimeType = match[1] || 'application/octet-stream'
  const encoded = match[2]
  const isBase64 = /^data:[^,]*;base64,/i.test(src)
  const buffer = isBase64 ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded))
  return { buffer, mimeType }
}

export function localAssetFilePathFromUrl(src) {
  let route = null
  let baseDir = null
  if (src.startsWith(globalAssetsRoute)) {
    route = globalAssetsRoute
    baseDir = canvasAssetsDir
  } else if (src.startsWith(pageAssetsRoute)) {
    const parts = src.slice(pageAssetsRoute.length).split('/')
    const pageDir = decodeURIComponent(parts.shift() ?? '')
    if (!pageDir || parts.length === 0) return null
    const filePath = resolve(join(canvasPagesDir, pageDir, 'assets'), ...parts.map(decodeURIComponent))
    return isSafeChildPath(join(canvasPagesDir, pageDir, 'assets'), filePath) ? filePath : null
  } else {
    return null
  }

  const requestedPath = decodeURIComponent(src.slice(route.length))
  const filePath = resolve(baseDir, requestedPath)
  return isSafeChildPath(baseDir, filePath) ? filePath : null
}

// ---------------------------------------------------------------------------
// Asset localization (data: URLs → files)
// ---------------------------------------------------------------------------

export async function localizePageAsset(asset, pageId) {
  const src = asset?.props?.src
  if (!src || typeof src !== 'string' || /^https?:\/\//.test(src)) return asset

  const currentPagePrefix = `${pageAssetsRoute}${pageDirName(pageId)}/`
  if (src.startsWith(currentPagePrefix)) return asset

  const localizedAsset = structuredClone(asset)
  const dataUrl = src.startsWith('data:') ? parseDataUrl(src) : null
  const sourceFilePath = dataUrl ? null : localAssetFilePathFromUrl(src)
  if (!dataUrl && !sourceFilePath) return localizedAsset

  const fileName = sanitizeAssetFileName(
    dataUrl ? null : localizedAsset.props.name,
    sourceFilePath ? basename(sourceFilePath) : localizedAsset.id.replace(':', '-'),
    dataUrl?.mimeType ?? localizedAsset.props.mimeType
  )
  const destinationDir = pageAssetsDir(pageId)
  const destinationPath = join(destinationDir, fileName)

  await mkdir(destinationDir, { recursive: true })
  if (dataUrl) {
    await writeFile(destinationPath, dataUrl.buffer)
    localizedAsset.props.mimeType = localizedAsset.props.mimeType ?? dataUrl.mimeType
    localizedAsset.props.fileSize = dataUrl.buffer.length
  } else if (resolve(sourceFilePath) !== resolve(destinationPath)) {
    await copyFile(sourceFilePath, destinationPath)
    localizedAsset.props.fileSize = (await stat(destinationPath)).size
  }

  localizedAsset.props.name = fileName
  localizedAsset.props.src = pageAssetUrl(pageId, fileName)
  return localizedAsset
}

export async function localizePageAssets(pageSnapshot, pageId) {
  const entries = await Promise.all(
    Object.entries(pageSnapshot.store).map(async ([id, record]) => {
      if (record?.typeName !== 'asset') return [id, record]
      return [id, await localizePageAsset(record, pageId)]
    })
  )
  return {
    ...pageSnapshot,
    store: Object.fromEntries(entries)
  }
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export async function writeJsonAtomic(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true })
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  await writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`)
  await rename(tempFile, filePath)
}

// ---------------------------------------------------------------------------
// Canvas load
// ---------------------------------------------------------------------------

async function readPageSnapshots() {
  let entries
  try {
    entries = await readdir(canvasPagesDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const snapshots = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const filePath = join(canvasPagesDir, entry.name, canvasFileName)
    try {
      const snapshot = await readJsonFile(filePath)
      if (isCanvasSnapshot(snapshot)) snapshots.push({ filePath, snapshot })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return snapshots
}

export async function loadCanvasSnapshot() {
  const pageSnapshots = await readPageSnapshots()
  if (pageSnapshots.length > 0) {
    const [{ snapshot: firstSnapshot }] = pageSnapshots
    const mergedSnapshot = {
      schema: firstSnapshot.schema,
      store: {}
    }

    for (const { snapshot } of pageSnapshots) {
      Object.assign(mergedSnapshot.store, snapshot.store)
    }
    return {
      snapshot: mergedSnapshot,
      path: canvasPagesDir,
      storage: 'per-page'
    }
  }

  try {
    return {
      snapshot: await readJsonFile(canvasFile),
      path: canvasFile,
      storage: 'legacy-single-file'
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { snapshot: null, path: canvasPagesDir, storage: 'empty' }
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Canvas save
// ---------------------------------------------------------------------------

export async function saveCanvasSnapshot(snapshot) {
  const pages = getPageRecords(snapshot)
  if (pages.length === 0) {
    await writeJsonAtomic(canvasFile, snapshot)
    return { storage: 'legacy-single-file', paths: [canvasFile] }
  }

  const paths = []
  for (const page of pages) {
    const filePath = pageFilePath(page.id)
    const pageSnapshot = await localizePageAssets(
      snapshotForPage(snapshot, page),
      page.id
    )
    await writeJsonAtomic(filePath, pageSnapshot)
    paths.push(filePath)
  }

  const manifest = {
    version: 1,
    source: 'cowart',
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      index: page.index,
      path: relative(canvasDir, pageFilePath(page.id))
    }))
  }
  await writeJsonAtomic(pagesManifestFile, manifest)

  return { storage: 'per-page', paths }
}

// ---------------------------------------------------------------------------
// Snapshot sanitization (server-side)
// ---------------------------------------------------------------------------

export async function sanitizeCanvasSnapshotForServer(snapshot) {
  return sanitizeCanvasSnapshotForTldraw(snapshot)
}

// ---------------------------------------------------------------------------
// Selection & view-state persistence
// ---------------------------------------------------------------------------

export async function loadSelection() {
  try {
    return {
      selection: await readJsonFile(selectionFile),
      path: selectionFile
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        selection: { selectedShapes: [], updatedAt: null },
        path: selectionFile
      }
    }
    throw error
  }
}

export async function saveSelection(selection) {
  await writeJsonAtomic(selectionFile, selection)
}

export async function loadViewState() {
  try {
    return {
      viewState: await readJsonFile(viewStateFile),
      path: viewStateFile
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        viewState: {
          version: 1,
          currentPageId: null,
          camera: { x: 0, y: 0, z: 1 },
          updatedAt: null
        },
        path: viewStateFile
      }
    }
    throw error
  }
}

export async function saveViewState(viewState) {
  await writeJsonAtomic(viewStateFile, viewState)
}

// ---------------------------------------------------------------------------
// Asset upload
// ---------------------------------------------------------------------------

export async function saveAssetToGlobal(imageData, mimeType, name) {
  const decoded = Buffer.from(imageData, 'base64')
  let fileExt = '.bin'
  switch (mimeType) {
    case 'image/png':  fileExt = '.png';  break
    case 'image/jpeg': fileExt = '.jpg';  break
    case 'image/gif':  fileExt = '.gif';  break
    case 'image/webp': fileExt = '.webp'; break
    case 'image/avif': fileExt = '.avif'; break
    case 'image/apng': fileExt = '.apng'; break
    case 'image/svg+xml': fileExt = '.svg'; break
  }

  const fileName = sanitizeAssetFileName(name, `ai-generated-${Date.now()}`, mimeType)
  const destPath = join(canvasAssetsDir, fileName)

  await mkdir(canvasAssetsDir, { recursive: true })
  await writeFile(destPath, decoded)

  return {
    src: `${globalAssetsRoute}${encodeURIComponent(fileName)}`,
    fileSize: decoded.length,
    fileExt
  }
}

// ---------------------------------------------------------------------------
// Image history
// ---------------------------------------------------------------------------

const IMAGE_HISTORY_FILE = join(canvasAssetsDir, 'image-history.json')
const IMAGE_HISTORY_MAX = 100

export async function loadImageHistory() {
  try {
    return await readJsonFile(IMAGE_HISTORY_FILE)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

export async function saveImageHistory(history) {
  await writeJsonAtomic(IMAGE_HISTORY_FILE, history)
}

export async function appendImageHistory(entry) {
  const history = await loadImageHistory()
  history.unshift(entry)
  if (history.length > IMAGE_HISTORY_MAX) {
    history.length = IMAGE_HISTORY_MAX
  }
  await saveImageHistory(history)
}

export async function deleteImageHistoryEntry(index) {
  const history = await loadImageHistory()
  if (index < 0 || index >= history.length) return history
  history.splice(index, 1)
  await saveImageHistory(history)
  return history
}

// ---------------------------------------------------------------------------
// Page management
// ---------------------------------------------------------------------------

export async function loadPageManifest() {
  try {
    return await readJsonFile(pagesManifestFile)
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, source: 'cowart', pages: [] }
    throw error
  }
}

export async function savePageManifest(manifest) {
  await writeJsonAtomic(pagesManifestFile, manifest)
}

export async function createPageRecord(pageId, name, index) {
  const { createTLStore } = await import('tldraw')
  const validationStore = createTLStore()
  const emptySnapshot = validationStore.emptyDocumentSnapshot()

  const pageRecord = {
    ...emptySnapshot.store[':document'],
    id: ':document',
    typeName: 'document'
  }

  const snapshot = {
    schema: emptySnapshot.schema,
    store: {
      ...emptySnapshot.store,
      [pageId]: {
        id: pageId,
        typeName: 'page',
        type: 'page',
        name,
        index,
        color: 'transparent',
        isLocked: false
      }
    }
  }

  const dir = join(canvasPagesDir, pageDirName(pageId))
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, canvasFileName)
  await writeJsonAtomic(filePath, snapshot)

  const manifest = await loadPageManifest()
  manifest.pages.push({ id: pageId, name, index, path: relative(canvasDir, filePath) })
  manifest.pages.sort((a, b) => String(a.index).localeCompare(String(b.index)))
  await savePageManifest(manifest)

  return { pageId, name, index, path: filePath }
}

export async function deletePageFile(pageId) {
  const pageDir = join(canvasPagesDir, pageDirName(pageId))
  try {
    await rename(pageDir, `${pageDir}.deleted.${Date.now()}`)
  } catch {
    // Best-effort cleanup
  }
}

export async function renamePageInManifest(pageId, newName) {
  const manifest = await loadPageManifest()
  const page = manifest.pages.find((p) => p.id === pageId)
  if (page) {
    page.name = newName
    await savePageManifest(manifest)
  }
  return manifest
}
