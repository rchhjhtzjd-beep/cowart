/**
 * Shared API module for Agnes AI image generation.
 *
 * Covers text-to-image and image-to-image via the Agnes AI API.
 * Key contract detail: `response_format` and `image` must sit inside
 * `extra_body`, NOT at the top level.
 */

const AGNES_API_URL = 'https://apihub.agnes-ai.com/v1/images/generations'
const AGNES_API_KEY = 'sk-se0tt5bq99AqRVajPl6iGCKo8OPNbkNLptzYPQMSHynrZTst'
const MODEL = 'agnes-image-2.1-flash'

/**
 * Maps Cowart-style aspect preset IDs to Agnes API size strings.
 * Keys: '1-1', '3-2', '2-3', '4-3', '3-4', '16-9', '9-16'
 * Values: '<W>x<H>' matching Agnes-supported resolutions.
 */
export const SIZE_MAP = {
  '1-1': '1024x1024',
  '3-2': '1024x768',
  '2-3': '768x1024',
  '4-3': '1024x768',
  '3-4': '768x1024',
  '16-9': '1024x576',
  '9-16': '576x1024'
}

/**
 * Generate images via the Agnes AI API.
 *
 * @param {Object} params
 * @param {string} params.prompt - Text prompt for the image
 * @param {string} [params.aspectId] - Preset ID from SIZE_MAP (e.g. '1-1')
 * @param {number} [params.customWidth] - Custom width in pixels
 * @param {number} [params.customHeight] - Custom height in pixels
 * @param {string[]} [params.referenceImages] - URLs for image-to-image
 * @returns {Promise<Array<{url: string, b64_json: string | null}>>}
 */
/**
 * @param {string} [params.negativePrompt] - Things to exclude from the image
 * @param {number} [params.seed] - Reproducibility seed
 */
export async function generateImages({
  prompt,
  aspectId,
  customWidth,
  customHeight,
  referenceImages,
  negativePrompt,
  seed
}) {
  if (!prompt?.trim()) {
    throw new Error('Prompt is required')
  }

  // Determine size string
  let size
  if (customWidth && customHeight) {
    size = `${customWidth}x${customHeight}`
  } else if (aspectId && SIZE_MAP[aspectId]) {
    size = SIZE_MAP[aspectId]
  } else {
    size = '1024x768' // API default
  }

  const body = {
    model: MODEL,
    prompt: prompt.trim(),
    size,
    extra_body: {
      response_format: 'b64_json'
    }
  }

  if (negativePrompt && typeof negativePrompt === 'string' && negativePrompt.trim()) {
    body.extra_body.negative_prompt = negativePrompt.trim()
  }
  if (typeof seed === 'number' && Number.isFinite(seed) && seed >= 0 && seed <= 2147483647) {
    body.extra_body.seed = seed
  }

  // Image-to-image: reference images go inside extra_body.image
  if (referenceImages && referenceImages.length > 0) {
    body.extra_body.image = referenceImages
  }

  const response = await fetch(AGNES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AGNES_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Agnes API error (${response.status}): ${errorText || response.statusText}`
    )
  }

  const data = await response.json()
  return data.data || []
}

/**
 * Compute inline style for a small aspect-ratio preview icon.
 */
export function getAspectIconStyle(preset) {
  const maxSize = 22
  const scale = Math.min(maxSize / preset.w, maxSize / preset.h)
  return {
    width: `${Math.max(8, Math.round(preset.w * scale))}px`,
    height: `${Math.max(8, Math.round(preset.h * scale))}px`
  }
}

export { AGNES_API_URL, MODEL }
