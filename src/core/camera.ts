import { CameraStatus, InputResolution } from '../types/datamosh';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export class CameraManager {
  private currentStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement;
  private synthCanvas: HTMLCanvasElement | null = null;
  private synthCtx: CanvasRenderingContext2D | null = null;
  private synthAnimId: number | null = null;
  private isSynthetic: boolean = false;
  private onTrackEndedCallback: (() => void) | null = null;

  constructor() {
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.muted = true;
  }

  public setOnTrackEnded(callback: (() => void) | null): void {
    this.onTrackEndedCallback = callback;
  }

  public getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  public getSource(): HTMLVideoElement | HTMLCanvasElement {
    if (this.isSynthetic && this.synthCanvas) {
      return this.synthCanvas;
    }
    return this.videoElement;
  }

  public getIsSynthetic(): boolean {
    return this.isSynthetic;
  }

  /**
   * Check if mediaDevices API is supported by the current environment
   */
  public isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Enumerate available video input hardware
   */
  public async getDevices(): Promise<CameraDevice[]> {
    if (!this.isSupported()) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      return videoDevices.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${index + 1}`,
      }));
    } catch (err) {
      console.warn('Failed to enumerate devices:', err);
      return [];
    }
  }

  /**
   * Request camera access for a specific deviceId or default
   */
  public async startCamera(
    deviceId?: string,
    resolution: InputResolution = 'default'
  ): Promise<{ status: CameraStatus; error?: string }> {
    this.stop();

    if (!this.isSupported()) {
      return { status: 'unsupported', error: 'MediaDevices API is not supported in this browser.' };
    }

    let widthConstraint: ConstrainULong | undefined = undefined;
    let heightConstraint: ConstrainULong | undefined = undefined;

    if (resolution === '480p') {
      widthConstraint = { ideal: 640 };
      heightConstraint = { ideal: 480 };
    } else if (resolution === '720p') {
      widthConstraint = { ideal: 1280 };
      heightConstraint = { ideal: 720 };
    } else if (resolution === '1080p') {
      widthConstraint = { ideal: 1920 };
      heightConstraint = { ideal: 1080 };
    }

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: widthConstraint,
        height: heightConstraint,
        frameRate: { ideal: 60, max: 60 },
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;
      this.videoElement.srcObject = stream;
      // Attach track ended listener
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        tracks[0].onended = () => {
          console.warn('Camera video track ended or was revoked');
          if (this.onTrackEndedCallback) {
            this.onTrackEndedCallback();
          }
        };
      }

      // Wait for video to have metadata and play
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          this.videoElement.removeEventListener('loadedmetadata', onLoaded);
          this.videoElement
            .play()
            .then(() => resolve())
            .catch(reject);
        };
        this.videoElement.addEventListener('loadedmetadata', onLoaded);
      });

      return { status: 'active' };
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      console.error('Error starting camera:', error);

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return {
          status: 'permission_denied',
          error: 'Camera permission was denied. Please allow camera access in your browser settings.',
        };
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return {
          status: 'device_not_found',
          error: 'No video capture hardware found on this machine.',
        };
      } else {
        return {
          status: 'error',
          error: error.message || 'An unexpected error occurred while accessing the camera.',
        };
      }
    }
  }

  /**
   * Fallback: Starts a high-motion synthetic video generator canvas.
   * Enables complete datamosh testing without physical hardware or if permission is denied.
   */
  public startSyntheticStream(): void {
    this.stop();
    this.isSynthetic = true;

    if (!this.synthCanvas) {
      this.synthCanvas = document.createElement('canvas');
      this.synthCanvas.width = 1280;
      this.synthCanvas.height = 720;
      this.synthCtx = this.synthCanvas.getContext('2d');
    }

    const ctx = this.synthCtx;
    if (!ctx) return;

    let time = 0;

    const renderSynthFrame = () => {
      time += 0.025;
      const t = time;

      // 1. Soft atmospheric background (misty sky cyan to muted sage green)
      const bgGrad = ctx.createLinearGradient(0, 0, 1280, 720);
      bgGrad.addColorStop(0, '#b8ccd9'); // Pale misty sky
      bgGrad.addColorStop(0.45, '#c5d1cb'); // Soft neutral slate
      bgGrad.addColorStop(1, '#687768'); // Muted foliage green
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1280, 720);

      // Background foliage texture clumps
      ctx.fillStyle = 'rgba(70, 85, 70, 0.45)';
      for (let i = 0; i < 6; i++) {
        const fx = 800 + Math.sin(t * 0.5 + i) * 60 + i * 70;
        const fy = 300 + Math.cos(t * 0.4 + i * 2) * 50 + i * 60;
        ctx.beginPath();
        ctx.arc(fx, fy, 120 + i * 20, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Head & Torso Portrait Silhouette
      const headX = 600 + Math.sin(t * 0.8) * 45;
      const headY = 340 + Math.cos(t * 1.1) * 25;
      const headTilt = Math.sin(t * 0.7) * 0.12;

      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(headTilt);

      // Shoulders & Torso (dusty plum and charcoal)
      const torsoGrad = ctx.createLinearGradient(-150, 140, 150, 400);
      torsoGrad.addColorStop(0, '#362438'); // Dark purple
      torsoGrad.addColorStop(1, '#241a28');
      ctx.fillStyle = torsoGrad;
      ctx.beginPath();
      ctx.moveTo(-180, 420);
      ctx.quadraticCurveTo(-140, 160, -70, 150);
      ctx.lineTo(70, 150);
      ctx.quadraticCurveTo(140, 160, 180, 420);
      ctx.closePath();
      ctx.fill();

      // Neck (warm shadowed peach)
      ctx.fillStyle = '#b88575';
      ctx.fillRect(-35, 90, 70, 70);

      // Head Shape (warm peach to dusty pink)
      const headGrad = ctx.createRadialGradient(15, -15, 20, 0, 0, 110);
      headGrad.addColorStop(0, '#f2cab8'); // Highlight peach
      headGrad.addColorStop(0.65, '#e0a996'); // Midtone skin
      headGrad.addColorStop(1, '#945850'); // Shadow edge
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 85, 115, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hair (dark espresso / deep purple)
      ctx.fillStyle = '#221526';
      ctx.beginPath();
      ctx.arc(0, -35, 95, Math.PI * 0.85, Math.PI * 2.15);
      ctx.fill();

      // Facial Features (soft tonal eyes and mouth)
      ctx.fillStyle = '#3a202d';
      ctx.beginPath();
      ctx.ellipse(-28, -8, 12, 6, 0.05, 0, Math.PI * 2);
      ctx.ellipse(28, -8, 12, 6, -0.05, 0, Math.PI * 2);
      ctx.fill();

      // Lips (dusty rose)
      ctx.fillStyle = '#9e5257';
      ctx.beginPath();
      ctx.ellipse(0, 48, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 3. Gesturing Arm & Hand (High Motion Dynamics)
      const armAngle = Math.sin(t * 1.4) * 0.45 - 0.2;
      const handX = headX - 220 + Math.cos(t * 1.5) * 120;
      const handY = headY + 40 + Math.sin(t * 1.8) * 90;

      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(armAngle);

      // Arm
      const armGrad = ctx.createLinearGradient(-180, 40, 0, 0);
      armGrad.addColorStop(0, '#ba8274');
      armGrad.addColorStop(1, '#e3b1a1');
      ctx.fillStyle = armGrad;
      ctx.beginPath();
      ctx.moveTo(-160, 60);
      ctx.quadraticCurveTo(-70, 20, 0, 0);
      ctx.lineTo(25, -20);
      ctx.quadraticCurveTo(-50, 40, -140, 100);
      ctx.closePath();
      ctx.fill();

      // Hand palm & fingers
      ctx.fillStyle = '#ebbaa9';
      ctx.beginPath();
      ctx.ellipse(20, -10, 45, 30, armAngle, 0, Math.PI * 2);
      ctx.fill();

      // Extended fingers
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#e0aa99';
      for (let f = 0; f < 4; f++) {
        ctx.beginPath();
        const fx = 45 + f * 10;
        const fy = -25 - f * 8;
        ctx.moveTo(25, -10);
        ctx.lineTo(fx, fy);
        ctx.stroke();
      }

      ctx.restore();

      // 4. Subtle Minimal HUD overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`SYNTHETIC TEST SUBJECT // 1280x720 // TIME: ${t.toFixed(2)}s`, 24, 32);

      this.synthAnimId = requestAnimationFrame(renderSynthFrame);
    };

    renderSynthFrame();
  }

  /**
   * Releases hardware streams and animation loops
   */
  public stop(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
      this.currentStream = null;
    }
    this.videoElement.srcObject = null;

    if (this.synthAnimId !== null) {
      cancelAnimationFrame(this.synthAnimId);
      this.synthAnimId = null;
    }
  }
}
