import { AlertCircle, Camera, RefreshCw, Sparkles, VideoOff } from 'lucide-react';
import { CameraStatus } from '../types/datamosh';

interface PermissionScreenProps {
  status: CameraStatus;
  errorMessage: string;
  onRetry: () => void;
  onUseSynthetic: () => void;
}

export function PermissionScreen({
  status,
  errorMessage,
  onRetry,
  onUseSynthetic,
}: PermissionScreenProps) {
  const isDenied = status === 'permission_denied';
  const isNotFound = status === 'device_not_found';
  const isUnsupported = status === 'unsupported';
  const isRequesting = status === 'requesting';

  return (
    <div className="flex flex-col items-center justify-center min-h-[460px] p-8 text-center max-w-xl mx-auto border border-black bg-white">
      <div className="w-14 h-14 border border-black flex items-center justify-center mb-6">
        {isDenied || isNotFound ? (
          <VideoOff className="w-7 h-7 text-black stroke-[1.5]" />
        ) : isUnsupported ? (
          <AlertCircle className="w-7 h-7 text-black stroke-[1.5]" />
        ) : (
          <Camera className="w-7 h-7 text-black stroke-[1.5]" />
        )}
      </div>

      <h2 className="text-xl font-bold tracking-tight uppercase font-mono mb-2">
        {isDenied
          ? 'CAMERA PERMISSION DENIED'
          : isNotFound
          ? 'NO CAMERA DETECTED'
          : isUnsupported
          ? 'BROWSER NOT SUPPORTED'
          : isRequesting
          ? 'REQUESTING CAMERA ACCESS...'
          : 'CAMERA ACCESS REQUIRED'}
      </h2>

      <p className="text-xs text-neutral-600 font-mono leading-relaxed max-w-md mb-6">
        {isDenied
          ? 'Camera access was blocked by browser permissions. To use your webcam, click the lock/camera icon in your browser address bar, set Camera to "Allow", and click Retry.'
          : isNotFound
          ? 'Could not find any video capture hardware connected to this machine. You can plug in a webcam and retry, or use the built-in synthetic motion test signal.'
          : isUnsupported
          ? 'The native MediaDevices or WebGL2 API is not supported in this environment.'
          : errorMessage ||
            'MOSHROOM requires webcam access to capture real-time optical motion and compute datamosh displacement vectors in WebGL2.'}
      </p>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <button
          onClick={onRetry}
          disabled={isRequesting}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white text-xs font-mono font-medium uppercase tracking-wider hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRequesting ? 'animate-spin' : ''}`} />
          {isRequesting ? 'REQUESTING...' : 'RETRY CAMERA'}
        </button>

        <button
          onClick={onUseSynthetic}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black border border-black text-xs font-mono font-medium uppercase tracking-wider hover:bg-neutral-100 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          TEST SIGNAL (SYNTH)
        </button>
      </div>

      <div className="mt-8 pt-4 border-t border-neutral-200 w-full flex items-center justify-between text-[11px] font-mono text-neutral-400">
        <span>SECURITY: LOCAL WEBCAM ONLY</span>
        <span>NO DATA TRANSMITTED</span>
      </div>
    </div>
  );
}
