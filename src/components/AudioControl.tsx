import React, { useEffect, useRef, useState } from 'react'
import { Upload, Play, Pause, Repeat, Music } from 'lucide-react'
import type { AudioAnalyzer } from '../lib/audio/AudioAnalyzer.ts'

interface AudioControlProps {
  analyzer: AudioAnalyzer | null
  disabled?: boolean
}

export const AudioControl: React.FC<AudioControlProps> = ({
  analyzer,
  disabled = false,
}) => {
  const [fileName, setFileName] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [isLooping, setIsLooping] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const meterCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Listen to audio element events to keep UI buttons in sync
  useEffect(() => {
    if (!analyzer) return

    const audio = analyzer.getAudioElement()
    if (!audio) return

    // Default loop to true for continuous datamosh experimentation
    analyzer.setLoop(isLooping)

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      if (!analyzer.getIsLooping()) {
        setIsPlaying(false)
      }
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [analyzer, isLooping])

  // Real-time 60 FPS monochromatic 3-bar level meter (BASS / MID / HIGH)
  // Operates purely via canvas 2D context — zero React re-render overhead!
  useEffect(() => {
    const canvas = meterCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number

    const renderMeter = () => {
      animId = requestAnimationFrame(renderMeter)

      const metrics = analyzer?.getMetrics() || {
        bass: 0,
        mid: 0,
        high: 0,
        transient: 0,
        isPlaying: false,
      }

      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, w, h)

      const bands = [
        { label: 'B', val: metrics.isPlaying ? metrics.bass : 0, isTransient: metrics.transient > 0.25 },
        { label: 'M', val: metrics.isPlaying ? metrics.mid : 0, isTransient: false },
        { label: 'H', val: metrics.isPlaying ? metrics.high : 0, isTransient: false },
      ]

      const barCount = 3
      const padX = 3
      const padY = 3
      const gap = 3
      const barW = Math.floor((w - padX * 2 - gap * (barCount - 1)) / barCount)
      const maxH = h - padY * 2

      bands.forEach((band, idx) => {
        const x = padX + idx * (barW + gap)

        // Slot track background
        ctx.fillStyle = '#141414'
        ctx.fillRect(x, padY, barW, maxH)

        // Filled level
        const fillH = Math.max(0, Math.min(maxH, Math.round(band.val * maxH)))
        const y = padY + maxH - fillH

        if (fillH > 0) {
          ctx.fillStyle = band.isTransient ? '#ffffff' : '#a3a3a3'
          ctx.fillRect(x, y, barW, fillH)
        }

        // Subtly stamp band label
        ctx.fillStyle = metrics.isPlaying ? '#737373' : '#404040'
        ctx.font = '7px monospace'
        ctx.fillText(band.label, x + 2, padY + 6)
      })
    }

    animId = requestAnimationFrame(renderMeter)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [analyzer])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !analyzer) return

    try {
      setErrorMsg(null)
      await analyzer.loadFile(file)
      analyzer.setLoop(isLooping)
      setFileName(file.name)
      setIsPlaying(false)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Audio load failed')
    }
  }

  const handleTogglePlay = async () => {
    if (!analyzer || !fileName) return

    try {
      if (analyzer.getIsPlaying()) {
        analyzer.pause()
        setIsPlaying(false)
      } else {
        await analyzer.play()
        setIsPlaying(true)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Playback failed')
      setIsPlaying(false)
    }
  }

  const handleToggleLoop = () => {
    if (!analyzer) return
    const next = !isLooping
    analyzer.setLoop(next)
    setIsLooping(next)
  }

  const truncatedName = fileName
    ? fileName.length > 20
      ? fileName.slice(0, 17) + '...'
      : fileName
    : null

  return (
    <div className="w-full max-w-4xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 px-4 border border-neutral-800 bg-neutral-950 font-mono text-xs">
      {/* Hidden file input supporting audio formats */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Left side: Label & Track Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 select-none">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'
            }`}
          />
          <span className="tracking-widest uppercase font-medium text-neutral-300">
            AUDIO INPUT
          </span>
        </div>

        {truncatedName ? (
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 border border-neutral-800 bg-black text-neutral-300 tracking-wider truncate max-w-[200px]"
            title={fileName || ''}
          >
            <Music className="w-3 h-3 text-neutral-400 shrink-0" />
            <span className="truncate">{truncatedName}</span>
          </div>
        ) : (
          <span className="text-[11px] text-neutral-600 hidden sm:inline tracking-wider">
            STANDALONE / SHADER MODULATION
          </span>
        )}

        {errorMsg && (
          <span className="text-[10px] text-red-400 tracking-tight">{errorMsg}</span>
        )}
      </div>

      {/* Right side: Controls & Level Meter */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
        {/* Upload Audio Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Upload audio file (.mp3, .wav, .ogg, .m4a, .flac)"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs tracking-wider border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
        >
          <Upload className="w-3 h-3 text-neutral-400" />
          <span>{fileName ? 'CHANGE' : 'UPLOAD AUDIO'}</span>
        </button>

        {fileName && (
          <>
            {/* Play / Pause Toggle */}
            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={disabled}
              title={isPlaying ? 'Pause Audio' : 'Play Audio'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs tracking-wider border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
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
              onClick={handleToggleLoop}
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

            {/* Monochromatic 3-bar Level Meter (BASS / MID / HIGH) */}
            <div
              className="flex items-center gap-1 border border-neutral-800 bg-black p-0.5"
              title="FFT Level Meter: BASS (B) / MID (M) / HIGH (H)"
            >
              <canvas
                ref={meterCanvasRef}
                width={56}
                height={22}
                className="block"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
