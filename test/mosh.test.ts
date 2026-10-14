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
