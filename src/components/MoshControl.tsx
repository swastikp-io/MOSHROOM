import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { RotateCcw } from 'lucide-react'

export interface MoshControlHandle {
  updateIntensity: (value: number) => void
}

interface MoshControlProps {
  value: number
  onChange: (value: number) => void
  onRestore?: () => void
  moshIntensity?: number
  disabled?: boolean
}

export const MoshControl = forwardRef<MoshControlHandle, MoshControlProps>(({
  value,
  onChange,
  onRestore,
  moshIntensity = 0,
  disabled = false,
}, ref) => {
  const intensityTextRef = useRef<HTMLSpanElement | null>(null)
  const intensityBarRef = useRef<HTMLDivElement | null>(null)

  useImperativeHandle(ref, () => ({
    updateIntensity: (val: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(val)))
      if (intensityTextRef.current) {
        intensityTextRef.current.textContent = `${clamped}%`
      }
      if (intensityBarRef.current) {
        intensityBarRef.current.style.width = `${clamped}%`
      }
    },
  }))

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value))
  }

  return (
    <div className="w-full flex flex-col gap-3 py-3 px-4 border border-neutral-800 bg-neutral-950 font-mono">
      {/* Top Header: Label, Numeric Badge, and RESTORE Button */}
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="particle-displacement-slider"
          className="text-xs tracking-widest text-neutral-300 uppercase select-none font-medium"
        >
          PARTICLE DISPLACEMENT
        </label>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono text-white tabular-nums px-2 py-0.5 border border-neutral-800 bg-black min-w-[3rem] text-center"
            aria-live="polite"
          >
            {value}
          </span>
          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              disabled={disabled}
              title="Restore live feed to original pristine state"
              className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-mono tracking-wider border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3 text-neutral-400" />
              <span>RESTORE</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Particle Displacement Slider (0–100, default 25) */}
      <div className="flex items-center gap-3 w-full">
        <span className="text-[10px] text-neutral-500 select-none">0</span>
        <div className="relative flex-1 flex items-center">
          <input
            id="particle-displacement-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={value}
            disabled={disabled}
            onChange={handleChange}
            aria-label="Particle displacement fling scale from 0 to 100"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            className="w-full h-1 bg-neutral-800 rounded-none appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-white"
          />
        </div>
        <span className="text-[10px] text-neutral-500 select-none">100</span>
      </div>

      {/* Monochromatic Read-Only Live Mosh Intensity Meter */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-900 text-[11px] text-neutral-500">
        <div className="flex items-center gap-2">
          <span className="tracking-wider uppercase">LIVE MOSH INTENSITY:</span>
          <span ref={intensityTextRef} className="text-white font-medium tabular-nums">{moshIntensity}%</span>
        </div>
        <div className="w-24 h-1.5 bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center">
          <div
            ref={intensityBarRef}
            className="h-full bg-white transition-all duration-75"
            style={{ width: `${Math.max(0, Math.min(100, moshIntensity))}%` }}
          />
        </div>
      </div>
    </div>
  )
})
