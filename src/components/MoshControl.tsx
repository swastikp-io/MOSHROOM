import React from 'react'
import { RotateCcw } from 'lucide-react'

interface MoshControlProps {
  value: number
  onChange: (value: number) => void
  onRestore?: () => void
  disabled?: boolean
}

export const MoshControl: React.FC<MoshControlProps> = ({
  value,
  onChange,
  onRestore,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value))
  }

  return (
    <div className="w-full max-w-4xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 px-4 border border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between sm:justify-start gap-4">
        <label
          htmlFor="mosh-amount-slider"
          className="text-xs tracking-widest font-mono text-neutral-300 uppercase select-none font-medium"
        >
          MOSHROOM AMOUNT
        </label>
        <span
          className="text-sm font-mono text-white tabular-nums px-2 py-0.5 border border-neutral-800 bg-black min-w-[3.5rem] text-right"
          aria-live="polite"
        >
          {value}
        </span>
      </div>

      <div className="flex-1 flex items-center gap-3 w-full">
        <span className="text-[10px] font-mono text-neutral-500 select-none">0</span>
        <div className="relative flex-1 flex items-center">
          <input
            id="mosh-amount-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={value}
            disabled={disabled}
            onChange={handleChange}
            aria-label="Datamosh intensity amount from 0 to 100"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            className="w-full h-1 bg-neutral-800 rounded-none appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-white"
          />
        </div>
        <span className="text-[10px] font-mono text-neutral-500 select-none">100</span>

        {onRestore && (
          <button
            type="button"
            onClick={onRestore}
            disabled={disabled}
            title="Restore live feed to original and reset amount to 50"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono tracking-wider border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer shrink-0 ml-1"
          >
            <RotateCcw className="w-3 h-3 text-neutral-400" />
            <span>RESTORE</span>
          </button>
        )}
      </div>
    </div>
  )
}
