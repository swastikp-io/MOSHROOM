import { useCallback, useRef, useState } from 'react';
import { CanvasRecorder } from '../core/recorder';

export function useRecorder() {
  const recorderRef = useRef<CanvasRecorder | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [lastSnapshotName, setLastSnapshotName] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  if (!recorderRef.current) {
    recorderRef.current = new CanvasRecorder();
  }

  const startRecording = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || !recorderRef.current) return false;
    setDuration(0);
    setRecordingError(null);

    const success = recorderRef.current.startRecording(
      canvas,
      (secs) => setDuration(secs),
      (err) => {
        setRecordingError(err);
        setIsRecording(false);
      }
    );

    if (success) {
      setIsRecording(true);
    }
    return success;
  }, []);

  const stopRecording = useCallback(() => {
    if (!recorderRef.current) return;
    recorderRef.current.stopRecording();
    setIsRecording(false);
  }, []);

  const takeSnapshot = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return null;
    try {
      const filename = CanvasRecorder.takeSnapshot(canvas);
      setLastSnapshotName(filename);
      setTimeout(() => setLastSnapshotName(null), 3500);
      return filename;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Snapshot capture failed';
      setRecordingError(msg);
      return null;
    }
  }, []);

  return {
    isRecording,
    duration,
    lastSnapshotName,
    recordingError,
    startRecording,
    stopRecording,
    takeSnapshot,
    clearRecordingError: () => setRecordingError(null),
  };
}
