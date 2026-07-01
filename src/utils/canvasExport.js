/**
 * Canvas export utilities using tldraw's built-in export methods.
 * No external dependencies needed.
 */

/**
 * Export the current viewport as a PNG image and trigger download.
 */
export async function exportCanvasAsPNG(editor, options = {}) {
  const { shapeIds, backgroundColor } = options

  const exportOptions = {
    backgroundColor: backgroundColor || '#ffffff',
    padding: 10,
    format: 'png'
  }

  if (shapeIds && shapeIds.length > 0) {
    exportOptions.shapeIds = shapeIds
  }

  const result = await editor.exportImage(exportOptions)

  if (!result || !result.blob) {
    throw new Error('Export failed: no data returned')
  }

  downloadBlob(result.blob, `cowart-export-${Date.now()}.png`)
  return result
}

/**
 * Export the current viewport as an SVG and trigger download.
 */
export async function exportCanvasAsSVG(editor, options = {}) {
  const { shapeIds } = options

  const exportOptions = {
    format: 'svg'
  }

  if (shapeIds && shapeIds.length > 0) {
    exportOptions.shapeIds = shapeIds
  }

  const result = await editor.exportSvg(exportOptions)

  if (!result || !result.blob) {
    throw new Error('Export failed: no data returned')
  }

  downloadBlob(result.blob, `cowart-export-${Date.now()}.svg`)
  return result
}

/**
 * Trigger a browser download for a Blob.
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
