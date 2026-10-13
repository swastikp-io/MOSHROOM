import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraDevice, CameraManager } from '../core/camera';
import { CameraStatus, InputResolution } from '../types/datamosh';

export function useCamera() {
  const cameraManagerRef = useRef<CameraManager | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSynthetic, setIsSynthetic] = useState<boolean>(false);

  // Initialize camera manager singleton on mount
  if (!cameraManagerRef.current) {
    cameraManagerRef.current = new CameraManager();
  }

  const refreshDevices = useCallback(async () => {
    if (cameraManagerRef.current) {
      const devs = await cameraManagerRef.current.getDevices();
      setDevices(devs);
    }
  }, []);

  const startCamera = useCallback(async (deviceId?: string, resolution: InputResolution = 'default') => {
    const manager = cameraManagerRef.current;
    if (!manager) return;

    setStatus('requesting');
    setErrorMessage('');

    const result = await manager.startCamera(deviceId, resolution);
    setStatus(result.status);

    if (result.status === 'active') {
      setIsSynthetic(false);
      if (deviceId) {
        setActiveDeviceId(deviceId);
      }
      await refreshDevices();
    } else {
      setErrorMessage(result.error || 'Failed to start camera');
    }
  }, [refreshDevices]);

  const startSynthetic = useCallback(() => {
    const manager = cameraManagerRef.current;
    if (!manager) return;

    manager.startSyntheticStream();
    setIsSynthetic(true);
    setStatus('active');
    setErrorMessage('');
  }, []);

  const stop = useCallback(() => {
    cameraManagerRef.current?.stop();
    setStatus('idle');
    setIsSynthetic(false);
  }, []);

  // Request camera on mount
  useEffect(() => {
    const manager = cameraManagerRef.current;
    if (manager) {
      manager.setOnTrackEnded(() => {
        setStatus('device_not_found');
        setErrorMessage('Camera video track ended or was disconnected by the operating system.');
      });
    }

    startCamera();

    const handleDeviceChange = () => {
      refreshDevices();
    };

    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
      cameraManagerRef.current?.stop();
    };
  }, [startCamera, refreshDevices]);

  return {
    cameraManager: cameraManagerRef.current,
    status,
    devices,
    activeDeviceId,
    errorMessage,
    isSynthetic,
    startCamera,
    startSynthetic,
    stop,
    refreshDevices,
  };
}
