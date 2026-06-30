/**
 * Pure CSS loading spinner — no dependencies.
 */
export default function LoadingSpinner({ size = 32 }) {
  return (
    <div
      className="agi-spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label="加载中"
    />
  )
}
