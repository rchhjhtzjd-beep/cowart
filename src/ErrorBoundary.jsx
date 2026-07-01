import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main
          style={{
            display: 'grid',
            placeItems: 'center',
            width: '100%',
            height: '100%',
            padding: '32px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '14px',
            lineHeight: 1.6,
            color: '#e53e3e',
            background: '#fef2f2',
            overflow: 'auto',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ maxWidth: '720px', width: '100%' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px' }}>
              ⚠️ 渲染错误
            </h2>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#fff',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #fecaca'
            }}>
              {this.state.error.stack || String(this.state.error)}
            </pre>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
