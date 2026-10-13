import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraManager } from '../core/camera';
import { MoshRenderer } from '../core/webgl/renderer';
import { MoshSettings } from '../types/datamosh';

interface EngineOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraManager: CameraManager | null;
  settings: MoshSettings;
  isCameraActive: boolean;
}

export function useMoshEngine({
  canvasRef,
  cameraManager,
  settings,
  isCameraActive,
}: EngineOptions) {
  const rendererRef = useRef<MoshRenderer | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [resolution, setResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [internalResolution, setInternalResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [renderTimeMs, setRenderTimeMs] = useState<number>(0);

  // Keep live settings ref to avoid re-triggering animation loop effect
  const settingsRef = useRef<MoshSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Initialize WebGL2 renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const renderer = new MoshRenderer(canvas);
      rendererRef.current = renderer;
      setWebglError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize WebGL2';
      console.error('WebGL2 Init Error:', err);
      setWebglError(msg);
      return;
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [canvasRef]);

  // Reset datamosh buffer
  const resetBuffer = useCallback(() => {
    rendererRef.current?.resetBuffer();
  }, []);

  // Main Render Loop
  useEffect(() => {
    if (!isCameraActive || !cameraManager) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      return;
    }

    let frameCount = 0;
    let fpsTimer = performance.now();
    let active = true;

    const loop = () => {
      if (!active) return;

      const renderer = rendererRef.current;
      const canvas = canvasRef.current;
      const source = cameraManager.getSource();

      if (renderer && canvas && source) {
        const isVideo = source instanceof HTMLVideoElement;
        const isReady = isVideo ? source.readyState >= 2 : true;

        if (isReady) {
          const sWidth = isVideo ? source.videoWidth : source.width;
          const sHeight = isVideo ? source.videoHeight : source.height;

          if (sWidth > 0 && sHeight > 0) {
            // Adjust canvas internal renderbuffer dimensions if needed
            if (canvas.width !== sWidth || canvas.height !== sHeight) {
              canvas.width = sWidth;
              canvas.height = sHeight;
              setResolution({ width: sWidth, height: sHeight });
            }

            const t0 = performance.now();
            try {
              renderer.render(source, settingsRef.current);
              const intDim = renderer.getInternalDimensions();
              if (intDim.width > 0) {
                setInternalResolution(intDim);
              }
            } catch (err) {
              console.error('Render error:', err);
            }
            const t1 = performance.now();

            frameCount++;
            const now = performance.now();
            if (now - fpsTimer >= 500) {
              const currentFps = Math.round((frameCount * 1000) / (now - fpsTimer));
              setFps(currentFps);
              setRenderTimeMs(Math.round((t1 - t0) * 10) / 10);
              frameCount = 0;
              fpsTimer = now;
            }
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [isCameraActive, cameraManager, canvasRef]);

  return {
    fps,
    resolution,
    internalResolution,
    renderTimeMs,
    webglError,
    resetBuffer,
  };
}
