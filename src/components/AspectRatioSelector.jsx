/**
 * Aspect ratio preset buttons rendered as a compact grid.
 */
import { getAspectIconStyle } from '../api/agnesApi.js'

const PRESETS = [
  { id: '1-1', label: '1:1', w: 512, h: 512 },
  { id: '3-2', label: '3:2', w: 768, h: 512 },
  { id: '2-3', label: '2:3', w: 512, h: 768 },
  { id: '4-3', label: '4:3', w: 683, h: 512 },
  { id: '3-4', label: '3:4', w: 512, h: 683 },
  { id: '16-9', label: '16:9', w: 1024, h: 576 },
  { id: '9-16', label: '9:16', w: 512, h: 910 }
]

export default function AspectRatioSelector({ activePreset, onSelect, compact }) {
  return (
    <div className={`agi-aspect-grid${compact ? ' agi-aspect-grid--compact' : ''}`}>
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          aria-pressed={activePreset === preset.id}
          className="agi-aspect-preset"
          onClick={() => onSelect(preset.id)}
          type="button"
          title={preset.label}
        >
          <span
            className="agi-aspect-icon"
            style={getAspectIconStyle(preset)}
          />
          <span className="agi-aspect-label">{preset.label}</span>
        </button>
      ))}
    </div>
  )
}
