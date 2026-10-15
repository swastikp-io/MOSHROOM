import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './hooks/useCamera.ts'
import { CameraPreview } from './components/CameraPreview.tsx'
import { MoshControl, type MoshControlHandle } from './components/MoshControl.tsx'
import { AudioControl } from './components/AudioControl.tsx'
import { VideoOverlayControl } from './components/VideoOverlayControl.tsx'
import { AudioAnalyzer } from './lib/audio/AudioAnalyzer.ts'
import { getBlendModeGlIndex, type BlendModeId } from './lib/datamosh/blendModes.ts'

export function App() {
  const [particleDisplacement, setParticleDisplacement] = useState<number>(25)
  const [restoreCount, setRestoreCount] = useState<number>(0)
  const { status, error, videoRef, startCamera, stopCamera } = useCamera()

  const moshControlRef = useRef<MoshControlHandle | null>(null)
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null)

  // Video Overlay State
  const [overlayFileName, setOverlayFileName] = useState<string | null>(null)
  const [isOverlayPlaying, setIsOverlayPlaying] = useState<boolean>(false)
  const [isOverlayLooping, setIsOverlayLooping] = useState<boolean>(true)
  const [overlayBlendMode, setOverlayBlendMode] = useState<BlendModeId>('screen')
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.85)

  const [audioAnalyzer] = useState<AudioAnalyzer | null>(() => {
    if (typeof window !== 'undefined') {
      return new AudioAnalyzer()
    }
    return null
  })

  useEffect(() => {
    return () => {
      audioAnalyzer?.destroy()
    }
  }, [audioAnalyzer])

  // Synchronize overlay video element playback events
  useEffect(() => {
    const vid = overlayVideoRef.current
    if (!vid) return

    const handlePlay = () => setIsOverlayPlaying(true)
    const handlePause = () => setIsOverlayPlaying(false)
    const handleEnded = () => {
      if (!vid.loop) {
        setIsOverlayPlaying(false)
      }
    }

    vid.addEventListener('play', handlePlay)
    vid.addEventListener('pause', handlePause)
    vid.addEventListener('ended', handleEnded)

    return () => {
      vid.removeEventListener('play', handlePlay)
      vid.removeEventListener('pause', handlePause)
      vid.removeEventListener('ended', handleEnded)
    }
  }, [])

  const handleRestore = () => {
    setRestoreCount((prev) => prev + 1)
  }

  // Pure imperative update to MoshControl DOM ref — zero React re-render of App tree during 60 FPS loop!
  const handleMoshIntensityUpdate = useCallback((intensity: number) => {
    moshControlRef.current?.updateIntensity(intensity)
  }, [])

  // Video Overlay Handlers
  const handleOverlayFileSelect = useCallback((file: File) => {
    const vid = overlayVideoRef.current
    if (!vid) return

    const objectUrl = URL.createObjectURL(file)
    vid.src = objectUrl
    vid.loop = isOverlayLooping
    vid.muted = true
    vid.playsInline = true
    vid.play().then(() => {
      setIsOverlayPlaying(true)
    }).catch(() => {
      setIsOverlayPlaying(false)
    })

    setOverlayFileName(file.name)
  }, [isOverlayLooping])

  const handleToggleOverlayPlay = useCallback(() => {
    const vid = overlayVideoRef.current
    if (!vid || !vid.src) return

    if (vid.paused) {
      vid.play().then(() => setIsOverlayPlaying(true)).catch(() => {})
    } else {
      vid.pause()
      setIsOverlayPlaying(false)
    }
  }, [])

  const handleToggleOverlayLoop = useCallback(() => {
    const next = !isOverlayLooping
    setIsOverlayLooping(next)
    if (overlayVideoRef.current) {
      overlayVideoRef.current.loop = next
    }
  }, [isOverlayLooping])

  const handleClearOverlay = useCallback(() => {
    const vid = overlayVideoRef.current
    if (vid) {
      vid.pause()
      if (vid.src) {
        URL.revokeObjectURL(vid.src)
      }
      vid.removeAttribute('src')
      vid.load()
    }
    setOverlayFileName(null)
    setIsOverlayPlaying(false)
  }, [])

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] flex flex-col justify-between p-4 sm:p-6 md:p-8 font-mono selection:bg-white selection:text-black">
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto flex items-baseline justify-between pb-4 border-b border-neutral-900 select-none">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-widest text-white m-0">
            MOSHROOM
          </h1>
          <span className="text-[11px] tracking-widest text-neutral-500 uppercase">
            REAL-TIME VIDEO DEFORMATION
          </span>
        </div>

        <div className="text-[11px] text-neutral-600 hidden sm:block tracking-wider">
          GPU OPTICAL FLOW / DISPLACEMENT FEEDBACK
        </div>
      </header>

      {/* Main Content Area: Left = Live Feed, Right = Controls */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col lg:flex-row items-start justify-center my-4 sm:my-6 gap-6">
        {/* Left Column: Live Video Canvas */}
        <div className="flex-1 w-full min-w-0">
          <CameraPreview
            status={status}
            error={error}
            videoRef={videoRef}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            particleDisplacement={particleDisplacement}
            onMoshIntensityUpdate={handleMoshIntensityUpdate}
            restoreTrigger={restoreCount}
            audioAnalyzer={audioAnalyzer}
            overlayVideoRef={overlayVideoRef}
            overlayBlendMode={getBlendModeGlIndex(overlayBlendMode)}
            overlayOpacity={overlayOpacity}
          />
        </div>

        {/* Right Column: Controls Group */}
        <div className="w-full lg:w-[380px] xl:w-[420px] flex flex-col gap-3 shrink-0">
          {/* Single Effect Slider: Particle Displacement */}
          <MoshControl
            ref={moshControlRef}
            value={particleDisplacement}
            onChange={setParticleDisplacement}
            onRestore={handleRestore}
            disabled={status !== 'active'}
          />

          {/* Video Overlay Control with Photoshop Blend Modes */}
          <VideoOverlayControl
            fileName={overlayFileName}
            isPlaying={isOverlayPlaying}
            isLooping={isOverlayLooping}
            blendMode={overlayBlendMode}
            opacity={overlayOpacity}
            onFileSelect={handleOverlayFileSelect}
            onTogglePlay={handleToggleOverlayPlay}
            onToggleLoop={handleToggleOverlayLoop}
            onBlendModeChange={setOverlayBlendMode}
            onOpacityChange={setOverlayOpacity}
            onClear={handleClearOverlay}
            disabled={false}
          />

          {/* Monochromatic Audio-Reactive Engine Control Strip */}
          <AudioControl
            analyzer={audioAnalyzer}
            disabled={false}
          />

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto flex items-center justify-between pt-4 border-t border-neutral-900 text-[10px] tracking-wider text-neutral-600 select-none">
        <div>MOSHROOM ENGINE v0.4.0 — BRUTALIST EDITION</div>
        <div>WEBGL2 / FFT AUDIO / MEDIAPIPE GESTURE / VIDEO OVERLAY</div>
      </footer>
    </div>
  )
}

export default App
