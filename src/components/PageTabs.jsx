/**
 * Horizontal page tab bar above the canvas.
 * Shows page names with +/rename/delete actions.
 */
import { useCallback, useRef, useState } from 'react'

export default function PageTabs({ pages, currentPageId, onCreate, onSwitch, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef(null)

  const startEdit = useCallback((page) => {
    setEditingId(page.id)
    setEditName(page.name)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 10)
  }, [])

  const commitEdit = useCallback(() => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }, [editingId, editName, onRename])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') commitEdit()
      if (e.key === 'Escape') setEditingId(null)
    },
    [commitEdit]
  )

  return (
    <div className="cowart-page-tabs" role="tablist" aria-label="画布页面">
      {pages.map((page) => (
        <div
          key={page.id}
          className={`cowart-page-tab${page.id === currentPageId ? ' cowart-page-tab--active' : ''}`}
          role="tab"
          aria-selected={page.id === currentPageId}
          onClick={() => onSwitch(page.id)}
          onDoubleClick={() => startEdit(page)}
        >
          {editingId === page.id ? (
            <input
              ref={inputRef}
              className="cowart-page-tab-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="cowart-page-tab-label">{page.name}</span>
          )}
          <button
            className="cowart-page-tab-close"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (pages.length > 1) onDelete(page.id)
            }}
            disabled={page.id === currentPageId}
            title={page.id === currentPageId ? '不能删除当前页面' : '删除页面'}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="cowart-page-tab cowart-page-tab--add"
        type="button"
        onClick={onCreate}
        title="新建页面"
      >
        +
      </button>
    </div>
  )
}
