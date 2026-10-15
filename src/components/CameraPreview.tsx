import React, { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, AlertCircle, RefreshCw, Square, FlipHorizontal, FlipVertical } from 'lucide-react'
import type { CameraStatus, CameraError } from '../hooks/useCamera.ts'
import { DatamoshRenderer } from '../lib/datamosh/DatamoshRenderer.ts'
import type { AudioAnalyzer } from '../lib/audio/AudioAnalyzer.ts'
import { HandTracker } from '../lib/vision/HandTracker.ts'

interface CameraPreviewProps {
  status: CameraStatus
  error: CameraError | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  onStartCamera: () => void
  onStopCamera: () => void
  particleDisplacement?: number
  restoreTrigger?: number
  audioAnalyzer?: AudioAnalyzer | null
  overlayVideoRef?: React.RefObject<HTMLVideoElement | null>
  overlayBlendMode?: number
  overlayOpacity?: number
  onFpsUpdate?: (fps: number) => void
  onMoshIntensityUpdate?: (intensity: number) => void
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  status,
  error,
  videoRef,
  onStartCamera,
  onStopCamera,
  particleDisplacement = 25,
  restoreTrigger,
  audioAnalyzer,
  overlayVideoRef,
  overlayBlendMode,
  overlayOpacity,
  onFpsUpdate,
  onMoshIntensityUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<DatamoshRenderer | null>(null)
  const [webglError, setWebglError] = useState<string | null>(null)
  const [isMirrored, setIsMirrored] = useState(true)
  const [isFlippedY, setIsFlippedY] = useState(true)

  // Direct DOM refs to eliminate React re-renders in the 60 FPS animation loop
  const fpsTextRef = useRef<HTMLSpanElement | null>(null)
  const liveMoshHudRef = useRef<HTMLSpanElement | null>(null)
  const lHandHudRef = useRef<HTMLSpanElement | null>(null)
  const rHandHudRef = useRef<HTMLSpanElement | null>(null)
  const engineStateRef = useRef<HTMLDivElement | null>(null)
  const doubleFistBannerRef = useRef<HTMLDivElement | null>(null)

  // Hand visualizer reticles
  const moshHandOverlayRef = useRef<HTMLDivElement | null>(null)
  const moshHandLabelRef = useRef<HTMLDivElement | null>(null)
  const moshHandIconRef = useRef<HTMLDivElement | null>(null)

  const audioHandOverlayRef = useRef<HTMLDivElement | null>(null)
  const audioHandLabelRef = useRef<HTMLDivElement | null>(null)
  const audioHandIconRef = useRef<HTMLDivElement | null>(null)

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
          audioAnalyzer,
          overlayVideo: overlayVideoRef?.current || null,
          onFpsUpdate: (currentFps) => {
            if (fpsTextRef.current) {
              fpsTextRef.current.textContent = `${currentFps} FPS`
            }
            onFpsUpdate?.(currentFps)
          },
          onMoshIntensityUpdate: (intensity) => {
            if (liveMoshHudRef.current) {
              liveMoshHudRef.current.textContent = `${intensity}%`
            }
            onMoshIntensityUpdate?.(intensity)
          },
          onError: (err) => {
            queueMicrotask(() => setWebglError(err.message))
          },
        })
        rendererRef.current = renderer
        renderer.resizeCanvas()
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
  }, [videoRef, onFpsUpdate, onMoshIntensityUpdate, audioAnalyzer, overlayVideoRef])

  // Synchronize audio analyzer reference without resetting WebGL
  useEffect(() => {
    rendererRef.current?.setAudioAnalyzer(audioAnalyzer || null)
  }, [audioAnalyzer])

  // Synchronize overlay video element reference
  useEffect(() => {
    rendererRef.current?.setOverlayVideo(overlayVideoRef?.current || null)
  }, [overlayVideoRef])

  // Synchronize overlay blend mode
  useEffect(() => {
    if (overlayBlendMode !== undefined) {
      rendererRef.current?.setOverlayBlendMode(overlayBlendMode)
    }
  }, [overlayBlendMode])

  // Synchronize overlay opacity
  useEffect(() => {
    if (overlayOpacity !== undefined) {
      rendererRef.current?.setOverlayOpacity(overlayOpacity)
    }
  }, [overlayOpacity])

  // Update particle displacement immediately without restarting renderer
  useEffect(() => {
    rendererRef.current?.setParticleDisplacement(particleDisplacement)
  }, [particleDisplacement])

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

  // Hand-Tracking Loop: Controls Mosh Brush (Right Hand) and Audio Playback (Left Hand)
  // Operates purely via DOM refs and WebGL uniforms — zero React setState calls per frame!
  useEffect(() => {
    if (status !== 'active') {
      return
    }

    let isSubscribed = true
    const tracker = new HandTracker()

    tracker.init().then((ready) => {
      if (isSubscribed && ready && engineStateRef.current) {
        engineStateRef.current.textContent = 'HAND ENGINE: ACTIVE'
      }
    })

    let animId: number
    let pauseDebounceTimeout: ReturnType<typeof setTimeout> | null = null
    let lastHudUpdateTime = 0

    const detectLoop = () => {
      animId = requestAnimationFrame(detectLoop)
      const video = videoRef.current
      const renderer = rendererRef.current
      if (!video || video.readyState < 2 || !renderer) return

      const now = performance.now()
      const tracking = tracker.detect(video, now, isMirrored)

      // 1. Double Fist Gesture: Clean I-Frame Reset
      if (tracking.doubleFistDetected) {
        renderer.resetFeedback()
        if (doubleFistBannerRef.current) {
          doubleFistBannerRef.current.style.display = 'block'
        }
        setTimeout(() => {
          if (doubleFistBannerRef.current) {
            doubleFistBannerRef.current.style.display = 'none'
          }
        }, 650)
      }

      // 2. Right Hand: Datamosh Brush & Particle Trigger
      if (tracking.moshHand) {
        if (tracking.moshHand.isOpen) {
          // Open hand: active datamosh displacement brush
          const brushRadius = 0.15 + Math.min(0.15, tracking.moshHand.pinchDistance * 0.75)
          renderer.setMoshHand(
            true,
            tracking.moshHand.palmPosition,
            tracking.moshHand.palmVelocity,
            brushRadius,
          )
        } else {
          // Closed fist: immediate freeze/lock
          renderer.setMoshHand(
            false,
            tracking.moshHand.palmPosition,
            [0, 0],
            0.20,
          )
        }
      } else {
        // No hand in frame: zero displacement, zero drift
        renderer.setMoshHand(false, [0.5, 0.5], [0, 0], 0.20)
      }

      // 3. Left Hand: Audio Playback & Audio-Reactivity Gain
      let currentGain = 1.0
      if (tracking.audioHand) {
        const normHeight = Math.max(0.0, Math.min(1.0, 1.0 - tracking.audioHand.palmPosition[1]))
        renderer.setLeftHand(tracking.audioHand.isOpen, normHeight)

        if (tracking.audioHand.isOpen) {
          // Open hand: ensure playing
          if (pauseDebounceTimeout) {
            clearTimeout(pauseDebounceTimeout)
            pauseDebounceTimeout = null
          }
          if (audioAnalyzer && !audioAnalyzer.getIsPlaying()) {
            audioAnalyzer.play().catch(() => {})
          }

          // Vertical height maps to audio reactivity intensity (0.3 to 2.0)
          currentGain = 0.3 + 1.7 * normHeight
          renderer.setAudioReactivityGain(currentGain)
        } else {
          // Closed fist: 200ms debounce before pausing to prevent tracking jitter
          if (!pauseDebounceTimeout && audioAnalyzer?.getIsPlaying()) {
            pauseDebounceTimeout = setTimeout(() => {
              audioAnalyzer?.pause()
              pauseDebounceTimeout = null
            }, 200)
          }
        }
      } else {
        renderer.setLeftHand(false, 0)
        if (pauseDebounceTimeout) {
          clearTimeout(pauseDebounceTimeout)
          pauseDebounceTimeout = null
        }
        renderer.setAudioReactivityGain(1.0)
      }

      // 4. Update Hand Visualizer Reticles via direct DOM refs
      const moshOverlayEl = moshHandOverlayRef.current
      if (moshOverlayEl) {
        if (tracking.moshHand) {
          moshOverlayEl.style.display = 'block'
          moshOverlayEl.style.left = `${tracking.moshHand.screenPosition[0] * 100}%`
          moshOverlayEl.style.top = `${tracking.moshHand.screenPosition[1] * 100}%`

          if (moshHandLabelRef.current) {
            moshHandLabelRef.current.textContent = tracking.moshHand.isOpen
              ? 'MOSH BRUSH'
              : 'LOCKED'
            moshHandLabelRef.current.className = tracking.moshHand.isOpen
              ? 'mt-1 px-1.5 py-0.5 bg-black/90 border border-neutral-700 text-[9px] font-mono text-white tracking-widest whitespace-nowrap'
              : 'mt-1 px-1.5 py-0.5 bg-black/90 border border-neutral-700 text-[9px] font-mono text-neutral-400 tracking-widest whitespace-nowrap'
          }
          if (moshHandIconRef.current) {
            moshHandIconRef.current.innerHTML = tracking.moshHand.isOpen
              ? '<div class="w-12 h-12 border border-white/70 flex items-center justify-center"><div class="w-1 h-1 bg-white"></div></div>'
              : '<div class="w-9 h-9 border border-neutral-400 bg-neutral-950/70 flex items-center justify-center"><div class="w-2.5 h-2.5 bg-neutral-300"></div></div>'
          }
        } else {
          moshOverlayEl.style.display = 'none'
        }
      }

      const audioOverlayEl = audioHandOverlayRef.current
      if (audioOverlayEl) {
        if (tracking.audioHand) {
          audioOverlayEl.style.display = 'block'
          audioOverlayEl.style.left = `${tracking.audioHand.screenPosition[0] * 100}%`
          audioOverlayEl.style.top = `${tracking.audioHand.screenPosition[1] * 100}%`

          if (audioHandLabelRef.current) {
            audioHandLabelRef.current.textContent = tracking.audioHand.isOpen
              ? `AUDIO x${currentGain.toFixed(1)}`
              : 'PAUSED'
            audioHandLabelRef.current.className = tracking.audioHand.isOpen
              ? 'mt-1 px-1.5 py-0.5 bg-black/90 border border-neutral-700 text-[9px] font-mono text-white tracking-widest whitespace-nowrap'
              : 'mt-1 px-1.5 py-0.5 bg-black/90 border border-neutral-700 text-[9px] font-mono text-neutral-400 tracking-widest whitespace-nowrap'
          }
          if (audioHandIconRef.current) {
            audioHandIconRef.current.innerHTML = tracking.audioHand.isOpen
              ? '<div class="w-12 h-12 border border-white/70 flex items-center justify-center"><div class="w-1 h-1 bg-white"></div></div>'
              : '<div class="w-9 h-9 border border-neutral-400 bg-neutral-950/70 flex items-center justify-center text-[10px] text-neutral-300">❚❚</div>'
          }
        } else {
          audioOverlayEl.style.display = 'none'
        }
      }

      // 5. Throttled DOM HUD Status Strip Updates (~180ms)
      if (now - lastHudUpdateTime > 180) {
        lastHudUpdateTime = now

        if (lHandHudRef.current) {
          if (!tracking.audioHand) {
            lHandHudRef.current.innerHTML = '<span class="text-neutral-600">IDLE</span>'
          } else if (tracking.audioHand.isOpen) {
            lHandHudRef.current.innerHTML = `<span class="text-white font-medium flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>PLAYING (x${currentGain.toFixed(1)})</span>`
          } else {
            lHandHudRef.current.innerHTML = '<span class="text-neutral-400">PAUSED (FIST)</span>'
          }
        }

        if (rHandHudRef.current) {
          if (!tracking.moshHand) {
            rHandHudRef.current.innerHTML = '<span class="text-neutral-600">IDLE</span>'
          } else if (tracking.moshHand.isOpen) {
            rHandHudRef.current.innerHTML = '<span class="text-white font-medium flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>ACTIVE (DISPLACE)</span>'
          } else {
            rHandHudRef.current.innerHTML = '<span class="text-neutral-400">LOCKED (FIST)</span>'
          }
        }
      }
    }

    animId = requestAnimationFrame(detectLoop)

    return () => {
      isSubscribed = false
      cancelAnimationFrame(animId)
      if (pauseDebounceTimeout) clearTimeout(pauseDebounceTimeout)
      tracker.destroy()
    }
  }, [status, isMirrored, audioAnalyzer, videoRef])

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

  return (
    <div className="relative w-full aspect-video bg-[#050505] border border-neutral-800 flex items-center justify-center overflow-hidden">
      {/* Off-screen source video element */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
      />

      {/* Off-screen video overlay element */}
      {overlayVideoRef && (
        <video
          ref={overlayVideoRef}
          playsInline
          muted
          loop
          className="hidden"
        />
      )}

      {/* Primary Hardware-Accelerated WebGL2 Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
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
            <span ref={fpsTextRef} className="tabular-nums text-neutral-400">0 FPS</span>
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

      {/* Visual Canvas Reticles for Detected Hands (Driven directly via DOM ref styles) */}
      {status === 'active' && (
        <>
          <div
            ref={moshHandOverlayRef}
            className="absolute pointer-events-none transition-transform duration-75 ease-out select-none z-10"
            style={{ display: 'none', transform: 'translate(-50%, -50%)' }}
          >
            <div className="relative flex flex-col items-center">
              <div ref={moshHandIconRef} />
              <div ref={moshHandLabelRef} />
            </div>
          </div>

          <div
            ref={audioHandOverlayRef}
            className="absolute pointer-events-none transition-transform duration-75 ease-out select-none z-10"
            style={{ display: 'none', transform: 'translate(-50%, -50%)' }}
          >
            <div className="relative flex flex-col items-center">
              <div ref={audioHandIconRef} />
              <div ref={audioHandLabelRef} />
            </div>
          </div>
        </>
      )}

      {/* Dual-Hand Tracking Brutalist HUD Strip */}
      {status === 'active' && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none select-none z-10">
          <div className="flex items-center gap-2">
            {/* L-Hand Audio Status Pill */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-black/85 border border-neutral-800 text-[11px] font-mono tracking-wider">
              <span className="text-neutral-500">L-HAND [AUDIO]:</span>
              <span ref={lHandHudRef}>
                <span className="text-neutral-600">IDLE</span>
              </span>
            </div>

            {/* R-Hand Mosh Status Pill */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-black/85 border border-neutral-800 text-[11px] font-mono tracking-wider">
              <span className="text-neutral-500">R-HAND [MOSH]:</span>
              <span ref={rHandHudRef}>
                <span className="text-neutral-600">IDLE</span>
              </span>
            </div>

            {/* Live Computed Mosh Intensity Pill */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-black/85 border border-neutral-800 text-[11px] font-mono tracking-wider">
              <span className="text-neutral-500">MOSH:</span>
              <span ref={liveMoshHudRef} className="text-white font-medium tabular-nums">0%</span>
            </div>
          </div>

          {/* Double Fist Reset Flash Banner */}
          <div
            ref={doubleFistBannerRef}
            style={{ display: 'none' }}
            className="px-3 py-1 bg-white text-black font-bold text-xs tracking-widest uppercase border border-white animate-bounce"
          >
            I-FRAME RESET
          </div>

          {/* MediaPipe Engine State indicator */}
          <div ref={engineStateRef} className="text-[10px] text-neutral-600 hidden md:block">
            HAND ENGINE: INIT...
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
