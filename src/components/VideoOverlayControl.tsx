import React, { useRef } from 'react'
import { Film, Play, Pause, Repeat, Upload, X, Layers } from 'lucide-react'
import {
  BLEND_MODE_CATEGORIES,
  type BlendModeId,
} from '../lib/datamosh/blendModes.ts'

interface VideoOverlayControlProps {
  fileName: string | null
  isPlaying: boolean
  isLooping: boolean
  blendMode: BlendModeId
  opacity: number // 0.0 to 1.0
  onFileSelect: (file: File) => void
  onTogglePlay: () => void
  onToggleLoop: () => void
  onBlendModeChange: (mode: BlendModeId) => void
  onOpacityChange: (opacity: number) => void
  onClear: () => void
  disabled?: boolean
}

export const VideoOverlayControl: React.FC<VideoOverlayControlProps> = ({
  fileName,
  isPlaying,
  isLooping,
  blendMode,
  opacity,
  onFileSelect,
  onTogglePlay,
  onToggleLoop,
  onBlendModeChange,
  onOpacityChange,
  onClear,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
    // Reset file input value so selecting the same file again triggers change
    if (e.target) {
      e.target.value = ''
    }
  }

  const truncatedName = fileName
    ? fileName.length > 20
      ? fileName.slice(0, 17) + '...'
      : fileName
    : null

  const opacityPercent = Math.round(opacity * 100)

  return (
    <div className="w-full flex flex-col gap-3 py-3 px-4 border border-neutral-800 bg-neutral-950 font-mono text-xs">
      {/* Hidden file input supporting common video formats */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.m4v,.mkv"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Header: Status Indicator & File Title */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 select-none">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              fileName && isPlaying ? 'bg-cyan-400 animate-pulse' : 'bg-neutral-600'
            }`}
          />
          <span className="tracking-widest uppercase font-medium text-neutral-300">
            VIDEO OVERLAY
          </span>
        </div>

        {truncatedName ? (
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 border border-neutral-800 bg-black text-neutral-300 tracking-wider truncate max-w-[150px]"
              title={fileName || ''}
            >
              <Film className="w-3 h-3 text-neutral-400 shrink-0" />
              <span className="truncate">{truncatedName}</span>
            </div>
            <button
              type="button"
              onClick={onClear}
              title="Remove overlay video"
              className="p-1 border border-neutral-800 hover:border-neutral-600 bg-black hover:bg-neutral-900 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-neutral-600 tracking-wider">
            LOOP OVERLAY
          </span>
        )}
      </div>

      {/* Row 1: Upload / Change & Playback / Loop Controls */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-900">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Upload overlay video (.mp4, .webm, .mov)"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs tracking-wider border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
        >
          <Upload className="w-3 h-3 text-neutral-400" />
          <span>{fileName ? 'CHANGE' : 'ADD VIDEO OVERLAY'}</span>
        </button>

        {fileName && (
          <div className="flex items-center gap-1.5">
            {/* Play / Pause Toggle */}
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={disabled}
              title={isPlaying ? 'Pause Overlay Video' : 'Play Overlay Video'}
              className="flex items-center gap-1 px-2 py-1 text-xs tracking-wider border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3 h-3 text-neutral-300 fill-current" />
                  <span>PAUSE</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-neutral-300 fill-current" />
                  <span>PLAY</span>
                </>
              )}
            </button>

            {/* Loop Toggle */}
            <button
              type="button"
              onClick={onToggleLoop}
              disabled={disabled}
              title={isLooping ? 'Looping Enabled' : 'Looping Disabled'}
              className={`flex items-center gap-1 px-2 py-1 text-xs tracking-wider border transition-colors cursor-pointer select-none ${
                isLooping
                  ? 'bg-neutral-200 text-black border-neutral-200 font-medium'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>LOOP</span>
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Blend Modes Dropdown & Opacity Slider (Visible when video is loaded) */}
      {fileName && (
        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-900">
          {/* Blend Mode Selector */}
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="overlay-blend-mode-select"
              className="flex items-center gap-1.5 text-[11px] text-neutral-400 select-none uppercase tracking-wider"
            >
              <Layers className="w-3 h-3 text-neutral-500" />
              <span>BLEND MODE</span>
            </label>

            <select
              id="overlay-blend-mode-select"
              value={blendMode}
              disabled={disabled}
              onChange={(e) => onBlendModeChange(e.target.value as BlendModeId)}
              className="bg-black text-neutral-200 border border-neutral-700 text-xs px-2 py-1 focus:outline-none focus:border-white font-mono cursor-pointer"
            >
              {BLEND_MODE_CATEGORIES.map((category) => (
                <optgroup
                  key={category.category}
                  label={category.category}
                  className="bg-neutral-950 text-neutral-400 font-sans"
                >
                  {category.modes.map((mode) => (
                    <option
                      key={mode.id}
                      value={mode.id}
                      className="bg-black text-white font-mono"
                    >
                      {mode.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Opacity Slider */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider select-none">
              OPACITY
            </span>

            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={opacityPercent}
                disabled={disabled}
                onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                aria-label="Overlay Opacity Percentage"
                className="w-full h-1 bg-neutral-800 rounded-none appearance-none cursor-pointer disabled:opacity-40 accent-white"
              />
              <span className="text-[11px] text-white tabular-nums px-1.5 py-0.5 border border-neutral-800 bg-black min-w-[2.5rem] text-center">
                {opacityPercent}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
