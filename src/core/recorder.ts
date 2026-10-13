export interface RecordingState {
  isRecording: boolean;
  durationSeconds: number;
}

export class CanvasRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private timerId: number | null = null;
  private activeCanvasStream: MediaStream | null = null;

  /**
   * Queries MediaRecorder.isTypeSupported to pick the best supported codec.
   * Prefers VP9, then VP8, then standard WebM / MP4.
   */
  public static getSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm;codecs=h264',
      'video/webm',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];

    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return '';
  }

  /**
   * Captures an instant high-resolution PNG snapshot from the WebGL canvas.
   * Captures the actual rendered output with preserved aspect ratio.
   */
  public static takeSnapshot(canvas: HTMLCanvasElement): string {
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas is not ready for snapshot capture');
    }

    const dataUrl = canvas.toDataURL('image/png');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `moshroom-${timestamp}.png`;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return filename;
  }

  /**
   * Starts recording the processed canvas stream using native MediaRecorder.
   * Target frame rate: 60fps where supported.
   */
  public startRecording(
    canvas: HTMLCanvasElement,
    onTick?: (seconds: number) => void,
    onError?: (errorMsg: string) => void
  ): boolean {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      return false;
    }

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      if (onError) onError('Cannot record: WebGL canvas is not initialized');
      return false;
    }

    try {
      // Capture stream from the processed WebGL canvas at 60 FPS
      const stream = canvas.captureStream ? canvas.captureStream(60) : null;
      if (!stream) {
        throw new Error('canvas.captureStream() is not supported in this browser');
      }
      this.activeCanvasStream = stream;

      const mimeType = CanvasRecorder.getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        const error = (event as unknown as { error?: { message?: string } }).error;
        console.error('MediaRecorder error:', error);
        if (onError) onError(error?.message || 'Media recording encountered an error');
        this.cleanup();
      };

      this.mediaRecorder.onstop = () => {
        this.finishDownload();
        this.cleanup();
      };

      // Collect data chunks every 250ms for reliable streaming buffer
      this.mediaRecorder.start(250);
      this.recordingStartTime = performance.now();

      if (this.timerId !== null) clearInterval(this.timerId);
      this.timerId = window.setInterval(() => {
        const elapsed = Math.floor((performance.now() - this.recordingStartTime) / 1000);
        if (onTick) onTick(elapsed);
      }, 500);

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start canvas video recording';
      console.error(msg, err);
      if (onError) onError(msg);
      this.cleanup();
      return false;
    }
  }

  /**
   * Stops recording and triggers automated download of the compiled video.
   * Releases canvas recording tracks while keeping the webcam alive.
   */
  public stopRecording(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      this.cleanup();
    }
  }

  private cleanup(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.activeCanvasStream) {
      this.activeCanvasStream.getTracks().forEach((track) => track.stop());
      this.activeCanvasStream = null;
    }

    this.mediaRecorder = null;
  }

  private finishDownload(): void {
    if (this.recordedChunks.length === 0) {
      console.warn('No video data chunks collected during recording');
      return;
    }

    const mimeType = this.mediaRecorder?.mimeType || 'video/webm';
    const blob = new Blob(this.recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `moshroom-record-${timestamp}.${ext}`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.recordedChunks = [];
  }
}
