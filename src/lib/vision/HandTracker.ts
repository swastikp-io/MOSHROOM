import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

export type HandRole = 'mosh' | 'audio'

export interface TrackedHand {
  role: HandRole
  isRightHand: boolean
  palmPosition: [number, number] // [x, y] in video UV space (0.0 - 1.0)
  screenPosition: [number, number] // [x, y] in screen space (mirrored if active)
  palmVelocity: [number, number] // [vx, vy] smoothed velocity
  isOpen: boolean // true = open hand, false = closed fist
  pinchDistance: number // 0.0 - 1.0 distance between thumb tip and index tip
  rawLandmarks: NormalizedLandmark[]
}

export interface HandTrackingState {
  isReady: boolean
  isLoading: boolean
  error: string | null
  moshHand: TrackedHand | null // Right Hand / Screen-Right (Datamosh & Particle Brush)
  audioHand: TrackedHand | null // Left Hand / Screen-Left (Audio Playback & Reactivity)
  doubleFistDetected: boolean // Both hands closed into fists
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export class HandTracker {
  private landmarker: HandLandmarker | null = null
  private isLoading = false
  private isReady = false
  private error: string | null = null

  // Frame counter throttling: run MediaPipe once every 4 frames (~15 FPS)
  // to maintain full 60 FPS WebGL rendering without CPU/GPU readback stalls
  private frameCount = 0
  private lastDetectTimestamp = 0

  // Target detected states from MediaPipe
  private targetMoshHand: TrackedHand | null = null
  private targetAudioHand: TrackedHand | null = null

  // Current interpolated states for 60 FPS WebGL
  private currentMoshHand: TrackedHand | null = null
  private currentAudioHand: TrackedHand | null = null

  // Smoothing & temporal state
  private prevPositions: Map<HandRole, { x: number; y: number; time: number }> = new Map()
  private smoothedVelocities: Map<HandRole, [number, number]> = new Map()
  private fistStartTimes: Map<HandRole, number> = new Map()
  private doubleFistTriggered = false

  public async init(): Promise<boolean> {
    if (this.isReady) return true
    if (this.isLoading) return false

    this.isLoading = true
    this.error = null

    try {
      // 1. Initialize vision tasks WASM binaries from official CDN
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      )

      // 2. Initialize HandLandmarker with GPU delegate first
      // Using lower detection/tracking thresholds (0.35) for instant, reliable hand and fist lock
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        })
      } catch (gpuErr) {
        console.warn('MediaPipe GPU delegate unavailable, falling back to CPU:', gpuErr)
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        })
      }

      this.isReady = true
      this.isLoading = false
      return true
    } catch (err) {
      this.isReady = false
      this.isLoading = false
      this.error = err instanceof Error ? err.message : String(err)
      console.error('Failed to initialize HandTracker:', err)
      return false
    }
  }

  public detect(
    video: HTMLVideoElement,
    now: number = performance.now(),
    isMirrored = true,
  ): HandTrackingState {
    if (!this.isReady || !this.landmarker || video.readyState < 2) {
      return {
        isReady: this.isReady,
        isLoading: this.isLoading,
        error: this.error,
        moshHand: null,
        audioHand: null,
        doubleFistDetected: false,
      }
    }

    this.frameCount++

    // Only run discrete MediaPipe detection once every 4 render frames (~15 Hz at 60 FPS)
    // Passes the native HTMLVideoElement directly to use MediaPipe's zero-copy WebGL path
    const shouldDetect = this.frameCount % 4 === 0 || this.frameCount === 1

    if (shouldDetect) {
      // Ensure strictly monotonically increasing timestamp for MediaPipe VIDEO mode
      if (now <= this.lastDetectTimestamp) {
        now = this.lastDetectTimestamp + 1
      }
      this.lastDetectTimestamp = now

      let results: HandLandmarkerResult | null = null
      try {
        results = this.landmarker.detectForVideo(video, now)
      } catch (detErr) {
        // Fallback / skip on detection glitch
        console.debug('MediaPipe detectForVideo skipped:', detErr)
      }

      if (results && results.landmarks && results.landmarks.length > 0) {
        const candidates: Array<{
          landmarks: NormalizedLandmark[]
          handednessName: string
          palmX: number
          palmY: number
          screenX: number
          screenY: number
          isOpen: boolean
          pinchDist: number
        }> = []

        for (let i = 0; i < results.landmarks.length; i++) {
          const lm = results.landmarks[i]
          if (!lm || lm.length < 21) continue

          const handednessCategory = results.handednesses?.[i]?.[0]
          const handednessName = handednessCategory?.categoryName || 'Unknown'

          // Landmark 9 is the middle MCP joint (central palm knuckle)
          const palmX = lm[9].x
          const palmY = lm[9].y
          const screenX = isMirrored ? 1.0 - palmX : palmX
          const screenY = palmY

          // Robust Scale-Invariant Open Hand vs Closed Fist Heuristic:
          // Compare average distance from wrist (landmark[0]) to fingertips (8, 12, 16, 20)
          // divided by palm size: distance(landmark[0], landmark[9]).
          // If ratio > 1.5, hand is OPEN; if <= 1.5, hand is a closed FIST.
          const wrist = lm[0]
          const palmKnuckle = lm[9]
          const palmSize = Math.max(0.001, Math.hypot(palmKnuckle.x - wrist.x, palmKnuckle.y - wrist.y))

          const tipIndices = [8, 12, 16, 20]
          let totalTipDist = 0
          for (let f = 0; f < 4; f++) {
            const tip = lm[tipIndices[f]]
            totalTipDist += Math.hypot(tip.x - wrist.x, tip.y - wrist.y)
          }
          const avgTipDist = totalTipDist / 4.0
          const ratio = avgTipDist / palmSize
          const isOpen = ratio > 1.5

          // Pinch distance between Thumb tip (4) and Index tip (8)
          const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)

          candidates.push({
            landmarks: lm,
            handednessName,
            palmX,
            palmY,
            screenX,
            screenY,
            isOpen,
            pinchDist,
          })
        }

        let moshCand: (typeof candidates)[0] | null = null
        let audioCand: (typeof candidates)[0] | null = null

        // Assign Roles:
        // Screen Right (screenX > 0.5) = Right Hand / Mosh & Particle Controller
        // Screen Left (screenX <= 0.5) = Left Hand / Audio & Reactivity Controller
        if (candidates.length === 1) {
          const c = candidates[0]
          if (c.screenX > 0.5) {
            moshCand = c
          } else {
            audioCand = c
          }
        } else if (candidates.length >= 2) {
          candidates.sort((a, b) => a.screenX - b.screenX)
          audioCand = candidates[0]
          moshCand = candidates[candidates.length - 1]
        }

        const processCandidate = (
          cand: (typeof candidates)[0] | null,
          role: HandRole,
          isRight: boolean,
        ): TrackedHand | null => {
          if (!cand) {
            this.prevPositions.delete(role)
            this.smoothedVelocities.delete(role)
            this.fistStartTimes.delete(role)
            return null
          }

          const prev = this.prevPositions.get(role)
          let vx = 0
          let vy = 0

          if (prev) {
            const dt = Math.max(0.001, (now - prev.time) / 1000)
            const rawVx = (cand.palmX - prev.x) / dt
            const rawVy = (cand.palmY - prev.y) / dt

            const prevVel = this.smoothedVelocities.get(role) || [0, 0]
            const alpha = 0.35 // EMA smoothing factor
            vx = prevVel[0] * (1 - alpha) + rawVx * alpha
            vy = prevVel[1] * (1 - alpha) + rawVy * alpha
          }

          this.prevPositions.set(role, { x: cand.palmX, y: cand.palmY, time: now })
          this.smoothedVelocities.set(role, [vx, vy])

          return {
            role,
            isRightHand: isRight,
            palmPosition: [cand.palmX, cand.palmY],
            screenPosition: [cand.screenX, cand.screenY],
            palmVelocity: [vx, vy],
            isOpen: cand.isOpen,
            pinchDistance: cand.pinchDist,
            rawLandmarks: cand.landmarks,
          }
        }

        this.targetMoshHand = processCandidate(moshCand, 'mosh', true)
        this.targetAudioHand = processCandidate(audioCand, 'audio', false)
      } else {
        // No hands detected in frame
        this.targetMoshHand = null
        this.targetAudioHand = null
        this.prevPositions.clear()
        this.doubleFistTriggered = false
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 60 FPS INTERMEDIATE FRAME INTERPOLATION (lerp factor 0.35)
    // Seamlessly interpolates hand coordinates between discrete detection frames
    // ═══════════════════════════════════════════════════════════════════════════

    const interpolateHand = (
      current: TrackedHand | null,
      target: TrackedHand | null,
      role: HandRole,
      isRight: boolean,
    ): TrackedHand | null => {
      if (!target) {
        return null
      }

      if (!current) {
        return {
          ...target,
          screenPosition: [
            isMirrored ? 1.0 - target.palmPosition[0] : target.palmPosition[0],
            target.palmPosition[1],
          ],
        }
      }

      const factor = 0.35
      const newPalmX = lerp(current.palmPosition[0], target.palmPosition[0], factor)
      const newPalmY = lerp(current.palmPosition[1], target.palmPosition[1], factor)
      const newVx = lerp(current.palmVelocity[0], target.palmVelocity[0], factor)
      const newVy = lerp(current.palmVelocity[1], target.palmVelocity[1], factor)
      const newPinch = lerp(current.pinchDistance, target.pinchDistance, factor)

      return {
        role,
        isRightHand: isRight,
        palmPosition: [newPalmX, newPalmY],
        screenPosition: [isMirrored ? 1.0 - newPalmX : newPalmX, newPalmY],
        palmVelocity: [newVx, newVy],
        isOpen: target.isOpen,
        pinchDistance: newPinch,
        rawLandmarks: target.rawLandmarks,
      }
    }

    this.currentMoshHand = interpolateHand(this.currentMoshHand, this.targetMoshHand, 'mosh', true)
    this.currentAudioHand = interpolateHand(this.currentAudioHand, this.targetAudioHand, 'audio', false)

    // Double Fist Gesture Detection (both hands closed fists for >250ms)
    let doubleFist = false
    if (this.currentMoshHand && this.currentAudioHand && !this.currentMoshHand.isOpen && !this.currentAudioHand.isOpen) {
      const nowMs = performance.now()
      if (!this.fistStartTimes.has('mosh')) {
        this.fistStartTimes.set('mosh', nowMs)
      }
      const startTime = this.fistStartTimes.get('mosh') || nowMs
      if (nowMs - startTime > 250 && !this.doubleFistTriggered) {
        doubleFist = true
        this.doubleFistTriggered = true
      }
    } else {
      this.fistStartTimes.delete('mosh')
      this.doubleFistTriggered = false
    }

    return {
      isReady: true,
      isLoading: false,
      error: null,
      moshHand: this.currentMoshHand,
      audioHand: this.currentAudioHand,
      doubleFistDetected: doubleFist,
    }
  }

  public destroy(): void {
    if (this.landmarker) {
      try {
        this.landmarker.close()
      } catch {
        // Ignored
      }
      this.landmarker = null
    }
    this.targetMoshHand = null
    this.targetAudioHand = null
    this.currentMoshHand = null
    this.currentAudioHand = null
    this.isReady = false
    this.isLoading = false
    this.prevPositions.clear()
    this.smoothedVelocities.clear()
    this.fistStartTimes.clear()
    this.frameCount = 0
  }
}
