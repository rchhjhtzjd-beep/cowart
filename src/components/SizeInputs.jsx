/**
 * Custom width / height inputs with aspect ratio lock toggle.
 */
import { useState, useCallback } from 'react'

const MIN_SIZE = 16
const MAX_SIZE = 8192

function clamp(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(Math.min(Math.max(value, MIN_SIZE), MAX_SIZE))
}

export default function SizeInputs({
  width,
  height,
  onWidthChange,
  onHeightChange,
  aspectLocked,
  onToggleAspectLock
}) {
  const [draftW, setDraftW] = useState(String(width))
  const [draftH, setDraftH] = useState(String(height))

  const commitWidth = useCallback(
    (val) => {
      const next = clamp(Number(val))
      if (!next) return
      setDraftW(String(next))
      onWidthChange(next)
    },
    [onWidthChange]
  )

  const commitHeight = useCallback(
    (val) => {
      const next = clamp(Number(val))
      if (!next) return
      setDraftH(String(next))
      onHeightChange(next)
    },
    [onHeightChange]
  )

  return (
    <div className="agi-size-row">
      <label className="agi-size-field">
        <span>宽</span>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={draftW}
          onChange={(e) => setDraftW(e.target.value)}
          onBlur={() => commitWidth(draftW)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraftW(String(width))
              e.currentTarget.blur()
            }
          }}
        />
      </label>

      <button
        type="button"
        aria-label={aspectLocked ? '解除宽高比例锁定' : '锁定宽高比例'}
        aria-pressed={aspectLocked}
        className="agi-aspect-lock"
        onClick={onToggleAspectLock}
      >
        <LockIcon locked={aspectLocked} />
      </button>

      <label className="agi-size-field">
        <span>高</span>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={draftH}
          onChange={(e) => setDraftH(e.target.value)}
          onBlur={() => commitHeight(draftH)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraftH(String(height))
              e.currentTarget.blur()
            }
          }}
        />
      </label>
    </div>
  )
}

function LockIcon({ locked }) {
  const d = locked
    ? 'M4.5 8.5h11a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zm0 0V6a3 3 0 0 1 6 0v2.5'
    : 'M4.5 8.5h11a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zm0 0V6.5a3 3 0 0 1 5.8-1.1'
  return (
    <svg
      aria-hidden
      className="agi-lock-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
      <path d={d} />
    </svg>
  )
}
