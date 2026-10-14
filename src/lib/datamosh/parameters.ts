export interface MoshParameters {
  /** Raw user slider value: 0 to 100 */
  moshAmount: number
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
  /** Motion confidence threshold to trigger sub-partitioning */
  subPartitionThreshold: number
  /** Chroma plane displacement multiplier for compression-style color bleeding */
  chromaOffset: number
  /** Motion sensitivity threshold */
  motionThreshold: number
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
 *            momentum (bloom), macroblock size (12px -> 24px), and residual edge bleeding.
 */
export function computeMoshParameters(moshAmount: number): MoshParameters {
  const clamped = Math.max(0, Math.min(100, moshAmount))
  const normIntensity = clamped / 100.0

  if (clamped <= 0) {
    return {
      moshAmount: 0,
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
      chromaOffset: 0,
      motionThreshold: 0.02,
    }
  }

  // Healing range (1 - 24): allows gradual recovery to clean webcam feed
  if (clamped < 25) {
    const fraction = clamped / 24.0 // 0.04 to 1.0
    const healFactor = (25.0 - clamped) / 24.0 // 1.0 down to 0.04

    const macroblockSize = 12.0
    const vectorMomentum = 0.10 + 0.20 * fraction
    const displacementScale = 0.012 + 0.028 * fraction
    const feedbackRetention = 0.50 + 0.40 * fraction
    const decayRate = 0.003 + 0.035 * healFactor
    const residualBlend = 0.03 + 0.32 * healFactor
    const residualIntensity = 0.05 + 0.12 * fraction
    const zeroMotionBias = 0.035 - 0.010 * fraction
    const subPartitionThreshold = 0.85
    const chromaOffset = 0.3 + 0.3 * fraction
    const motionThreshold = 0.014 - 0.004 * fraction

    return {
      moshAmount: clamped,
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
      chromaOffset,
      motionThreshold,
    }
  }

  // True I-Frame Starvation (25 - 100):
  // ZERO background healing: smeared pixels freeze in place permanently!
  const t = (clamped - 25.0) / 75.0 // 0.0 to 1.0
  const tPow = Math.pow(t, 1.25)

  // Macroblock size: smoothly scales from 12px up to 24px
  const macroblockSize = Math.round(12.0 + 12.0 * t)

  // Vector momentum (P-frame bloom): carries motion forward across frames
  const vectorMomentum = 0.35 + 0.58 * Math.pow(t, 0.85)

  // Displacement scale
  const displacementScale = 0.040 + 0.20 * tPow

  // 100% feedback retention: zero decay, zero baseline leak
  const feedbackRetention = 1.0
  const decayRate = 0.0
  const residualBlend = 0.0

  // P-frame residual color-block injection on moving edges
  const residualIntensity = 0.20 + 0.65 * t

  // Noise gate cost penalty for camera sensor grain
  const zeroMotionBias = Math.max(0.006, 0.025 - 0.018 * t)

  // Sub-partition threshold for high-contrast edges
  const subPartitionThreshold = Math.max(0.65, 0.82 - 0.17 * t)

  // Chroma plane offset
  const chromaOffset = 0.5 + 0.5 * t

  // Motion threshold
  const motionThreshold = Math.max(0.003, 0.010 - 0.007 * t)

  return {
    moshAmount: clamped,
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
    chromaOffset,
    motionThreshold,
  }
}
