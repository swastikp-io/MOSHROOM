import { forwardRef } from 'react';
import { CameraStatus, MoshSettings } from '../types/datamosh';
import { PermissionScreen } from './PermissionScreen';

interface ViewportProps {
  cameraStatus: CameraStatus;
  errorMessage: string;
  isSynthetic: boolean;
  settings: MoshSettings;
  fps: number;
  resolution: { width: number; height: number };
  isRecording: boolean;
  recordingDuration: number;
  lastSnapshotName: string | null;
  onRetryCamera: () => void;
  onUseSynthetic: () => void;
  onDropIFrame: () => void;
  onResetBuffer: () => void;
}

export const Viewport = forwardRef<HTMLCanvasElement, ViewportProps>(
  (
    {
      cameraStatus,
      errorMessage,
      isSynthetic,
      settings,
      fps,
      resolution,
      isRecording,
      recordingDuration,
      lastSnapshotName,
      onRetryCamera,
      onUseSynthetic,
      onDropIFrame,
      onResetBuffer,
    },
    canvasRef
  ) => {
    const isReady = cameraStatus === 'active';

    return (
      <main className="flex-1 min-h-0 bg-neutral-100 p-2 sm:p-4 flex items-center justify-center relative overflow-hidden select-none">
        {/* Aspect Ratio Box: Dominates viewport, maintains 16:9 */}
        <div className="relative w-full h-full max-w-full max-h-full flex items-center justify-center">
          <div className="relative w-full aspect-video max-h-full max-w-full flex items-center justify-center border border-black bg-black shadow-xs overflow-hidden">
            {/* If camera is ready, show WebGL canvas */}
            {isReady ? (
              <>
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain cursor-crosshair block"
                />

                {/* Minimalist Optical Crosshairs / HUD Markers */}
                <div className="absolute top-2 left-2 text-[10px] font-mono text-white/70 pointer-events-none flex items-center gap-1">
                  <span>+</span>
                  <span className="hidden sm:inline">MOSHROOM // OPTICAL MATRIX</span>
                </div>
                <div className="absolute top-2 right-2 text-[10px] font-mono text-white/70 pointer-events-none flex items-center gap-2">
                  {settings.iFrameDrop && settings.enabled && (
                    <span className="bg-white text-black px-1.5 py-0.2 font-bold uppercase tracking-wider text-[9px]">
                      I-FRAME HOLD
                    </span>
                  )}
                  {isSynthetic && (
                    <span className="border border-white/60 text-white px-1.5 py-0.2 uppercase tracking-wider text-[9px]">
                      SYNTH FEED
                    </span>
                  )}
                  <span>+</span>
                </div>
                <div className="absolute bottom-2 left-2 text-[10px] font-mono text-white/70 pointer-events-none flex items-center gap-2">
                  <span>+</span>
                  <span className="hidden sm:inline">
                    {resolution.width > 0 ? `${resolution.width}x${resolution.height}` : ''} @ {fps}FPS
                  </span>
                </div>
                <div className="absolute bottom-2 right-2 text-[10px] font-mono text-white/70 pointer-events-none">
                  <span>+</span>
                </div>

                {/* Recording indicator badge */}
                {isRecording && (
                  <div className="absolute top-4 left-4 bg-red-600 text-white font-mono text-xs px-2.5 py-1 flex items-center gap-2 tracking-widest font-bold shadow-md">
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                    <span>REC [{recordingDuration}s]</span>
                  </div>
                )}

                {/* Snapshot notification toast */}
                {lastSnapshotName && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-black border border-black font-mono text-xs px-3 py-1.5 shadow-lg tracking-wider font-semibold animate-bounce">
                    SAVED: {lastSnapshotName}
                  </div>
                )}

                {/* Quick overlay controls */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 hover:opacity-100 transition-opacity">
                  <button
                    onClick={onDropIFrame}
                    className="px-2 py-1 bg-black/80 text-white hover:bg-black text-[10px] font-mono border border-white/40 cursor-pointer uppercase"
                  >
                    I-FRAME [{settings.iFrameDrop ? 'ON' : 'OFF'}]
                  </button>
                  <button
                    onClick={onResetBuffer}
                    className="px-2 py-1 bg-black/80 text-white hover:bg-black text-[10px] font-mono border border-white/40 cursor-pointer uppercase"
                  >
                    RESET
                  </button>
                </div>
              </>
            ) : (
              /* Fallback permission or hardware error screen */
              <div className="w-full h-full flex items-center justify-center p-4 bg-white">
                <PermissionScreen
                  status={cameraStatus}
                  errorMessage={errorMessage}
                  onRetry={onRetryCamera}
                  onUseSynthetic={onUseSynthetic}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }
);

Viewport.displayName = 'Viewport';
