/**
 * Hook for page management: load manifest, create/switch/rename/delete pages.
 */
import { useCallback, useEffect, useState } from 'react'

const PAGES_ENDPOINT = '/api/pages'

export default function usePageManagement(editor) {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPages = useCallback(async () => {
    if (!editor) return
    try {
      const resp = await fetch(PAGES_ENDPOINT)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setPages(data.pages || [])
    } catch {
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [editor])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  // Refresh when pages change on the server
  useEffect(() => {
    if (!editor) return
    const unsub = editor.store.listen(
      () => { fetchPages() },
      { source: 'user', scope: 'document' }
    )
    return unsub
  }, [editor, fetchPages])

  const createPage = useCallback(async () => {
    try {
      const resp = await fetch(PAGES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `页面 ${pages.length + 1}` })
      })
      if (!resp.ok) throw new Error('Create page failed')
      const data = await resp.json()
      // Create the page in tldraw
      editor.setCurrentPage(data.pageId)
      await fetchPages()
    } catch (err) {
      console.error('[PageManagement] createPage failed:', err)
    }
  }, [editor, pages.length, fetchPages])

  const switchPage = useCallback(
    (pageId) => {
      if (editor && editor.getPage(pageId)) {
        editor.setCurrentPage(pageId)
      }
    },
    [editor]
  )

  const renamePage = useCallback(
    async (pageId, newName) => {
      try {
        const resp = await fetch(`${PAGES_ENDPOINT}/${pageId}/rename`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        })
        if (!resp.ok) throw new Error('Rename failed')
        await fetchPages()
      } catch (err) {
        console.error('[PageManagement] renamePage failed:', err)
      }
    },
    [fetchPages]
  )

  const deletePage = useCallback(
    async (pageId) => {
      try {
        const resp = await fetch(`${PAGES_ENDPOINT}/${pageId}`, { method: 'DELETE' })
        if (!resp.ok) throw new Error('Delete failed')
        // Switch to first remaining page or create new
        const remaining = pages.filter((p) => p.id !== pageId)
        if (remaining.length > 0) {
          switchPage(remaining[0].id)
        } else {
          await createPage()
        }
        await fetchPages()
      } catch (err) {
        console.error('[PageManagement] deletePage failed:', err)
      }
    },
    [pages, switchPage, createPage, fetchPages]
  )

  return {
    pages,
    loading,
    createPage,
    switchPage,
    renamePage,
    deletePage,
    refresh: fetchPages
  }
}
