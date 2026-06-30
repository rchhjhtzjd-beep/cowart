/**
 * Cowart sidebar panel for AI image generation.
 * Integrates with the existing AI image holder workflow.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createShapeId } from 'tldraw'
import { useEditor, useValue } from 'tldraw'
import { generateImages, SIZE_MAP } from '../api/agnesApi.js'
import AspectRatioSelector from '../components/AspectRatioSelector'
import SizeInputs from '../components/SizeInputs'
import './CowartImagePanel.css'

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const PRESET_LIST = [
  { id: '1-1', label: '1:1', w: 512, h: 512 },
  { id: '3-2', label: '3:2', w: 768, h: 512 },
  { id: '2-3', label: '2:3', w: 512, h: 768 },
  { id: '4-3', label: '4:3', w: 683, h: 512 },
  { id: '3-4', label: '3:4', w: 512, h: 683 },
  { id: '16-9', label: '16:9', w: 1024, h: 576 },
  { id: '9-16', label: '9:16', w: 512, h: 910 }
]

export default function CowartImagePanel() {
  const editor = useEditor()

  // Track selected AI image holder
  const selectedHolder = useValue(
    'cowart image panel: selected holder',
    () => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0])
      if (!shape) return null
      // Frame holder
      if (shape.type === 'frame' && shape.meta?.cowartAiImageHolder) return shape
      // Legacy geo rectangle holder
      if (shape.type === 'geo' && shape.meta?.cowartAiImageHolder) return shape
      return null
    },
    [editor]
  )

  const [prompt, setPrompt] = useState('')
  const [activePreset, setActivePreset] = useState('3-4')
  const [customWidth, setCustomWidth] = useState(512)
  const [customHeight, setCustomHeight] = useState(683)
  const [aspectLocked, setAspectLocked] = useState(true)
  const [referencePreview, setReferencePreview] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)

  // Sync preset values when holder selection changes
  useEffect(() => {
    if (selectedHolder) {
      const w = Math.round(selectedHolder.props.w)
      const h = Math.round(selectedHolder.props.h)
      setCustomWidth(w)
      setCustomHeight(h)
      // Find matching preset
      const ratio = w / h
      const match = PRESET_LIST.find((p) => {
        const pr = p.w / p.h
        return Math.abs(pr - ratio) < 0.05
      })
      if (match) setActivePreset(match.id)
    }
  }, [selectedHolder?.id, selectedHolder?.props.w, selectedHolder?.props.h])

  const handlePresetChange = useCallback((id) => {
    setActivePreset(id)
    const p = PRESET_LIST.find((pp) => pp.id === id)
    if (p) {
      setCustomWidth(p.w)
      setCustomHeight(p.h)
    }
  }, [])

  const handleWidthChange = useCallback((w) => {
    setCustomWidth(w)
    setAspectLocked(false)
  }, [])

  const handleHeightChange = useCallback((h) => {
    setCustomHeight(h)
    setAspectLocked(false)
  }, [])

  const toggleAspectLock = useCallback(() => {
    setAspectLocked((v) => !v)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const results = await generateImages({
        prompt,
        aspectId: activePreset,
        referenceImages: referencePreview ? [referencePreview] : undefined
      })
      setResults(results)
    } catch (err) {
      setError(err.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }, [prompt, activePreset, referencePreview])

  const insertImage = useCallback(
    async (imageInfo) => {
      const { url, b64_json, width, height } = imageInfo
      // Resolve actual dimensions
      const imgWidth = width || customWidth
      const imgHeight = height || customHeight

      // Get base64 data: prefer b64_json from API, fallback to fetch URL
      let base64Data = b64_json
      if (!base64Data && url) {
        try {
          const resp = await fetch(url)
          const blob = await resp.blob()
          base64Data = await blobToBase64(blob)
        } catch {
          setError('下载图片失败，请重试')
          return
        }
      }

      if (!base64Data) {
        setError('无法获取图片数据')
        return
      }

      // Upload to server to save locally
      let assetSrc
      try {
        const assetResp = await fetch('/api/asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: base64Data,
            mimeType: 'image/png',
            name: `ai-generated-${Date.now()}`,
            w: imgWidth,
            h: imgHeight
          })
        })
        if (!assetResp.ok) {
          throw new Error(`Asset upload failed: ${assetResp.status}`)
        }
        const assetData = await assetResp.json()
        assetSrc = assetData.src
      } catch {
        setError('保存图片到画布失败')
        return
      }

      if (!selectedHolder) {
        // Standalone: insert on current page
        const pageId = editor.getCurrentPageId()
        const assetId = createShapeId()
        const shapeId = createShapeId()
        const size = Math.min(imgWidth, imgHeight)

        editor.store.put([
          {
            id: assetId,
            typeName: 'asset',
            assetType: 'image',
            props: {
              name: `ai-generated-${Date.now()}.png`,
              mimeType: 'image/png',
              src: assetSrc,
              w: imgWidth,
              h: imgHeight,
              fileSize: null
            }
          },
          {
            id: shapeId,
            typeName: 'shape',
            type: 'image',
            parentId: pageId,
            x: editor.getViewportPageBounds().center.x - size / 2,
            y: editor.getViewportPageBounds().center.y - size / 2,
            rotation: 0,
            props: {
              assetId,
              w: size,
              h: Math.round(size * (imgHeight / imgWidth))
            },
            meta: { cowartGeneratedStandalone: true }
          }
        ])
        editor.select(shapeId)
        return
      }

      // Holder workflow: insert as child of the frame
      const holder = selectedHolder
      const holderW = Math.round(holder.props.w)
      const holderH = Math.round(holder.props.h)
      const assetId = createShapeId()
      const shapeId = createShapeId()
      const parentId = holder.type === 'frame' ? holder.id : holder.parentId

      editor.store.put([
        {
          id: assetId,
          typeName: 'asset',
          assetType: 'image',
          props: {
            name: `ai-generated-${Date.now()}.png`,
            mimeType: 'image/png',
            src: assetSrc,
            w: imgWidth,
            h: imgHeight,
            fileSize: null
          }
        },
        {
          id: shapeId,
          typeName: 'shape',
          type: 'image',
          parentId,
          x: holder.type === 'frame' ? 0 : holder.x,
          y: holder.type === 'frame' ? 0 : holder.y,
          rotation: 0,
          props: {
            assetId,
            w: holderW,
            h: holderH
          },
          meta: { cowartGeneratedForAiImageHolder: holder.id }
        }
      ])
      editor.select(shapeId)
    },
    [selectedHolder, editor, customWidth, customHeight]
  )

  const handleDownload = useCallback(async (url) => {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ai-generated-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank')
    }
  }, [])

  const hasHolder = selectedHolder !== null
  const presetLocked = aspectLocked && !!PRESET_LIST.find((p) => p.id === activePreset)

  return (
    <div className="cowart-ai-image-gen-panel" aria-label="AI 生图面板">
      {/* Prompt */}
      <div className="cowart-ai-image-gen-section">
        <div className="cowart-ai-image-gen-heading">提示词</div>
        <textarea
          className="cowart-ai-image-gen-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想要的图片…"
          rows={3}
        />
      </div>

      {/* Reference image upload */}
      <div className="cowart-ai-image-gen-section">
        <div className="cowart-ai-image-gen-heading">参考图（可选）</div>
        <div className="cowart-ai-image-gen-actions">
          <UploadButton
            onUpload={(dataUrl) => setReferencePreview(dataUrl)}
          />
          {referencePreview && (
            <div className="cowart-ai-image-gen-ref-thumb">
              <img src={referencePreview} alt="参考图" />
              <button
                className="cowart-ai-image-gen-ref-remove"
                onClick={() => setReferencePreview(null)}
                type="button"
                title="移除"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Aspect ratio */}
      <div className="cowart-ai-image-gen-section">
        <div className="cowart-ai-image-gen-heading">比例</div>
        <AspectRatioSelector
          activePreset={activePreset}
          onSelect={handlePresetChange}
          compact
        />
      </div>

      {/* Custom size */}
      <div className="cowart-ai-image-gen-section">
        <div className="cowart-ai-image-gen-heading">尺寸</div>
        <SizeInputs
          width={customWidth}
          height={customHeight}
          onWidthChange={handleWidthChange}
          onHeightChange={handleHeightChange}
          aspectLocked={aspectLocked}
          onToggleAspectLock={toggleAspectLock}
        />
      </div>

      {/* Generate button */}
      <button
        className="cowart-ai-image-gen-generate-btn"
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        type="button"
      >
        {loading ? '生成中…' : '✨ 生成图片'}
      </button>

      {/* Results */}
      {loading && (
        <div className="cowart-ai-image-gen-spinner" />
      )}

      {error && (
        <div className="cowart-ai-image-gen-error">
          {error}
        </div>
      )}

      {results.map((img, i) => {
        const src = img.url || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : null)
        if (!src) return null
        const preset = PRESET_LIST.find((p) => p.id === activePreset)
        return (
          <div key={i} className="cowart-ai-image-gen-result">
            <img
              src={src}
              alt={`生成的图片 ${i + 1}`}
              onClick={() => setLightboxUrl(src)}
            />
            <div className="cowart-ai-image-gen-result-actions">
              <button
                className="cowart-ai-image-gen-result-btn"
                onClick={() => insertImage({
                  url: img.url,
                  b64_json: img.b64_json,
                  width: preset?.w,
                  height: preset?.h
                })}
                title="插入到画布"
                type="button"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M5 3h14a2 2 0 0 1 2 2v14" />
                  <polyline points="14 3 14 9 19 9" />
                  <polyline points="3 14 8 14 8 9" />
                </svg>
              </button>
              <button
                className="cowart-ai-image-gen-result-btn"
                onClick={() => handleDownload(src)}
                title="下载"
                type="button"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}

      {!results.length && !loading && !error && hasHolder && (
        <div className="cowart-ai-image-gen-placeholder">
          输入提示词后点击「生成图片」
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="cowart-ai-image-gen-lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="预览" />
          <button
            className="cowart-ai-image-gen-lightbox-close"
            onClick={() => setLightboxUrl(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

function UploadButton({ onUpload }) {
  const inputRef = useRef(null)

  const handleChange = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => onUpload(reader.result)
      reader.readAsDataURL(file)
      e.target.value = ''
    },
    [onUpload]
  )

  return (
    <button
      type="button"
      className="cowart-ai-image-gen-upload-btn"
      onClick={() => inputRef.current?.click()}
    >
      <svg
        className="cowart-ai-image-gen-upload-icon"
        viewBox="0 0 24 24"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      上传
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </button>
  )
}
