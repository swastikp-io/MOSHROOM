import { useCallback, useEffect, useRef, useState } from 'react';
import { Controls } from './components/Controls';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { ErrorBanner } from './components/ErrorBanner';
import { Toolbar } from './components/Toolbar';
import { Viewport } from './components/Viewport';
import { useCamera } from './hooks/useCamera';
import { useMoshEngine } from './hooks/useMoshEngine';
import { useRecorder } from './hooks/useRecorder';
import { defaultSettings } from './presets/datamoshPresets';
import { MoshSettings } from './types/datamosh';

export default function App() {
  const [settings, setSettings] = useState<MoshSettings>(defaultSettings);
  const [isControlsCollapsed, setIsControlsCollapsed] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootContainerRef = useRef<HTMLDivElement | null>(null);

  // 1. Camera Manager Hook
  const {
    cameraManager,
    status: cameraStatus,
    devices,
    activeDeviceId,
    errorMessage: cameraError,
    isSynthetic,
    startCamera,
    startSynthetic,
  } = useCamera();

  // 2. WebGL2 Engine Hook
  const isCameraActive = cameraStatus === 'active';
  const {
    fps,
    resolution,
    internalResolution,
    renderTimeMs,
    webglError,
    resetBuffer,
  } = useMoshEngine({
    canvasRef,
    cameraManager,
    settings,
    isCameraActive,
  });

  // 3. Recorder Hook
  const {
    isRecording,
    duration: recordingDuration,
    lastSnapshotName,
    startRecording,
    stopRecording,
    takeSnapshot,
  } = useRecorder();

  // Fullscreen toggle handler
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootContainerRef.current?.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Exit fullscreen failed:', err);
      });
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Snapshot trigger
  const handleTakeSnapshot = useCallback(() => {
    takeSnapshot(canvasRef.current);
  }, [takeSnapshot]);

  // Record toggle trigger
  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording(canvasRef.current);
    }
  }, [isRecording, startRecording, stopRecording]);

  // Restore defaults
  const handleRestoreDefaults = useCallback(() => {
    setSettings(defaultSettings);
    resetBuffer();
  }, [resetBuffer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if focus is inside an input or select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setSettings((s) => ({ ...s, enabled: !s.enabled }));
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        setSettings((s) => ({ ...s, iFrameDrop: !s.iFrameDrop }));
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        resetBuffer();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleTakeSnapshot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetBuffer, handleToggleFullscreen, handleTakeSnapshot]);

  // Combined error state message
  const activeError =
    webglError ||
    (cameraStatus === 'error' ? cameraError : null);

  const displayError = activeError && activeError !== dismissedError ? activeError : null;

  return (
    <div
      ref={rootContainerRef}
      className="flex flex-col h-screen w-screen bg-white text-black overflow-hidden font-sans select-none"
    >
      {/* Top compact toolbar */}
      <Toolbar
        settings={settings}
        onUpdateSettings={setSettings}
        cameraStatus={cameraStatus}
        devices={devices}
        activeDeviceId={activeDeviceId}
        isSynthetic={isSynthetic}
        onSelectCamera={startCamera}
        onSwitchToSynthetic={startSynthetic}
        onRetryCamera={() => startCamera(activeDeviceId || undefined)}
        onResetBuffer={resetBuffer}
        fps={fps}
        resolution={resolution}
        internalResolution={internalResolution}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onToggleRecording={handleToggleRecording}
        onTakeSnapshot={handleTakeSnapshot}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      {/* Inline dismissible error banner if needed */}
      {displayError && (
        <ErrorBanner
          message={displayError}
          onDismiss={() => setDismissedError(displayError)}
        />
      )}

      {/* Central viewport & controls workspace */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Dominant 16:9 canvas viewport */}
        <Viewport
          ref={canvasRef}
          cameraStatus={cameraStatus}
          errorMessage={cameraError}
          isSynthetic={isSynthetic}
          settings={settings}
          fps={fps}
          resolution={resolution}
          isRecording={isRecording}
          recordingDuration={recordingDuration}
          lastSnapshotName={lastSnapshotName}
          onRetryCamera={() => startCamera(activeDeviceId || undefined)}
          onUseSynthetic={startSynthetic}
          onDropIFrame={() => setSettings((s) => ({ ...s, iFrameDrop: !s.iFrameDrop }))}
          onResetBuffer={resetBuffer}
        />

        {/* Complete monochrome parameter matrix */}
        <Controls
          settings={settings}
          onUpdateSettings={setSettings}
          onResetBuffer={resetBuffer}
          onRestoreDefaults={handleRestoreDefaults}
          devices={devices}
          activeDeviceId={activeDeviceId}
          isSynthetic={isSynthetic}
          onSelectCamera={(id) => startCamera(id, settings.inputResolution)}
          onSwitchToSynthetic={startSynthetic}
          onChangeResolution={(res) => startCamera(activeDeviceId, res)}
          isCollapsed={isControlsCollapsed}
          onToggleCollapse={() => setIsControlsCollapsed((prev) => !prev)}
        />
      </div>

      {/* Diagnostics modal */}
      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        fps={fps}
        resolution={resolution}
        internalResolution={internalResolution}
        renderTimeMs={renderTimeMs}
        isSynthetic={isSynthetic}
        cameraStatus={cameraStatus}
      />
    </div>
  );
}
