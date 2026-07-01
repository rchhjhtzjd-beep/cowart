/**
 * Historical gallery of generated images. Shows thumbnails from image-history.json.
 */
import { useCallback, useState } from 'react'
import LoadingSpinner from './LoadingSpinner'

const HISTORY_ENDPOINT = '/api/image-history'

export default function ImageHistory({ onInsert, onDelete }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(HISTORY_ENDPOINT)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setImages(data.history || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDelete = useCallback(
    async (index) => {
      try {
        const resp = await fetch(`${HISTORY_ENDPOINT}/${index}`, { method: 'DELETE' })
        if (!resp.ok) throw new Error('Delete failed')
        const data = await resp.json()
        setImages(data.history || [])
        if (onDelete) onDelete(index)
      } catch {
        setError('删除失败')
      }
    },
    [onDelete]
  )

  const handleDownload = useCallback(async (img) => {
    try {
      const resp = await fetch(img.assetUrl)
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `history-${img.timestamp || Date.now()}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(img.assetUrl, '_blank')
    }
  }, [])

  if (loading) {
    return (
      <div className="cowart-image-history cowart-image-history--loading">
        <LoadingSpinner size={28} />
        <span className="cowart-image-history-loading-text">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cowart-image-history cowart-image-history--error">
        <p>{error}</p>
        <button className="cowart-image-history-retry-btn" onClick={fetchHistory} type="button">
          重试
        </button>
      </div>
    )
  }

  if (!images.length) return null

  return (
    <>
      <div className="cowart-image-history">
        <div className="cowart-image-history-grid">
          {images.map((img, i) => {
            const src = img.assetUrl || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : null)
            if (!src) return null
            return (
              <div key={i} className="cowart-image-history-item">
                <img
                  src={src}
                  alt={img.prompt || `Image ${i + 1}`}
                  onClick={() => setLightbox(src)}
                  className="cowart-image-history-thumb"
                />
                <div className="cowart-image-history-item-overlay">
                  <button
                    className="cowart-image-history-action-btn"
                    onClick={() => onInsert && onInsert(img)}
                    title="插入到画布"
                    type="button"
                  >
                    <svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v14" /><polyline points="14 3 14 9 19 9" /><polyline points="3 14 8 14 8 9" /></svg>
                  </button>
                  <button
                    className="cowart-image-history-action-btn"
                    onClick={() => handleDownload(img)}
                    title="下载"
                    type="button"
                  >
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  </button>
                  <button
                    className="cowart-image-history-action-btn cowart-image-history-action-btn--danger"
                    onClick={() => handleDelete(i)}
                    title="删除"
                    type="button"
                  >
                    <svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="19" y1="6" x2="19" y2="20" /></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {lightbox && (
        <div className="cowart-image-history-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="预览" />
          <button className="cowart-image-history-lightbox-close" onClick={() => setLightbox(null)} type="button">×</button>
        </div>
      )}
    </>
  )
}
