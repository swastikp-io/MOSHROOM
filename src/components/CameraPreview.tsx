import React, { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, AlertCircle, RefreshCw, Square, FlipHorizontal, FlipVertical } from 'lucide-react'
import type { CameraStatus, CameraError } from '../hooks/useCamera.ts'
import { DatamoshRenderer } from '../lib/datamosh/DatamoshRenderer.ts'

interface CameraPreviewProps {
  status: CameraStatus
  error: CameraError | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  onStartCamera: () => void
  onStopCamera: () => void
  moshAmount: number
  restoreTrigger?: number
  onFpsUpdate?: (fps: number) => void
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  status,
  error,
  videoRef,
  onStartCamera,
  onStopCamera,
  moshAmount,
  restoreTrigger,
  onFpsUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<DatamoshRenderer | null>(null)
  const [webglError, setWebglError] = useState<string | null>(null)
  const [fps, setFps] = useState<number>(0)
  const [isMirrored, setIsMirrored] = useState(true)
  const [isFlippedY, setIsFlippedY] = useState(true)

  const moshAmountRef = useRef(moshAmount)

  // Initialize DatamoshRenderer once canvas and video are mounted
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current

    if (!canvas || !video) return

    if (!rendererRef.current) {
      try {
        const renderer = new DatamoshRenderer({
          canvas,
          video,
          onFpsUpdate: (currentFps) => {
            setFps(currentFps)
            onFpsUpdate?.(currentFps)
          },
          onError: (err) => {
            queueMicrotask(() => setWebglError(err.message))
          },
        })
        rendererRef.current = renderer
        renderer.resizeCanvas()
        renderer.setMoshAmount(moshAmountRef.current)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        queueMicrotask(() => setWebglError(msg))
      }
    }

    const handleResize = () => {
      rendererRef.current?.resizeCanvas()
    }

    window.addEventListener('resize', handleResize)
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas)

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
    }
  }, [videoRef, onFpsUpdate])

  // Update effect intensity immediately without restarting renderer
  useEffect(() => {
    moshAmountRef.current = moshAmount
    rendererRef.current?.setMoshAmount(moshAmount)
  }, [moshAmount])

  // Restore live feed to pristine state upon restore trigger
  useEffect(() => {
    if (restoreTrigger && restoreTrigger > 0) {
      rendererRef.current?.resetFeedback()
    }
  }, [restoreTrigger])

  // Synchronize renderer execution with camera active state
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return

    if (status === 'active') {
      renderer.start()
    } else {
      renderer.stop()
    }
  }, [status])

  const handleToggleMirror = () => {
    if (rendererRef.current) {
      const val = rendererRef.current.toggleMirror()
      setIsMirrored(val)
    }
  }

  const handleToggleFlipY = () => {
    if (rendererRef.current) {
      const val = rendererRef.current.toggleFlipY()
      setIsFlippedY(val)
    }
  }

  // Cleanup renderer on unmount
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy()
        rendererRef.current = null
      }
    }
  }, [])

  return (
    <div className="relative w-full max-w-4xl aspect-video bg-black border border-neutral-800 flex items-center justify-center overflow-hidden shadow-2xl">
      {/* 
        Video element is attached to DOM to ensure Chromium / Safari decodes frames,
        visually hidden without using `display: none`.
      */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: 0.001,
          pointerEvents: 'none',
          zIndex: -1,
        }}
        aria-hidden="true"
      />

      {/* Main WebGL2 Video Processing Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block bg-black"
        style={{
          display: status === 'active' ? 'block' : 'none',
        }}
      />

      {/* Live Session Status Overlay */}
      {status === 'active' && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none select-none">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-black/85 border border-neutral-800 text-[11px] font-mono tracking-wider text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>LIVE FEED</span>
            <span className="text-neutral-600">|</span>
            <span className="tabular-nums text-neutral-400">{fps} FPS</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMirror}
              className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1 border text-xs font-mono transition-colors cursor-pointer ${
                isMirrored
                  ? 'bg-neutral-800 border-neutral-600 text-white'
                  : 'bg-black/90 hover:bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
              title="Toggle Horizontal Selfie Mirror"
              aria-label="Toggle Horizontal Selfie Mirror"
            >
              <FlipHorizontal className="w-3 h-3 text-neutral-400" />
              <span>MIRROR</span>
            </button>

            <button
              type="button"
              onClick={handleToggleFlipY}
              className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1 border text-xs font-mono transition-colors cursor-pointer ${
                isFlippedY
                  ? 'bg-neutral-800 border-neutral-600 text-white'
                  : 'bg-black/90 hover:bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
              title="Toggle Vertical Flip"
              aria-label="Toggle Vertical Flip"
            >
              <FlipVertical className="w-3 h-3 text-neutral-400" />
              <span>FLIP</span>
            </button>

            <button
              type="button"
              onClick={onStopCamera}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 bg-black/90 hover:bg-neutral-900 border border-neutral-700 hover:border-neutral-500 text-xs font-mono text-neutral-200 transition-colors cursor-pointer"
              aria-label="Stop Camera Session"
            >
              <Square className="w-3 h-3 fill-current text-neutral-400" />
              <span>STOP</span>
            </button>
          </div>
        </div>
      )}

      {/* WebGL2 Compatibility Warning */}
      {webglError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/95 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-neutral-400 mb-3" />
          <h2 className="text-sm font-mono tracking-widest text-white uppercase mb-2">
            WEBGL2 HARDWARE INCOMPATIBLE
          </h2>
          <p className="text-xs font-mono text-neutral-400 max-w-md mb-4 leading-relaxed">
            {webglError}
          </p>
          <p className="text-[11px] font-mono text-neutral-500 max-w-sm">
            Datamoshing requires WebGL2 hardware acceleration for real-time temporal feedback.
          </p>
        </div>
      )}

      {/* Camera Idle / Initial State */}
      {status === 'idle' && !webglError && (
        <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
          <div className="w-12 h-12 border border-neutral-800 flex items-center justify-center mb-4 bg-neutral-950">
            <Camera className="w-5 h-5 text-neutral-400" />
          </div>
          <p className="text-xs font-mono tracking-widest text-neutral-400 uppercase mb-5">
            CAMERA INPUT REQUIRED
          </p>
          <button
            type="button"
            onClick={onStartCamera}
            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-100 hover:bg-white text-black font-mono text-xs tracking-wider uppercase font-medium transition-colors cursor-pointer border border-white"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>START CAMERA</span>
          </button>
        </div>
      )}

      {/* Requesting Permission State */}
      {status === 'requesting' && (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <RefreshCw className="w-6 h-6 text-neutral-400 animate-spin mb-3" />
          <p className="text-xs font-mono tracking-widest text-neutral-300 uppercase">
            REQUESTING CAMERA ACCESS...
          </p>
          <p className="text-[11px] font-mono text-neutral-500 mt-2">
            Please approve camera permissions in your browser.
          </p>
        </div>
      )}

      {/* Camera Error State */}
      {status === 'error' && error && !webglError && (
        <div className="flex flex-col items-center justify-center p-6 text-center max-w-md bg-black">
          <div className="w-10 h-10 border border-neutral-800 flex items-center justify-center mb-3 bg-neutral-950">
            <CameraOff className="w-4 h-4 text-neutral-400" />
          </div>
          <h2 className="text-xs font-mono tracking-widest text-white uppercase mb-2">
            {error.title}
          </h2>
          <p className="text-xs font-mono text-neutral-400 mb-5 leading-relaxed">
            {error.message}
          </p>
          <button
            type="button"
            onClick={onStartCamera}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-mono text-neutral-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>TRY AGAIN</span>
          </button>
        </div>
      )}
    </div>
  )
}
