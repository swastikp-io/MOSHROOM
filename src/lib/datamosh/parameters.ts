import type { AudioMetrics } from '../audio/AudioAnalyzer.ts'

export interface MoshParameters {
  /** Raw user slider value: 0 to 100 */
  moshAmount: number
  /** User particle displacement slider: 0 to 100 (default: 25) */
  particleDisplacement?: number
  /** Normalized intensity: 0.0 to 1.0 */
  intensity: number
  /** When true (moshAmount == 0), bypass deformation shaders and render clean video (I-frame reset) */
  bypass: boolean
  /** Macroblock size in pixels: 12.0 (at 1-24) scaling up to 24.0 (at 100) */
  macroblockSize: number
  /** Legacy alias for macroblockSize */
  blockSize: number
  /** Temporal vector momentum across frames (P-frame bloom) (0.0 - 0.93) */
  vectorMomentum: number
  /** Legacy alias for vectorMomentum */
  vectorPersistence: number
  /** Magnitude of UV displacement along motion vectors (0.01 - 0.24) */
  displacementScale: number
  /** Temporal feedback preservation factor (0.0 - 1.0) */
  feedbackRetention: number
  /** Frame-by-frame visual decay: >0 at 1-24 for healing, strictly 0.0 at 25-100 for permanent freeze */
  decayRate: number
  /** Base camera leak: >0 at 1-24 for healing, strictly 0.0 at 25-100 for permanent freeze */
  residualBlend: number
  /** Quantized high-frequency P-frame residual injection intensity (0.0 - 0.85) */
  residualIntensity: number
  /** Zero-motion noise gate cost penalty for camera sensor grain */
  zeroMotionBias: number
  /** Edge contrast threshold for feature breakthrough (lower = more features punch through) */
  subPartitionThreshold: number
  /** Motion sensitivity threshold */
  motionThreshold: number
  /** Edge breakthrough blend strength: how strongly high-contrast features stamp through (0.0 - 0.22) */
  edgeBreakthrough: number
  /** Audio transient kick/onset strength (0.0 - 1.0) */
  audioTransient: number
  /** Velocity wave momentum friction decay rate across frames (0.90 - 0.97) */
  momentumDecay: number
  /** UV advection step factor carrying motion vectors forward across frames */
  advectionStep: number
}

/**
 * Derives all macroblock, momentum, and P-frame displacement parameters
 * from a single 0-100 MOSH AMOUNT value:
 *  - 0: Clean bypass (acts as an I-frame reset to 100% clean live video).
 *  - 1–24: Healing range. Gradual recovery and decay are active so lowering
 *          the slider smoothly heals and restores the image.
 *  - 25–100: True I-frame starvation. ZERO background healing (decayRate = 0.0,
 *            residualBlend = 0.0). Once pixels are smeared by motion, they stay
 *            permanently frozen on screen forever until new motion pushes them again.
 *            Higher values (25 -> 100) scale up displacement distance, vector
 *            momentum (bloom), macroblock size, and edge breakthrough strength.
 *
 * Saturation: The +50% (1.5x) saturation boost is applied in the shader to
 *             incoming camera pixels only — no parameter needed here.
 */
export function computeMoshParameters(
  moshAmount: number,
  audio?: AudioMetrics | null,
  particleDisplacement = 25,
): MoshParameters {
  const clamped = Math.max(0, Math.min(100, moshAmount))
  const normIntensity = clamped / 100.0

  const clampedDisp = Math.max(0, Math.min(100, particleDisplacement))
  const normDisp = clampedDisp / 100.0
  // Smooth exponential low-end curve (so low values like 2-15 stay tight and controlled)
  // Normalized at 25 (default) to yield exactly 1.0x baseline factor
  const defaultPower = Math.pow(0.25, 1.6)
  const dispFactor = clampedDisp <= 0 ? 0.0 : Math.pow(normDisp, 1.6) / defaultPower

  let base: MoshParameters

  if (clamped <= 0) {
    base = {
      moshAmount: 0,
      particleDisplacement: clampedDisp,
      intensity: 0,
      bypass: true,
      macroblockSize: 12.0,
      blockSize: 12.0,
      vectorMomentum: 0,
      vectorPersistence: 0,
      displacementScale: 0,
      feedbackRetention: 0,
      decayRate: 0.05,
      residualBlend: 1.0,
      residualIntensity: 0,
      zeroMotionBias: 0.05,
      subPartitionThreshold: 1.0,
      motionThreshold: 0.02,
      edgeBreakthrough: 0,
      audioTransient: 0.0,
      momentumDecay: 0.0,
      advectionStep: 0.0,
    }
  } else if (clamped < 25) {
    // Healing range (1 - 24): allows gradual recovery to clean webcam feed
    const fraction = clamped / 24.0 // 0.04 to 1.0
    const healFactor = (25.0 - clamped) / 24.0 // 1.0 down to 0.04

    const macroblockSize = 12.0
    const vectorMomentum = 0.10 + 0.25 * fraction
    const displacementScale = (0.012 + 0.028 * fraction) * dispFactor
    const feedbackRetention = 0.50 + 0.40 * fraction
    const decayRate = 0.003 + 0.035 * healFactor
    const residualBlend = 0.03 + 0.32 * healFactor
    const residualIntensity = 0.05 + 0.15 * fraction
    const zeroMotionBias = 0.035 - 0.010 * fraction
    const subPartitionThreshold = 0.85
    const motionThreshold = 0.014 - 0.004 * fraction
    const edgeBreakthrough = 0.04 + 0.06 * fraction // Gentle feature ghosting
    const momentumDecay = 0.85 + 0.05 * fraction
    const advectionStep = 0.8 + 0.4 * fraction

    base = {
      moshAmount: clamped,
      particleDisplacement: clampedDisp,
      intensity: normIntensity,
      bypass: false,
      macroblockSize,
      blockSize: macroblockSize,
      vectorMomentum,
      vectorPersistence: vectorMomentum,
      displacementScale,
      feedbackRetention,
      decayRate,
      residualBlend,
      residualIntensity,
      zeroMotionBias,
      subPartitionThreshold,
      motionThreshold,
      edgeBreakthrough,
      audioTransient: 0.0,
      momentumDecay,
      advectionStep,
    }
  } else {
    // True I-Frame Starvation (25 - 100):
    // ZERO background healing: smeared pixels freeze in place permanently!
    const t = (clamped - 25.0) / 75.0 // 0.0 to 1.0
    const tPow = Math.pow(t, 1.35)

    // Macroblock size: smoothly scales from 12px up to 24px
    const macroblockSize = Math.round(12.0 + 12.0 * t)

    // Vector momentum (P-frame bloom): carries motion forward across frames
    const vectorMomentum = 0.35 + 0.58 * Math.pow(t, 0.85)

    // Displacement scale: aggressively scaled for kinetic macroblock/particle fling
    const displacementScale = Math.min(0.85, (0.040 + 0.210 * tPow) * dispFactor)

    // Velocity wave momentum friction decay rate across frames (0.91 to 0.97)
    // Carries velocity waves across stationary regions for 20-60 frames
    const momentumDecay = 0.91 + 0.06 * Math.pow(t, 0.75)

    // Self-advection step factor: carries velocity field forward along motion vectors
    const advectionStep = 1.0 + 1.2 * t

    // 100% feedback retention: zero decay, zero baseline leak
    const feedbackRetention = 1.0
    const decayRate = 0.0
    const residualBlend = 0.0

    // P-frame residual injection on moving edges (pure RGB, no chroma boost)
    const residualIntensity = 0.25 + 0.60 * t

    // Noise gate cost penalty for camera sensor grain
    const zeroMotionBias = Math.max(0.006, 0.025 - 0.018 * t)

    // Edge contrast threshold: lower = more features punch through
    const subPartitionThreshold = Math.max(0.12, 0.35 - 0.23 * t)

    // Motion threshold
    const motionThreshold = Math.max(0.003, 0.010 - 0.007 * t)

    // Edge breakthrough: how strongly high-contrast features ghost through the melt
    const edgeBreakthrough = 0.10 + 0.12 * t

    base = {
      moshAmount: clamped,
      particleDisplacement: clampedDisp,
      intensity: normIntensity,
      bypass: false,
      macroblockSize,
      blockSize: macroblockSize,
      vectorMomentum,
      vectorPersistence: vectorMomentum,
      displacementScale,
      feedbackRetention,
      decayRate,
      residualBlend,
      residualIntensity,
      zeroMotionBias,
      subPartitionThreshold,
      motionThreshold,
      edgeBreakthrough,
      audioTransient: 0.0,
      momentumDecay,
      advectionStep,
    }
  }

  if (audio && audio.isPlaying) {
    return applyAudioModulation(base, audio)
  }

  return base
}

/**
 * Modulates datamosh parameters dynamically using real-time Web Audio FFT metrics.
 * Uses MOSH AMOUNT as the master intensity ceiling.
 *
 * 1. Bass & Transient -> P-Frame Bloom & Displacement Surge:
 *    - Displacement surges (1.5x to 3.0x scaled by MOSH AMOUNT) on heavy kicks/bass drops,
 *      settling to a calm baseline on silent passages.
 *    - Vector momentum boosts during sustained bass/mid passages so smeared ribbons slide longer.
 *
 * 2. Beat-Driven Macroblock Sizing & Transient Jolt:
 *    - Chunky macroblocks (jumping from 12px up to 24px-32px) on heavy bass hits.
 *    - Audio transient uniform passed to shaders for beat-synchronous macroblock nudges.
 *
 * 3. Highs/Snares -> High-Contrast Edge Stamp:
 *    - Edge breakthrough blend surges with high frequency energy so sharp features
 *      (eyes, lips, hands, dark outlines) punch through and stamp onto the melted canvas.
 */
export function applyAudioModulation(
  base: MoshParameters,
  audio: AudioMetrics | null | undefined,
): MoshParameters {
  if (!audio || !audio.isPlaying || base.bypass) {
    return {
      ...base,
      audioTransient: 0.0,
    }
  }

  const { bass, mid, high, transient } = audio
  const intensity = base.intensity // Master ceiling: 0.0 to 1.0

  // 1. Bass & Transient -> Displacement Surge (1.5x to 3.0x scaled by MOSH AMOUNT)
  // Calm baseline on silent passages (0.75x base); surges on heavy drops
  const baseline = 0.75
  const surgeMultiplier = baseline + (1.25 * bass + 1.0 * transient) * intensity
  const displacementScale = base.displacementScale * surgeMultiplier

  // Temporal vector momentum boost on sustained bass/mid
  const momentumBoost = (0.24 * bass + 0.16 * mid) * intensity * (1.0 - base.vectorMomentum)
  const vectorMomentum = Math.min(0.97, base.vectorMomentum + momentumBoost)

  // 2. Chunky Macroblock Shift on heavy bass hits (e.g. jumping from 12px to 24px-32px)
  const blockSurge = Math.round((12.0 * bass + 8.0 * transient) * (0.60 + 0.40 * intensity))
  const macroblockSize = Math.min(32.0, Math.max(12.0, base.macroblockSize + blockSurge))

  // 3. Highs/Snares -> High-Contrast Edge Stamp
  const edgeBreakthrough = Math.min(
    0.40,
    base.edgeBreakthrough * (1.0 + 1.8 * high * intensity) + 0.08 * high * intensity,
  )
  const subPartitionThreshold = Math.max(
    0.06,
    base.subPartitionThreshold - 0.16 * high * intensity,
  )

  // Keep motion noise gate threshold strict during audio beats so webcam sensor grain never triggers
  // fake grid motion in stationary regions (0.0 * audio = 0.0)
  const motionThreshold = base.motionThreshold

  // Bass / Sub boosts temporal smear momentum retention up to 0.97 on existing motion
  const momentumDecay = Math.min(0.975, base.momentumDecay + 0.03 * bass * intensity + 0.01 * transient * intensity)
  const advectionStep = base.advectionStep * (1.0 + (0.3 * bass + 0.3 * transient) * intensity)

  return {
    ...base,
    macroblockSize,
    blockSize: macroblockSize,
    vectorMomentum,
    vectorPersistence: vectorMomentum,
    displacementScale,
    edgeBreakthrough,
    subPartitionThreshold,
    motionThreshold,
    audioTransient: transient,
    momentumDecay,
    advectionStep,
  }
}
