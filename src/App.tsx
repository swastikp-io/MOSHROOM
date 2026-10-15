import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './hooks/useCamera.ts'
import { CameraPreview } from './components/CameraPreview.tsx'
import { MoshControl, type MoshControlHandle } from './components/MoshControl.tsx'
import { AudioControl } from './components/AudioControl.tsx'
import { AudioAnalyzer } from './lib/audio/AudioAnalyzer.ts'

export function App() {
  const [particleDisplacement, setParticleDisplacement] = useState<number>(25)
  const [restoreCount, setRestoreCount] = useState<number>(0)
  const { status, error, videoRef, startCamera, stopCamera } = useCamera()

  const moshControlRef = useRef<MoshControlHandle | null>(null)

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

  const handleRestore = () => {
    setRestoreCount((prev) => prev + 1)
  }

  // Pure imperative update to MoshControl DOM ref — zero React re-render of App tree during 60 FPS loop!
  const handleMoshIntensityUpdate = useCallback((intensity: number) => {
    moshControlRef.current?.updateIntensity(intensity)
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

          {/* Monochromatic Audio-Reactive Engine Control Strip */}
          <AudioControl
            analyzer={audioAnalyzer}
            disabled={false}
          />

          {/* Gesture Controls Guide */}
          <div className="border border-neutral-800 bg-neutral-950 p-3.5 text-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
              <span className="text-neutral-300 font-medium tracking-wider uppercase text-[11px]">
                GESTURE CONTROLS
              </span>
              <span className="text-[10px] text-neutral-600 uppercase">
                MEDIAPIPE
              </span>
            </div>

            <div className="flex flex-col gap-2 text-[11px]">
              <div className="flex flex-col gap-1">
                <span className="text-neutral-400 font-medium tracking-wider text-[10px] uppercase">
                  RIGHT HAND — MOSH BRUSH
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-neutral-400">
                  <div className="bg-neutral-900/60 px-2 py-1 border border-neutral-800/80">
                    <span className="text-white font-medium">OPEN:</span> Mosh Brush
                  </div>
                  <div className="bg-neutral-900/60 px-2 py-1 border border-neutral-800/80">
                    <span className="text-white font-medium">FIST:</span> Lock Canvas
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-neutral-400 font-medium tracking-wider text-[10px] uppercase">
                  LEFT HAND — AUDIO REACTIVITY
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-neutral-400">
                  <div className="bg-neutral-900/60 px-2 py-1 border border-neutral-800/80">
                    <span className="text-white font-medium">OPEN:</span> Play Audio
                  </div>
                  <div className="bg-neutral-900/60 px-2 py-1 border border-neutral-800/80">
                    <span className="text-white font-medium">FIST:</span> Pause Audio
                  </div>
                </div>
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  Raise hand higher to intensify audio reactivity & mosh bloom.
                </div>
              </div>

              <div className="flex flex-col gap-1 border-t border-neutral-900 pt-1.5">
                <span className="text-neutral-400 font-medium tracking-wider text-[10px] uppercase">
                  DUAL-HAND GESTURE
                </span>
                <div className="bg-neutral-900/60 px-2 py-1 border border-neutral-800/80 text-neutral-300">
                  <span className="text-white font-medium">DOUBLE FIST:</span> Clean I-Frame Reset
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto flex items-center justify-between pt-4 border-t border-neutral-900 text-[10px] tracking-wider text-neutral-600 select-none">
        <div>MOSHROOM ENGINE v0.4.0 — BRUTALIST EDITION</div>
        <div>WEBGL2 / FFT AUDIO / MEDIAPIPE GESTURE</div>
      </footer>
    </div>
  )
}

export default App
