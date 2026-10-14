import { useEffect, useState } from 'react'
import { useCamera } from './hooks/useCamera.ts'
import { CameraPreview } from './components/CameraPreview.tsx'
import { MoshControl } from './components/MoshControl.tsx'
import { AudioControl } from './components/AudioControl.tsx'
import { AudioAnalyzer } from './lib/audio/AudioAnalyzer.ts'

export function App() {
  const [moshAmount, setMoshAmount] = useState<number>(45)
  const [restoreCount, setRestoreCount] = useState<number>(0)
  const { status, error, videoRef, startCamera, stopCamera } = useCamera()

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
    setMoshAmount(50)
    setRestoreCount((prev) => prev + 1)
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] flex flex-col justify-between p-4 sm:p-6 md:p-8 font-mono selection:bg-white selection:text-black">
      {/* Header */}
      <header className="w-full max-w-4xl mx-auto flex items-baseline justify-between pb-4 border-b border-neutral-900 select-none">
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

      {/* Main Content Area */}
      <main className="w-full max-w-4xl mx-auto flex-1 flex flex-col items-center justify-center my-4 sm:my-6 gap-4">
        {/* Live Video Canvas */}
        <CameraPreview
          status={status}
          error={error}
          videoRef={videoRef}
          onStartCamera={startCamera}
          onStopCamera={stopCamera}
          moshAmount={moshAmount}
          restoreTrigger={restoreCount}
          audioAnalyzer={audioAnalyzer}
        />

        {/* Primary Controls Group */}
        <div className="w-full max-w-4xl flex flex-col gap-2">
          {/* Mosh Intensity Slider */}
          <MoshControl
            value={moshAmount}
            onChange={setMoshAmount}
            onRestore={handleRestore}
            disabled={status !== 'active'}
          />

          {/* Monochromatic Audio-Reactive Engine Control Strip */}
          <AudioControl
            analyzer={audioAnalyzer}
            disabled={false}
          />
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full max-w-4xl mx-auto pt-4 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between text-[11px] text-neutral-600 gap-2 select-none">
        <div className="flex items-center gap-3">
          <span>MOTION-COMPENSATED SIMULATION</span>
          <span>•</span>
          <span>WEBGL2 PIPELINE</span>
        </div>
        <div className="tracking-widest uppercase">
          {status === 'active' ? 'STREAM READY' : 'STANDBY'}
        </div>
      </footer>
    </div>
  )
}

export default App
