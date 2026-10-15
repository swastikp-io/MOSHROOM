import test from 'node:test'
import assert from 'node:assert/strict'
import { computeMoshParameters } from '../src/lib/datamosh/parameters.ts'
import {
  VERTEX_SHADER,
  COPY_FRAGMENT_SHADER,
  MOTION_ESTIMATION_FRAGMENT_SHADER,
  DATAMOSH_FRAGMENT_SHADER,
  DISPLAY_FRAGMENT_SHADER,
} from '../src/lib/datamosh/shaders.ts'
import {
  BLEND_MODE_CATEGORIES,
  BLEND_MODE_MAP,
  getBlendModeGlIndex,
  type BlendModeId,
} from '../src/lib/datamosh/blendModes.ts'

test('computeMoshParameters at 0 bypasses effects cleanly (I-frame reset)', () => {
  const p0 = computeMoshParameters(0)
  assert.equal(p0.bypass, true)
  assert.equal(p0.intensity, 0)
  assert.equal(p0.displacementScale, 0)
  assert.equal(p0.feedbackRetention, 0)
  assert.equal(p0.vectorMomentum, 0)
})

test('computeMoshParameters at 1-24 enables gradual healing back to live webcam', () => {
  const p10 = computeMoshParameters(10)
  assert.equal(p10.bypass, false)
  assert.ok(p10.decayRate > 0.0, 'Healing range must have decayRate > 0')
  assert.ok(p10.residualBlend > 0.0, 'Healing range must have residualBlend > 0')
  assert.equal(p10.macroblockSize, 12.0)
})

test('computeMoshParameters at 25 locks background healing strictly to 0.0 (permanent freeze)', () => {
  const p25 = computeMoshParameters(25)
  assert.equal(p25.bypass, false)
  assert.equal(p25.decayRate, 0.0, 'MOSH AMOUNT >= 25 must have zero decay')
  assert.equal(p25.residualBlend, 0.0, 'MOSH AMOUNT >= 25 must have zero baseline leak')
  assert.equal(p25.macroblockSize, 12.0)
  assert.equal(p25.feedbackRetention, 1.0)
})

test('computeMoshParameters at default value (45) operates with permanent freeze and intact tiles', () => {
  const p45 = computeMoshParameters(45)
  assert.equal(p45.bypass, false)
  assert.equal(p45.moshAmount, 45)
  assert.equal(p45.decayRate, 0.0, 'Default value 45 must permanently freeze pixels')
  assert.equal(p45.residualBlend, 0.0)
  assert.equal(p45.feedbackRetention, 1.0)
  assert.ok(p45.macroblockSize >= 14.0 && p45.macroblockSize <= 18.0)
  assert.ok(p45.displacementScale > 0.04)
  assert.ok(p45.vectorMomentum >= 0.40)
})

test('computeMoshParameters at 76-100 activates high momentum bloom, large 24px blocks, and zero healing', () => {
  const p85 = computeMoshParameters(85)
  assert.equal(p85.decayRate, 0.0)
  assert.equal(p85.residualBlend, 0.0)
  assert.equal(p85.feedbackRetention, 1.0)
  assert.ok(p85.macroblockSize >= 20.0)
  assert.ok(p85.vectorMomentum >= 0.75, 'Momentum should be high for P-frame bloom')
  assert.ok(p85.residualIntensity > 0.6)

  const p100 = computeMoshParameters(100)
  assert.equal(p100.bypass, false)
  assert.equal(p100.intensity, 1.0)
  assert.equal(p100.decayRate, 0.0)
  assert.equal(p100.residualBlend, 0.0)
  assert.equal(p100.feedbackRetention, 1.0)
  assert.equal(p100.macroblockSize, 24.0)
  assert.ok(p100.displacementScale >= 0.20)
  assert.ok(p100.vectorMomentum >= 0.90)
})

test('computeMoshParameters is strictly monotonic for displacement, retention, and momentum', () => {
  let prevDisplacement = 0
  let prevRetention = 0
  let prevMomentum = 0
  let prevBlockSize = 0

  for (let amount = 1; amount <= 100; amount++) {
    const p = computeMoshParameters(amount)
    assert.ok(p.displacementScale >= prevDisplacement, `Displacement failed monotonic increase at ${amount}`)
    assert.ok(p.feedbackRetention >= prevRetention, `Retention failed monotonic increase at ${amount}`)
    assert.ok(p.vectorMomentum >= prevMomentum, `Momentum failed monotonic increase at ${amount}`)
    assert.ok(p.macroblockSize >= prevBlockSize, `MacroblockSize failed monotonic increase at ${amount}`)
    assert.ok(p.macroblockSize >= 12.0 && p.macroblockSize <= 24.0)

    if (amount >= 25) {
      assert.equal(p.decayRate, 0.0, `Decay must be 0 at ${amount}`)
      assert.equal(p.residualBlend, 0.0, `Residual blend must be 0 at ${amount}`)
      assert.equal(p.feedbackRetention, 1.0)
    }

    prevDisplacement = p.displacementScale
    prevRetention = p.feedbackRetention
    prevMomentum = p.vectorMomentum
    prevBlockSize = p.macroblockSize
  }
})

test('computeMoshParameters handles negative or out-of-range values gracefully', () => {
  const pNeg = computeMoshParameters(-20)
  assert.equal(pNeg.moshAmount, 0)
  assert.equal(pNeg.bypass, true)

  const pOver = computeMoshParameters(150)
  assert.equal(pOver.moshAmount, 100)
  assert.equal(pOver.intensity, 1.0)
  assert.equal(pOver.decayRate, 0.0)
})

test('GLSL shader sources are well-formed WebGL2 ES 3.00 shaders with macroblock uniforms', () => {
  const shaders = [
    { name: 'VERTEX_SHADER', code: VERTEX_SHADER },
    { name: 'COPY_FRAGMENT_SHADER', code: COPY_FRAGMENT_SHADER },
    { name: 'MOTION_ESTIMATION_FRAGMENT_SHADER', code: MOTION_ESTIMATION_FRAGMENT_SHADER },
    { name: 'DATAMOSH_FRAGMENT_SHADER', code: DATAMOSH_FRAGMENT_SHADER },
    { name: 'DISPLAY_FRAGMENT_SHADER', code: DISPLAY_FRAGMENT_SHADER },
  ]

  for (const s of shaders) {
    assert.ok(s.code.trim().startsWith('#version 300 es'), `${s.name} missing #version 300 es`)
    assert.ok(s.code.includes('void main()'), `${s.name} missing main function`)
  }

  // Check specific required uniforms in motion estimation
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_curr_frame'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_prev_frame'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_prev_motion'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_zero_motion_bias'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_vector_momentum'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_audioTransient'))

  // Check specific required uniforms in datamosh shader
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_curr_frame'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_prev_frame'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_prev_feedback'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_motion_texture'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_macroblock_size'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_displacement_scale'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_feedback_retention'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_residual_intensity'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_sub_partition_threshold'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_audioTransient'))

  // Check display shader aspect ratio and flip uniforms
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_canvas_aspect'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_video_aspect'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_flip_y'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_flip_x'))
})

test('computeMoshParameters at restored amount (50) provides balanced freeze and macroblock displacement', () => {
  const p50 = computeMoshParameters(50)
  assert.equal(p50.bypass, false)
  assert.equal(p50.moshAmount, 50)
  assert.equal(p50.decayRate, 0.0, 'Restored value 50 must have 0 decay rate (permanent freeze)')
  assert.equal(p50.residualBlend, 0.0)
  assert.equal(p50.feedbackRetention, 1.0)
  assert.equal(p50.macroblockSize, 16.0, 'Value 50 uses 16x16 macroblock grid')
  assert.ok(p50.displacementScale >= 0.05 && p50.displacementScale <= 0.10)
  assert.ok(p50.vectorMomentum >= 0.45 && p50.vectorMomentum <= 0.60)
})

test('audio-reactive physics respects MOSH AMOUNT = 0 as master bypass ceiling', () => {
  const p0 = computeMoshParameters(0, {
    bass: 1.0,
    mid: 1.0,
    high: 1.0,
    transient: 1.0,
    isPlaying: true,
  })
  assert.equal(p0.bypass, true, 'MOSH AMOUNT = 0 must bypass effects even if audio is full blast')
  assert.equal(p0.displacementScale, 0)
  assert.equal(p0.audioTransient, 0.0)
})

test('audio-reactive physics: inactive or paused audio preserves base parameters', () => {
  const base = computeMoshParameters(50)
  const paused = computeMoshParameters(50, {
    bass: 0.9,
    mid: 0.8,
    high: 0.7,
    transient: 0.85,
    isPlaying: false,
  })
  assert.equal(paused.displacementScale, base.displacementScale)
  assert.equal(paused.vectorMomentum, base.vectorMomentum)
  assert.equal(paused.macroblockSize, base.macroblockSize)
  assert.equal(paused.audioTransient, 0.0)
})

test('audio-reactive physics: bass & transient surge displacement by 1.5x to 3.0x scaled by MOSH AMOUNT', () => {
  const base50 = computeMoshParameters(50)
  const surged50 = computeMoshParameters(50, {
    bass: 0.95,
    mid: 0.4,
    high: 0.2,
    transient: 0.90,
    isPlaying: true,
  })

  const ratio50 = surged50.displacementScale / base50.displacementScale
  assert.ok(ratio50 >= 1.5 && ratio50 <= 3.0, `Displacement surge ratio at 50 was ${ratio50}, expected 1.5x-3.0x`)

  const base100 = computeMoshParameters(100)
  const surged100 = computeMoshParameters(100, {
    bass: 1.0,
    mid: 0.5,
    high: 0.3,
    transient: 1.0,
    isPlaying: true,
  })
  const ratio100 = surged100.displacementScale / base100.displacementScale
  assert.ok(ratio100 >= 2.5 && ratio100 <= 3.05, `Displacement surge ratio at 100 was ${ratio100}, expected ~3.0x`)
})

test('audio-reactive physics: heavy bass shifts macroblock size chunky (up to 24px-32px)', () => {
  const base25 = computeMoshParameters(25)
  assert.equal(base25.macroblockSize, 12.0)

  const heavyKick = computeMoshParameters(25, {
    bass: 1.0,
    mid: 0.2,
    high: 0.1,
    transient: 0.95,
    isPlaying: true,
  })
  assert.ok(heavyKick.macroblockSize >= 20.0, `Macroblock size should surge on heavy kick, got ${heavyKick.macroblockSize}`)
  assert.ok(heavyKick.macroblockSize <= 32.0)
})

test('audio-reactive physics: sustained bass/mid boosts vector momentum', () => {
  const base = computeMoshParameters(50)
  const boosted = computeMoshParameters(50, {
    bass: 0.85,
    mid: 0.80,
    high: 0.2,
    transient: 0.2,
    isPlaying: true,
  })
  assert.ok(boosted.vectorMomentum > base.vectorMomentum, 'Momentum should boost during sustained bass/mid')
  assert.ok(boosted.vectorMomentum <= 0.98)
})

test('audio-reactive physics: high frequencies punch edgeBreakthrough and lower subPartitionThreshold', () => {
  const base = computeMoshParameters(50)
  const snareHit = computeMoshParameters(50, {
    bass: 0.2,
    mid: 0.5,
    high: 0.95,
    transient: 0.3,
    isPlaying: true,
  })
  assert.ok(snareHit.edgeBreakthrough > base.edgeBreakthrough, 'edgeBreakthrough should boost on high/snare hits')
  assert.ok(snareHit.subPartitionThreshold < base.subPartitionThreshold, 'subPartitionThreshold should lower for edge stamp')
})

test('audio-reactive physics: strong kick transient preserves strict noise gate threshold so stationary background never twitches', () => {
  const base = computeMoshParameters(50)
  const kick = computeMoshParameters(50, {
    bass: 0.9,
    mid: 0.3,
    high: 0.1,
    transient: 0.85,
    isPlaying: true,
  })
  assert.equal(kick.audioTransient, 0.85)
  assert.equal(kick.motionThreshold, base.motionThreshold, 'motionThreshold must remain strict during audio to prevent stationary sensor grain twitch')
})

test('self-advection & momentum decay parameters are calibrated for 20-60 frame velocity propagation', () => {
  const p25 = computeMoshParameters(25)
  assert.ok(p25.momentumDecay >= 0.90 && p25.momentumDecay <= 0.93, `Expected momentumDecay >= 0.90, got ${p25.momentumDecay}`)
  assert.ok(p25.advectionStep >= 1.0)

  const p50 = computeMoshParameters(50)
  assert.ok(p50.momentumDecay >= 0.92 && p50.momentumDecay <= 0.95, `Expected momentumDecay >= 0.92, got ${p50.momentumDecay}`)
  assert.ok(p50.advectionStep > p25.advectionStep)

  const p100 = computeMoshParameters(100)
  assert.ok(p100.momentumDecay >= 0.96 && p100.momentumDecay <= 0.98, `Expected momentumDecay ~0.97, got ${p100.momentumDecay}`)
  assert.ok(p100.advectionStep >= 2.0)
})

test('shaders include organic macroblock warping, multiplicative audio displacement, and audio uniforms', () => {
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_momentum_decay'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_advection_step'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_audioBass'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('advectUV'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_audioBass'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_audioMid'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_audioHigh'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('warpedUV'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('audioGain'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('organicMotionVector'))
})

test('shaders include hand-tracking uniforms and gesture gating for datamosh brush and freeze/lock', () => {
  // Motion Estimation Fragment Shader
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_moshHandActive'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_moshHandPos'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_moshHandVel'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('u_moshHandRadius'))
  assert.ok(MOTION_ESTIMATION_FRAGMENT_SHADER.includes('handInfluence'))

  // Datamosh Fragment Shader
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_moshHandActive'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_moshHandPos'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_moshHandVel'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_moshHandRadius'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('nearHand'))
})

test('particleDisplacement slider controls displacement scale along smooth exponential curve', () => {
  const pZero = computeMoshParameters(60, null, 0)
  assert.equal(pZero.displacementScale, 0, 'Displacement must be 0 when particleDisplacement = 0')

  const pTight = computeMoshParameters(60, null, 10)
  const pDefault = computeMoshParameters(60, null, 25)
  const pHigh = computeMoshParameters(60, null, 50)
  const pMax = computeMoshParameters(60, null, 100)

  assert.ok(pTight.displacementScale < pDefault.displacementScale * 0.35, 'Low particle displacement must stay tight')
  assert.ok(pHigh.displacementScale > pDefault.displacementScale * 2.5, '50 displacement should be ~3x default')
  assert.ok(pMax.displacementScale > pDefault.displacementScale * 7.0, '100 displacement should be >= 7x default')
  assert.ok(pMax.displacementScale <= 1.0)
})

test('video overlay blend modes: all 27 Photoshop modes are categorized without duplicates or gaps', () => {
  assert.equal(BLEND_MODE_CATEGORIES.length, 6)

  const expectedCategories = [
    'Normal modes',
    'Darken modes',
    'Lighten modes',
    'Contrast modes',
    'Comparative modes',
    'Composite modes',
  ]
  const actualCategories = BLEND_MODE_CATEGORIES.map((c) => c.category)
  assert.deepEqual(actualCategories, expectedCategories)

  const allModes = BLEND_MODE_CATEGORIES.flatMap((c) => c.modes)
  assert.equal(allModes.length, 27)

  // Verify glIndex 0 to 26 strictly sequential without gaps or duplicates
  const glIndices = allModes.map((m) => m.glIndex)
  for (let i = 0; i < 27; i++) {
    assert.equal(glIndices[i], i, `Expected index ${i} at position ${i}`)
  }

  // Verify map and helper
  assert.equal(BLEND_MODE_MAP['screen'], 8)
  assert.equal(getBlendModeGlIndex('normal'), 0)
  assert.equal(getBlendModeGlIndex('dissolve'), 1)
  assert.equal(getBlendModeGlIndex('multiply'), 3)
  assert.equal(getBlendModeGlIndex('screen'), 8)
  assert.equal(getBlendModeGlIndex('overlay'), 12)
  assert.equal(getBlendModeGlIndex('difference'), 19)
  assert.equal(getBlendModeGlIndex('luminosity'), 26)

  // Fallback test
  assert.equal(getBlendModeGlIndex('unknown' as unknown as BlendModeId), 0)
})

test('DATAMOSH_FRAGMENT_SHADER integrates video overlay uniforms and 27 blend modes into mosh deformation', () => {
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_overlay_texture'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_overlay_active'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_overlay_opacity'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_overlay_blend_mode'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('u_overlay_aspect'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('compositeBaseRGB'))
  assert.ok(DATAMOSH_FRAGMENT_SHADER.includes('applyBlendMode'))

  // Verify all 27 mode branches (mode == 0 through mode == 26) exist in GLSL
  for (let i = 0; i <= 26; i++) {
    assert.ok(
      DATAMOSH_FRAGMENT_SHADER.includes(`mode == ${i}`),
      `DATAMOSH_FRAGMENT_SHADER missing branch for blend mode ${i}`,
    )
  }

  // Verify DISPLAY_FRAGMENT_SHADER preserves aspect ratio cover and flip controls
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_texture'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_canvas_aspect'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_video_aspect'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_flip_y'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_flip_x'))
})

