import { useState, useRef, useEffect, useCallback } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'error'

export interface CameraError {
  title: string
  message: string
}

export interface UseCameraResult {
  status: CameraStatus
  error: CameraError | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  startCamera: () => Promise<void>
  stopCamera: () => void
  videoDimensions: { width: number; height: number }
}

export function useCamera(): UseCameraResult {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<CameraError | null>(null)
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.pause()
    }

    setVideoDimensions({ width: 0, height: 0 })
    setStatus('idle')
  }, [])

  const startCamera = useCallback(async () => {
    // Check browser capability
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError({
        title: 'CAMERA NOT SUPPORTED',
        message: 'Your browser environment does not support media device camera access.',
      })
      setStatus('error')
      return
    }

    // Stop any existing session
    stopCamera()

    setStatus('requesting')
    setError(null)

    try {
      let stream: MediaStream

      try {
        // Preferred high-quality video constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
            facingMode: 'user',
          },
          audio: false,
        })
      } catch (firstErr) {
        // Fallback to basic video constraints if ideal fails
        console.warn('Preferred camera constraints failed, attempting fallback:', firstErr)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      }

      streamRef.current = stream

      const video = videoRef.current
      if (!video) {
        throw new Error('Video element reference is not mounted.')
      }

      // Configure media element
      video.muted = true
      video.autoplay = true
      video.playsInline = true
      video.srcObject = stream

      // Handle track ending (e.g. camera unplugged or system revoked access)
      const tracks = stream.getVideoTracks()
      if (tracks.length > 0) {
        tracks[0].onended = () => {
          setError({
            title: 'CAMERA DISCONNECTED',
            message: 'The active camera stream has ended or was disconnected.',
          })
          stopCamera()
          setStatus('error')
        }
      }

      // Wait for metadata and dimensions
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Camera stream initialization timed out waiting for video frames.'))
        }, 10000)

        const handleMetadata = () => {
          clearTimeout(timeoutId)
          video.removeEventListener('loadedmetadata', handleMetadata)
          resolve()
        }

        if (video.readyState >= 1 && video.videoWidth > 0) {
          clearTimeout(timeoutId)
          resolve()
        } else {
          video.addEventListener('loadedmetadata', handleMetadata)
        }
      })

      // Play video stream
      try {
        await video.play()
      } catch (playErr) {
        // Ignore AbortError if interrupted by another state change
        if ((playErr as Error).name !== 'AbortError') {
          throw playErr
        }
      }

      const width = video.videoWidth || 1280
      const height = video.videoHeight || 720
      setVideoDimensions({ width, height })
      setStatus('active')
    } catch (err: unknown) {
      stopCamera()
      const errorObj = err as { name?: string; message?: string }
      let title = 'CAMERA ACCESS FAILED'
      let message = 'An unknown error occurred while accessing your camera.'

      if (errorObj.name === 'NotAllowedError' || errorObj.name === 'PermissionDeniedError') {
        title = 'PERMISSION DENIED'
        message = 'Camera access was blocked. Please allow camera permissions in your browser.'
      } else if (errorObj.name === 'NotFoundError' || errorObj.name === 'DevicesNotFoundError') {
        title = 'CAMERA NOT FOUND'
        message = 'No video capture device was detected on your system.'
      } else if (errorObj.name === 'NotReadableError' || errorObj.name === 'TrackStartError') {
        title = 'CAMERA IN USE'
        message = 'Your camera is already in use by another application or tab.'
      } else if (errorObj.name === 'OverconstrainedError') {
        title = 'UNSUPPORTED RESOLUTION'
        message = 'Your camera does not support the requested video resolution.'
      } else if (errorObj.message) {
        message = errorObj.message
      }

      setError({ title, message })
      setStatus('error')
    }
  }, [stopCamera])

  // Cleanup tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  return {
    status,
    error,
    videoRef,
    startCamera,
    stopCamera,
    videoDimensions,
  }
}
