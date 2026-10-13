import {
  Camera,
  Circle,
  Cpu,
  Maximize2,
  Minimize2,
  Power,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { CameraDevice } from '../core/camera';
import { CameraStatus, MoshSettings } from '../types/datamosh';

interface ToolbarProps {
  settings: MoshSettings;
  onUpdateSettings: (updater: (prev: MoshSettings) => MoshSettings) => void;
  cameraStatus: CameraStatus;
  devices: CameraDevice[];
  activeDeviceId: string;
  isSynthetic: boolean;
  onSelectCamera: (deviceId: string) => void;
  onSwitchToSynthetic: () => void;
  onRetryCamera: () => void;
  onResetBuffer: () => void;
  fps: number;
  resolution: { width: number; height: number };
  internalResolution?: { width: number; height: number };
  isRecording: boolean;
  recordingDuration: number;
  onToggleRecording: () => void;
  onTakeSnapshot: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenDiagnostics: () => void;
}

export function Toolbar({
  settings,
  onUpdateSettings,
  cameraStatus,
  devices,
  activeDeviceId,
  isSynthetic,
  onSelectCamera,
  onSwitchToSynthetic,
  onRetryCamera,
  onResetBuffer,
  fps,
  resolution,
  internalResolution,
  isRecording,
  recordingDuration,
  onToggleRecording,
  onTakeSnapshot,
  isFullscreen,
  onToggleFullscreen,
  onOpenDiagnostics,
}: ToolbarProps) {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const isLive = cameraStatus === 'active';

  return (
    <header className="h-12 border-b border-black bg-white px-3 flex items-center justify-between select-none font-mono text-xs z-30 shrink-0">
      {/* Left: Brand & Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-3 border-r border-black">
          <span className="font-bold tracking-widest text-sm uppercase">MOSHROOM</span>
          <span className="text-[10px] text-neutral-400 hidden sm:inline">[v1.0]</span>
        </div>

        {/* Live Status Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 border border-black text-[11px]">
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              <span className="font-bold text-red-600">REC {formatTime(recordingDuration)}</span>
            </>
          ) : isLive ? (
            <>
              <span
                className={`w-2 h-2 rounded-full ${
                  settings.enabled ? (settings.iFrameDrop ? 'bg-black animate-pulse' : 'bg-black') : 'bg-neutral-300'
                }`}
              />
              <span className="font-semibold uppercase">
                {isSynthetic
                  ? 'SYNTH FEED'
                  : settings.enabled
                  ? settings.iFrameDrop
                    ? 'I-FRAME MOSH'
                    : 'LIVE SMEAR'
                  : 'RAW BYPASS'}
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-neutral-300" />
              <span className="text-neutral-500 uppercase">{cameraStatus}</span>
            </>
          )}
        </div>

        {/* Video Source Picker */}
        <div className="hidden md:flex items-center gap-1.5 pl-2">
          <label htmlFor="camera-select" className="sr-only">Video Source</label>
          <select
            id="camera-select"
            value={isSynthetic ? 'synth' : activeDeviceId}
            onChange={(e) => {
              if (e.target.value === 'synth') {
                onSwitchToSynthetic();
              } else {
                onSelectCamera(e.target.value);
              }
            }}
            className="border border-black bg-white px-2 py-0.5 text-[11px] font-mono cursor-pointer outline-none hover:bg-neutral-50 focus:border-black"
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                CAM: {device.label.slice(0, 24)}
              </option>
            ))}
            {devices.length === 0 && !isSynthetic && (
              <option value="">CAM: DEFAULT</option>
            )}
            <option value="synth">SIG: SYNTH GENERATOR</option>
          </select>

          <button
            onClick={onRetryCamera}
            title="Reload Video Stream"
            className="p-1 border border-black hover:bg-neutral-100 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Middle: Stream Telemetry */}
      <div className="hidden lg:flex items-center gap-4 text-[11px] text-neutral-600">
        <div className="flex items-center gap-1">
          <span className="text-neutral-400">RES</span>
          <span className="font-bold text-black">
            {resolution.width > 0 ? `${resolution.width}x${resolution.height}` : '0x0'}
          </span>
          {internalResolution && internalResolution.width > 0 && internalResolution.width !== resolution.width && (
            <span className="text-[9px] text-neutral-500 font-normal">
              [{internalResolution.width}x{internalResolution.height}]
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-neutral-400">FPS</span>
          <span className={`font-bold ${fps > 25 ? 'text-black' : 'text-neutral-400'}`}>
            {fps}
          </span>
        </div>
      </div>

      {/* Right: Primary Controls */}
      <div className="flex items-center gap-1.5">
        {/* Effect Master Toggle */}
        <button
          onClick={() => onUpdateSettings((s) => ({ ...s, enabled: !s.enabled }))}
          className={`flex items-center gap-1.5 px-2.5 py-1 border border-black text-[11px] font-medium transition-colors cursor-pointer ${
            settings.enabled
              ? 'bg-black text-white hover:bg-neutral-800'
              : 'bg-white text-neutral-400 hover:text-black hover:bg-neutral-50'
          }`}
          title="Toggle Glitch & Datamosh Processing (Shortcut: Space)"
        >
          <Power className="w-3 h-3" />
          <span className="hidden sm:inline">{settings.enabled ? 'EFFECT ON' : 'EFFECT OFF'}</span>
        </button>

        {/* Drop I-Frame Button */}
        <button
          onClick={() => onUpdateSettings((s) => ({ ...s, iFrameDrop: !s.iFrameDrop }))}
          className={`flex items-center gap-1.5 px-2.5 py-1 border border-black text-[11px] font-medium transition-colors cursor-pointer ${
            settings.iFrameDrop && settings.enabled
              ? 'bg-black text-white hover:bg-neutral-800'
              : 'bg-white text-black hover:bg-neutral-100'
          }`}
          title="Toggle I-Frame Keyframe Removal (Shortcut: D)"
        >
          <Zap className="w-3 h-3" />
          <span className="hidden sm:inline">DROP I-FRAME</span>
        </button>

        {/* Reset Feedback Buffer */}
        <button
          onClick={onResetBuffer}
          className="flex items-center gap-1 px-2 py-1 border border-black bg-white hover:bg-neutral-100 text-black text-[11px] cursor-pointer"
          title="Clear Datamosh Feedback Buffer (Shortcut: R)"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="hidden md:inline">RESET</span>
        </button>

        {/* Snapshot PNG */}
        <button
          onClick={onTakeSnapshot}
          className="flex items-center gap-1 px-2 py-1 border border-black bg-white hover:bg-neutral-100 text-black text-[11px] cursor-pointer"
          title="Save Snapshot PNG"
        >
          <Camera className="w-3 h-3" />
          <span className="hidden md:inline">SNAP</span>
        </button>

        {/* Record Video */}
        <button
          onClick={onToggleRecording}
          className={`flex items-center gap-1 px-2.5 py-1 border border-black text-[11px] font-medium transition-colors cursor-pointer ${
            isRecording
              ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
              : 'bg-white text-black hover:bg-neutral-100'
          }`}
          title={isRecording ? 'Stop Recording' : 'Record Canvas Stream (WebM/MP4)'}
        >
          <Circle className={`w-3 h-3 ${isRecording ? 'fill-white' : 'fill-red-600 text-red-600'}`} />
          <span>{isRecording ? 'STOP' : 'REC'}</span>
        </button>

        {/* Diagnostics Modal Toggle */}
        <button
          onClick={onOpenDiagnostics}
          className="p-1 border border-black hover:bg-neutral-100 cursor-pointer hidden sm:block"
          title="Engine Diagnostics"
        >
          <Cpu className="w-3.5 h-3.5" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={onToggleFullscreen}
          className="p-1 border border-black hover:bg-neutral-100 cursor-pointer"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
}
