/**
 * Result gallery: grid of generated images with download links and lightbox.
 */
import { useState, useCallback } from 'react'
import LoadingSpinner from './LoadingSpinner'

export default function ImageGallery({ images, isLoading, error, onRetry }) {
  const [lightbox, setLightbox] = useState(null)

  const handleDownload = useCallback(async (url, filename) => {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename || 'generated.png'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank')
    }
  }, [])

  if (isLoading) {
    return (
      <div className="agi-gallery agi-gallery--loading">
        <LoadingSpinner size={40} />
        <span className="agi-gallery-loading-text">生成中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="agi-gallery agi-gallery--error">
        <p>{error}</p>
        <button className="agi-retry-btn" onClick={onRetry} type="button">
          重试
        </button>
      </div>
    )
  }

  if (!images?.length) return null

  return (
    <>
      <div className="agi-gallery">
        <div className="agi-gallery-grid">
          {images.map((img, i) => (
            <div key={i} className="agi-gallery-item">
              {img.url ? (
                <img
                  src={img.url}
                  alt={`Generated image ${i + 1}`}
                  onClick={() => setLightbox(img.url)}
                  className="agi-gallery-img"
                />
              ) : img.b64_json ? (
                <img
                  src={`data:image/png;base64,${img.b64_json}`}
                  alt={`Generated image ${i + 1}`}
                  onClick={() => setLightbox(`data:image/png;base64,${img.b64_json}`)}
                  className="agi-gallery-img"
                />
              ) : null}
              <div className="agi-gallery-actions">
                <button
                  className="agi-download-btn"
                  onClick={() =>
                    handleDownload(
                      img.url || `data:image/png;base64,${img.b64_json}`,
                      `image-${Date.now()}.png`
                    )
                  }
                  type="button"
                  title="下载"
                >
                  <svg
                    className="agi-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {lightbox && (
        <div className="agi-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Preview" />
          <button
            className="agi-lightbox-close"
            onClick={() => setLightbox(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
