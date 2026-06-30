/**
 * Prompt textarea with optional reference image upload for image-to-image.
 */
import { useCallback, useRef } from 'react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export default function ImagePromptInput({
  value,
  onChange,
  onReferenceImageUpload,
  referencePreview,
  onClearReference
}) {
  const fileInputRef = useRef(null)

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > MAX_FILE_SIZE) {
        alert('图片太大，请选择 10MB 以下的文件')
        return
      }
      const reader = new FileReader()
      reader.onload = () => onReferenceImageUpload(reader.result)
      reader.readAsDataURL(file)
      // Reset so the same file can be re-selected
      e.target.value = ''
    },
    [onReferenceImageUpload]
  )

  return (
    <div className="agi-prompt-input">
      <textarea
        className="agi-prompt-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="描述你想要的图片…"
        rows={4}
      />

      <div className="agi-prompt-actions">
        <button
          type="button"
          className="agi-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          title="上传参考图（图生图）"
        >
          <svg
            className="agi-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          上传参考图
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {referencePreview && (
          <div className="agi-ref-preview">
            <img src={referencePreview} alt="参考图预览" />
            <button
              type="button"
              className="agi-ref-clear"
              onClick={onClearReference}
              title="移除参考图"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
