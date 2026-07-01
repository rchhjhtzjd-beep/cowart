const PROXY_URL = '/api/generate'

export const SIZE_MAP = {
  '1-1': '1024x1024', '3-2': '1024x768', '2-3': '768x1024',
  '4-3': '1024x768', '3-4': '768x1024', '16-9': '1024x576', '9-16': '576x1024'
}

async function fetchWithRetry(url, options, retries = 3) {
  let lastError
  for (let a = 0; a <= retries; a++) {
    let r; try { r = await fetch(url, options) } catch (e) { lastError = e; if (a === retries) throw e; await sleep(1000 * Math.pow(2, a)); continue }
    if (r.ok) return r
    const s = r.status, t = await r.text()
    if ((s >= 500 || t.includes('upstream error')) && a < retries) { lastError = new Error(`HTTP ${s}: ${t}`); await sleep(1000 * Math.pow(2, a)); continue }
    return new Response(t, { status: s, headers: { 'Content-Type': 'text/plain' } })
  }
  throw lastError
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export async function generateImages({ prompt, aspectId, customWidth, customHeight, referenceImages, negativePrompt, seed }) {
  if (!prompt?.trim()) throw new Error('Prompt required')
  let size = '1024x768'
  if (customWidth && customHeight) size = `${customWidth}x${customHeight}`
  else if (aspectId && SIZE_MAP[aspectId]) size = SIZE_MAP[aspectId]

  const body = { prompt: prompt.trim(), size }
  if (aspectId && SIZE_MAP[aspectId]) body.aspectId = aspectId
  if (customWidth && customHeight) { body.customWidth = customWidth; body.customHeight = customHeight }
  if (negativePrompt?.trim()) body.negativePrompt = negativePrompt.trim()
  if (typeof seed === 'number' && seed >= 0 && seed <= 2147483647) body.seed = seed
  if (referenceImages?.length > 0) body.referenceImages = referenceImages

  const r = await fetchWithRetry(PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`Generate error (${r.status}): ${e.error || r.statusText}`) }
  return (await r.json()).data || []
}

export function getAspectIconStyle(p) {
  const m = Math.min(22 / p.w, 22 / p.h)
  return { width: `${Math.max(8, Math.round(p.w * m))}px`, height: `${Math.max(8, Math.round(p.h * m))}px` }
}

export { PROXY_URL }
