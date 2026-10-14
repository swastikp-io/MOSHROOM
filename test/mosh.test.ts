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

test('computeMoshParameters at 0 bypasses effects cleanly', () => {
  const p0 = computeMoshParameters(0)
  assert.equal(p0.bypass, true)
  assert.equal(p0.intensity, 0)
  assert.equal(p0.displacementScale, 0)
  assert.equal(p0.feedbackRetention, 0)
  assert.equal(p0.vectorMomentum, 0)
})

test('computeMoshParameters at default value (45) produces balanced values', () => {
  const p45 = computeMoshParameters(45)
  assert.equal(p45.bypass, false)
  assert.equal(p45.moshAmount, 45)
  assert.ok(p45.intensity >= 0.44 && p45.intensity <= 0.46)
  assert.equal(p45.macroblockSize, 16.0) // 16x16 macroblock for > 40
  assert.ok(p45.displacementScale > 0.04 && p45.displacementScale < 0.12)
  assert.ok(p45.feedbackRetention > 0.7 && p45.feedbackRetention < 0.85)
  assert.ok(p45.vectorMomentum >= 0.35 && p45.vectorMomentum <= 0.5)
  assert.ok(p45.residualIntensity > 0.2)
})

test('computeMoshParameters at 15-40 uses 16x16 macroblock size and low momentum', () => {
  const p25 = computeMoshParameters(25)
  assert.equal(p25.macroblockSize, 16.0)
  assert.ok(p25.vectorMomentum <= 0.35)
  assert.ok(p25.decayRate > 0.01) // Fast recovery
})

test('computeMoshParameters at 76-100 activates aggressive P-frame bloom and near-zero refresh', () => {
  const p85 = computeMoshParameters(85)
  assert.equal(p85.macroblockSize, 20.0)
  assert.ok(p85.vectorMomentum >= 0.75, 'Momentum should be high for P-frame bloom')
  assert.ok(p85.decayRate < 0.002, 'Decay should be near-zero in stationary zones')
  assert.ok(p85.residualIntensity > 0.6)

  const p100 = computeMoshParameters(100)
  assert.equal(p100.bypass, false)
  assert.equal(p100.intensity, 1.0)
  assert.ok(p100.displacementScale > 0.18)
  assert.ok(p100.feedbackRetention <= 0.99)
  assert.ok(p100.feedbackRetention >= 0.95)
  assert.ok(p100.decayRate > 0.0003) // Must maintain non-zero decay to prevent overflow
  assert.ok(p100.residualBlend > 0.02)
  assert.ok(p100.vectorMomentum >= 0.9)
})

test('computeMoshParameters is strictly monotonic across 1..100', () => {
  let prevDisplacement = 0
  let prevRetention = 0
  let prevMomentum = 0

  for (let amount = 1; amount <= 100; amount++) {
    const p = computeMoshParameters(amount)
    assert.ok(p.displacementScale >= prevDisplacement, `Displacement failed monotonic increase at ${amount}`)
    assert.ok(p.feedbackRetention >= prevRetention, `Retention failed monotonic increase at ${amount}`)
    assert.ok(p.vectorMomentum >= prevMomentum, `Momentum failed monotonic increase at ${amount}`)
    assert.ok(p.decayRate >= 0 && p.decayRate <= 1.0)
    assert.ok(p.residualBlend >= 0 && p.residualBlend <= 1.0)
    assert.ok(p.macroblockSize === 16.0 || p.macroblockSize === 20.0)
    assert.ok(p.vectorMomentum >= 0 && p.vectorMomentum <= 1.0)

    prevDisplacement = p.displacementScale
    prevRetention = p.feedbackRetention
    prevMomentum = p.vectorMomentum
  }
})

test('computeMoshParameters handles negative or out-of-range values gracefully', () => {
  const pNeg = computeMoshParameters(-20)
  assert.equal(pNeg.moshAmount, 0)
  assert.equal(pNeg.bypass, true)

  const pOver = computeMoshParameters(150)
  assert.equal(pOver.moshAmount, 100)
  assert.equal(pOver.intensity, 1.0)
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

  // Check display shader aspect ratio and flip uniforms
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_canvas_aspect'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_video_aspect'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_flip_y'))
  assert.ok(DISPLAY_FRAGMENT_SHADER.includes('u_flip_x'))
})
