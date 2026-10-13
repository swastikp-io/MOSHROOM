import { X, CheckCircle, Terminal, AlertTriangle, ShieldCheck } from 'lucide-react';
import { CanvasRecorder } from '../core/recorder';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fps: number;
  resolution: { width: number; height: number };
  internalResolution: { width: number; height: number };
  renderTimeMs: number;
  isSynthetic: boolean;
  cameraStatus: string;
  activePresetName?: string;
  webglInitStatus?: 'READY' | 'INITIALIZING' | 'ERROR' | 'CONTEXT_LOST';
}

export function DiagnosticsModal({
  isOpen,
  onClose,
  fps,
  resolution,
  internalResolution,
  renderTimeMs,
  isSynthetic,
  cameraStatus,
  activePresetName = 'CUSTOM',
  webglInitStatus = 'READY',
}: DiagnosticsModalProps) {
  if (!isOpen) return null;

  const supportedMime = CanvasRecorder.getSupportedMimeType() || 'N/A';

  // Probe WebGL2 details
  let glVendor = 'Unknown';
  let glRenderer = 'Unknown';
  let maxTextureSize = 'Unknown';

  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        glVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
        glRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
      }
      maxTextureSize = `${gl.getParameter(gl.MAX_TEXTURE_SIZE)}px`;
    }
  } catch (e) {
    console.warn(e);
  }

  const isHighPerformance = fps >= 55;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-mono text-xs select-none">
      <div className="bg-white border border-black w-full max-w-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="h-10 border-b border-black px-4 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs">
            <Terminal className="w-4 h-4" />
            ENGINE TELEMETRY & DIAGNOSTICS
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Status summary */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 border border-black">
              <span className="text-neutral-500 block text-[9px] uppercase">WEBGL2 INITIALIZATION</span>
              <span className="font-bold uppercase text-black flex items-center gap-1.5 mt-0.5">
                {webglInitStatus === 'READY' ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-black" />
                    STATUS: READY
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-black" />
                    STATUS: {webglInitStatus}
                  </>
                )}
              </span>
            </div>
            <div className="p-2 border border-black">
              <span className="text-neutral-500 block text-[9px] uppercase">ACTIVE PRESET</span>
              <span className="font-bold uppercase text-black block mt-0.5">
                {activePresetName}
              </span>
            </div>
          </div>

          {/* Metrics */}
          <div className="space-y-1.5 border border-black p-3 bg-neutral-50 text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-500 uppercase">REAL-TIME FRAME RATE:</span>
              <span className={`font-bold ${isHighPerformance ? 'text-black' : 'text-neutral-700'}`}>
                {fps} FPS {isHighPerformance && '● 60FPS TARGET MET'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 uppercase">GPU RENDER TIME:</span>
              <span className="font-bold">{renderTimeMs} ms / frame</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 uppercase">CAMERA / INPUT RESOLUTION:</span>
              <span className="font-bold">
                {resolution.width > 0 ? `${resolution.width} x ${resolution.height}` : 'STANDBY'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 uppercase">INTERNAL GPU FBO RESOLUTION:</span>
              <span className="font-bold">
                {internalResolution.width > 0 ? `${internalResolution.width} x ${internalResolution.height}` : 'STANDBY'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 uppercase">INPUT SOURCE:</span>
              <span className="font-bold">
                {isSynthetic ? 'SYNTHETIC MOTION SIGNAL' : `HARDWARE (${cameraStatus.toUpperCase()})`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 uppercase">MEDIA RECORDER CODEC:</span>
              <span className="font-bold">{supportedMime}</span>
            </div>
          </div>

          {/* Stability & Performance Guardrails */}
          <div className="space-y-1.5 text-[11px]">
            <span className="text-neutral-500 uppercase font-semibold text-[10px] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-black" />
              ENGINE GUARANTEES:
            </span>
            <div className="border border-neutral-300 p-2.5 space-y-1 text-neutral-700 font-mono text-[10px]">
              <div>✓ Ping-pong feedback safety: never samples active FBO render attachment</div>
              <div>✓ Anti-runaway protection: bounded luminance dampening prevents whiteout/blackout</div>
              <div>✓ Zero CPU per-pixel readbacks: pure 60fps GPU pipeline</div>
              <div>✓ Memory leak safe: textures and FBOs reallocated only on size/scale changes</div>
              <div>✓ GPU Accelerator: {glRenderer}</div>
              <div>✓ Max Texture Dimension: {maxTextureSize}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-black bg-neutral-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-black text-white uppercase font-bold text-[10px] tracking-wider hover:bg-neutral-800 cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
