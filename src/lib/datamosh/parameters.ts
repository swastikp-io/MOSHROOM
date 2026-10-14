export interface MoshParameters {
  /** Raw user slider value: 0 to 100 */
  moshAmount: number
  /** Normalized intensity: 0.0 to 1.0 */
  intensity: number
  /** When true (moshAmount == 0), bypass deformation shaders and render clean video */
  bypass: boolean
  /** Macroblock size in pixels: strictly 16.0 (or 20.0 at high intensity) */
  macroblockSize: number
  /** Legacy alias for macroblockSize */
  blockSize: number
  /** Temporal vector momentum across frames (P-frame bloom) (0.0 - 0.92) */
  vectorMomentum: number
  /** Legacy alias for vectorMomentum */
  vectorPersistence: number
  /** Magnitude of UV displacement along motion vectors (0.01 - 0.22) */
  displacementScale: number
  /** Temporal feedback preservation factor (0.0 - 0.988) */
  feedbackRetention: number
  /** Frame-by-frame visual decay to prevent permanent white-out or lockup */
  decayRate: number
  /** Amount of new camera frame blended into persistent areas */
  residualBlend: number
  /** Quantized high-frequency P-frame residual injection intensity (0.0 - 0.85) */
  residualIntensity: number
  /** Zero-motion noise gate cost penalty for camera sensor grain */
  zeroMotionBias: number
  /** Motion confidence threshold to trigger sub-partitioning (calmed down for 80%+ motion) */
  subPartitionThreshold: number
  /** Chroma plane displacement multiplier for compression-style color bleeding */
  chromaOffset: number
  /** Motion sensitivity threshold */
  motionThreshold: number
}

/**
 * Derives all macroblock, momentum, and P-frame displacement parameters
 * from a single 0-100 MOSHROOM AMOUNT value:
 *  - 0: Clean bypass.
 *  - 15–40: 16x16 block size, low vector momentum, fast I-frame recovery.
 *           Cohesive block dragging without shattering into confetti.
 *  - 41–75: 16x16/20x20 macroblocks with sub-partitioning restricted only to extreme contrast edges.
 *           Strong P-frame displacement, rectangular block tearing, and residual color contamination.
 *  - 76–100: Aggressive P-frame bloom (high vector momentum), maximum block displacement scale,
 *            near-zero I-frame refresh in stationary zones, and large macroblock ribbons.
 */
export function computeMoshParameters(moshAmount: number): MoshParameters {
  const clamped = Math.max(0, Math.min(100, moshAmount))
  const t = clamped / 100.0

  if (clamped <= 0) {
    return {
      moshAmount: 0,
      intensity: 0,
      bypass: true,
      macroblockSize: 16.0,
      blockSize: 16.0,
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

  // Base macroblock size kept strictly at 16x16 (or 20x20 at high intensity)
  const macroblockSize = clamped <= 50 ? 16.0 : 20.0

  // Vector momentum (P-frame bloom)
  let vectorMomentum: number
  if (t <= 0.40) {
    vectorMomentum = 0.05 + 0.30 * (t / 0.40)
  } else if (t <= 0.75) {
    vectorMomentum = 0.35 + 0.35 * ((t - 0.40) / 0.35)
  } else {
    vectorMomentum = 0.70 + 0.22 * Math.pow((t - 0.75) / 0.25, 0.8)
  }

  // Displacement scale
  const displacementScale = 0.012 + 0.19 * Math.pow(t, 1.35)

  // Feedback retention
  const feedbackRetention = 0.38 + 0.605 * Math.sqrt(t)

  // Decay rate: fast recovery at low intensity, near-zero refresh at high intensity
  const decayRate = clamped >= 76
    ? 0.0005 + 0.0015 * (1.0 - (clamped - 76) / 24.0)
    : 0.002 + 0.018 * Math.pow(1.0 - t, 0.8)

  // Residual camera blend
  const residualBlend = 0.03 + 0.37 * Math.pow(1.0 - t, 0.85)

  // P-frame residual injection
  const residualIntensity = clamped < 15
    ? 0.0
    : 0.15 + 0.70 * ((clamped - 15) / 85.0)

  // Zero-motion noise gate bias
  const zeroMotionBias = Math.max(0.008, 0.038 - 0.026 * t)

  // Calmed down sub-partition threshold: requires very high confidence (>0.70)
  const subPartitionThreshold = Math.max(0.68, 0.88 - 0.20 * t)

  // Chroma plane offset
  const chromaOffset = 0.3 + 0.7 * t

  // Motion sensitivity threshold
  const motionThreshold = Math.max(0.003, 0.015 - 0.01 * t)

  return {
    moshAmount: clamped,
    intensity: t,
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
