/**
 * Fullscreen Triangle Vertex Shader
 * Generates fullscreen coverage using gl_VertexID without requiring vertex buffers.
 */
export const VERTEX_SHADER = `#version 300 es
out vec2 v_uv;

void main() {
  float x = -1.0 + float((gl_VertexID & 1) << 2);
  float y = -1.0 + float((gl_VertexID & 2) << 1);
  v_uv = vec2(x * 0.5 + 0.5, y * 0.5 + 0.5);
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`

/**
 * Clean Pass / Copy Fragment Shader
 * Directly copies input texture to target.
 */
export const COPY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_uv);
}
`

/**
 * Discrete Macroblock-Matching Motion Estimation Fragment Shader (SAD + Zero Bias + Momentum)
 * Operates on a coarse macroblock grid FBO with gl.NEAREST sampling.
 * Evaluates 3x3 patch patterns inside each macroblock cell and performs
 * discrete neighborhood search minimizing Sum of Absolute Differences (SAD).
 *
 * Output:
 *  - Red:   Normalized horizontal vector (0.5 = 0 motion)
 *  - Green: Normalized vertical vector (0.5 = 0 motion)
 *  - Blue:  Motion confidence (0.0 - 1.0)
 *  - Alpha: Block prediction residual error (0.0 - 1.0)
 */
export const MOTION_ESTIMATION_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_curr_frame;
uniform sampler2D u_prev_frame;
uniform sampler2D u_prev_motion;

uniform vec2 u_resolution;       // Motion FBO resolution (coarse grid)
uniform vec2 u_texel_size;       // 1.0 / u_resolution (macroblock UV dimension)
uniform float u_zero_motion_bias;// Cost penalty on non-zero displacements (noise gate)
uniform float u_vector_momentum; // Temporal vector momentum (P-frame bloom)
uniform float u_motion_threshold;// Noise floor threshold
uniform float u_audioTransient;  // Audio transient / kick onset uniform

out vec4 fragColor;

// Rec. 601 perceptual luminance
float getLuma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// Sample luminance at UV coordinate
float sampleLuma(sampler2D tex, vec2 uv) {
  vec2 coord = clamp(uv, vec2(0.001), vec2(0.999));
  return getLuma(texture(tex, coord).rgb);
}

void main() {
  // Step inside macroblock to evaluate a 3x3 structural pattern
  vec2 sub = u_texel_size * 0.3333;

  // 1. Patch Evaluation: Sample 3x3 structural pattern in current camera frame
  float c00 = sampleLuma(u_curr_frame, v_uv + vec2(-sub.x, -sub.y));
  float c10 = sampleLuma(u_curr_frame, v_uv + vec2(   0.0, -sub.y));
  float c20 = sampleLuma(u_curr_frame, v_uv + vec2( sub.x, -sub.y));
  float c01 = sampleLuma(u_curr_frame, v_uv + vec2(-sub.x,    0.0));
  float c11 = sampleLuma(u_curr_frame, v_uv);
  float c21 = sampleLuma(u_curr_frame, v_uv + vec2( sub.x,    0.0));
  float c02 = sampleLuma(u_curr_frame, v_uv + vec2(-sub.x,  sub.y));
  float c12 = sampleLuma(u_curr_frame, v_uv + vec2(   0.0,  sub.y));
  float c22 = sampleLuma(u_curr_frame, v_uv + vec2( sub.x,  sub.y));

  // 2. Zero-Displacement Evaluation: Sample previous frame at center
  float p00 = sampleLuma(u_prev_frame, v_uv + vec2(-sub.x, -sub.y));
  float p10 = sampleLuma(u_prev_frame, v_uv + vec2(   0.0, -sub.y));
  float p20 = sampleLuma(u_prev_frame, v_uv + vec2( sub.x, -sub.y));
  float p01 = sampleLuma(u_prev_frame, v_uv + vec2(-sub.x,    0.0));
  float p11 = sampleLuma(u_prev_frame, v_uv);
  float p21 = sampleLuma(u_prev_frame, v_uv + vec2( sub.x,    0.0));
  float p02 = sampleLuma(u_prev_frame, v_uv + vec2(-sub.x,  sub.y));
  float p12 = sampleLuma(u_prev_frame, v_uv + vec2(   0.0,  sub.y));
  float p22 = sampleLuma(u_prev_frame, v_uv + vec2( sub.x,  sub.y));

  float sadZero = abs(c00 - p00) + abs(c10 - p10) + abs(c20 - p20) +
                  abs(c01 - p01) + abs(c11 - p11) + abs(c21 - p21) +
                  abs(c02 - p02) + abs(c12 - p12) + abs(c22 - p22);

  // 3. Discrete Block-Matching Neighborhood Search (SAD)
  float effectiveZeroBias = u_zero_motion_bias;
  float effectiveThreshold = u_motion_threshold;
  if (u_audioTransient > 0.25) {
    float gateRelax = clamp((u_audioTransient - 0.25) * 1.25, 0.0, 0.85);
    effectiveZeroBias *= (1.0 - gateRelax);
    effectiveThreshold *= (1.0 - gateRelax);
  }

  float minSad = sadZero;
  vec2 bestOffset = vec2(0.0);
  float bestSadUnpenalized = sadZero;

  for (float dy = -3.0; dy <= 3.0; dy += 1.0) {
    for (float dx = -3.0; dx <= 3.0; dx += 1.0) {
      if (dx == 0.0 && dy == 0.0) continue;

      vec2 off = vec2(dx, dy) * u_texel_size;
      vec2 testUV = v_uv + off;

      float q00 = sampleLuma(u_prev_frame, testUV + vec2(-sub.x, -sub.y));
      float q10 = sampleLuma(u_prev_frame, testUV + vec2(   0.0, -sub.y));
      float q20 = sampleLuma(u_prev_frame, testUV + vec2( sub.x, -sub.y));
      float q01 = sampleLuma(u_prev_frame, testUV + vec2(-sub.x,    0.0));
      float q11 = sampleLuma(u_prev_frame, testUV);
      float q21 = sampleLuma(u_prev_frame, testUV + vec2( sub.x,    0.0));
      float q02 = sampleLuma(u_prev_frame, testUV + vec2(-sub.x,  sub.y));
      float q12 = sampleLuma(u_prev_frame, testUV + vec2(   0.0,  sub.y));
      float q22 = sampleLuma(u_prev_frame, testUV + vec2( sub.x,  sub.y));

      float sad = abs(c00 - q00) + abs(c10 - q10) + abs(c20 - q20) +
                  abs(c01 - q01) + abs(c11 - q11) + abs(c21 - q21) +
                  abs(c02 - q02) + abs(c12 - q12) + abs(c22 - q22);

      // Zero-Motion Bias (Noise Gate): Add cost penalty to non-zero displacements
      float penalty = effectiveZeroBias * (1.0 + length(vec2(dx, dy)) * 0.18);
      float totalCost = sad + penalty;

      if (totalCost < minSad) {
        minSad = totalCost;
        bestOffset = off;
        bestSadUnpenalized = sad;
      }
    }
  }

  // Noise gate: if improvement over zero-displacement is within sensor noise floor, lock to (0,0)
  if ((sadZero - bestSadUnpenalized) < effectiveThreshold) {
    bestOffset = vec2(0.0);
  }

  // Normalize displacement vector (-1.0 to 1.0) based on max search radius (3 blocks)
  const float MAX_BLOCK_SEARCH = 3.0;
  vec2 currVector = clamp((bestOffset / u_texel_size) / MAX_BLOCK_SEARCH, vec2(-1.0), vec2(1.0));
  float currMag = length(currVector);

  // Gradient calculation across the macroblock patch for beat-driven macroblock jolt
  float gradX = (c20 + 2.0 * c21 + c22) - (c00 + 2.0 * c01 + c02);
  float gradY = (c02 + 2.0 * c12 + c22) - (c00 + 2.0 * c10 + c20);
  vec2 blockGrad = vec2(gradX, gradY);

  if (u_audioTransient > 0.25) {
    float transientFactor = clamp((u_audioTransient - 0.25) / 0.75, 0.0, 1.0);
    if (length(blockGrad) > 0.015) {
      vec2 gradDir = normalize(blockGrad);
      // Quantize to 8 discrete macroblock angles (stair-stepped tearing)
      float angle = atan(gradDir.y, gradDir.x);
      float snappedAngle = floor(angle / 0.785398 + 0.5) * 0.785398;
      vec2 nudgeVec = vec2(cos(snappedAngle), sin(snappedAngle));
      currVector += nudgeVec * (0.38 * transientFactor);
    } else {
      vec2 gridPhase = sign(fract(v_uv * 8.0) - 0.5);
      currVector += gridPhase * (0.12 * transientFactor);
    }
    currVector = clamp(currVector, vec2(-1.0), vec2(1.0));
    currMag = length(currVector);
  }

  // 4. Temporal Vector Momentum (P-Frame Bloom)
  //    Uses strong momentum mix so vectors carry forward across frames as sweeping waves
  vec4 prevMotionSample = texture(u_prev_motion, v_uv);
  vec2 prevVector = (prevMotionSample.rg - 0.5) * 2.0;
  float prevMag = prevMotionSample.b;

  // 5. 9-Tap Spatial Neighborhood Averaging (3x3 macroblock neighborhood)
  //    Smooth the current vector by averaging with all 8 surrounding blocks
  //    so neighboring macroblocks align into cohesive ribbon flows
  vec2 nAvg = currVector;
  float nCount = 1.0;
  for (float ny = -1.0; ny <= 1.0; ny += 1.0) {
    for (float nx = -1.0; nx <= 1.0; nx += 1.0) {
      if (nx == 0.0 && ny == 0.0) continue;
      vec2 nUV = clamp(v_uv + vec2(nx, ny) * u_texel_size, vec2(0.001), vec2(0.999));
      vec4 nSample = texture(u_prev_motion, nUV);
      vec2 nVec = (nSample.rg - 0.5) * 2.0;
      // Weight center-adjacent blocks more, diagonals less
      float w = (abs(nx) + abs(ny) > 1.5) ? 0.5 : 1.0;
      nAvg += nVec * w;
      nCount += w;
    }
  }
  vec2 spatialSmoothed = nAvg / nCount;

  // Blend current detection with spatial consensus
  currVector = mix(currVector, spatialSmoothed, 0.45);

  vec2 finalVector = vec2(0.0);
  if (currMag > 0.04) {
    // Strong temporal momentum: mix(currentMotion, prevMotion, momentum)
    // This makes head turns / hand waves create sweeping directional waves
    finalVector = mix(currVector, prevVector, u_vector_momentum);
  } else if (prevMag > 0.05 && u_vector_momentum > 0.35) {
    finalVector = prevVector * (u_vector_momentum * 0.94);
  }

  finalVector = clamp(finalVector, vec2(-1.0), vec2(1.0));

  // If vector is negligible, lock strictly to zero for permanent stationary freeze
  float zeroFloor = (u_audioTransient > 0.25) ? 0.005 : 0.02;
  if (length(finalVector) < zeroFloor) {
    finalVector = vec2(0.0);
  }

  float motionConfidence = clamp(length(finalVector) * 1.5, 0.0, 1.0);
  float residualError = clamp(bestSadUnpenalized / 4.5, 0.0, 1.0);

  // 6. Output Encoding: (vector.x, vector.y, confidence, residual)
  fragColor = vec4(finalVector * 0.5 + 0.5, motionConfidence, residualError);
}
`

/**
 * Permanent Feedback Lock Datamosh & Saturated RGB Advection Fragment Shader
 *
 * Pure-RGB pipeline — no synthetic YCbCr chroma manipulation.
 * All pixel advection and blending uses original video colors with +50% saturation
 * boost applied only to incoming camera frames (never re-boosted on feedback).
 *
 *  1. Macroblock Grid Advection: Quantized motion vectors displace intact chunks
 *     of the previous feedback buffer as cohesive macroblock ribbons.
 *  2. Permanent Feedback Lock: Zero-motion regions stay permanently frozen.
 *  3. Feature Contrast Mask: High-contrast features (eyes, lips, dark edges)
 *     selectively punch through the melted canvas.
 *  4. Cohesive Ribbon Flow: 9-tap spatial smoothing + velocity snapping.
 *  5. +50% Saturation Boost: Incoming camera pixels are saturation-boosted 1.5x
 *     before any blending so smeared trails retain rich, vivid natural colors.
 */
export const DATAMOSH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_curr_frame;
uniform sampler2D u_prev_frame;
uniform sampler2D u_prev_feedback;
uniform sampler2D u_motion_texture; // Sampled with gl.NEAREST

uniform vec2 u_resolution;
uniform float u_macroblock_size;
uniform float u_displacement_scale;
uniform float u_feedback_retention;
uniform float u_decay;
uniform float u_residual_blend;
uniform float u_residual_intensity;
uniform float u_sub_partition_threshold;
uniform float u_intensity;
uniform float u_edge_breakthrough;
uniform float u_audioTransient;

out vec4 fragColor;

// Rec. 601 perceptual luminance
float getLuma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SATURATION BOOST: Luminance-preserving, applied only to incoming camera pixels
// ═══════════════════════════════════════════════════════════════════════════════

vec3 boostSaturation(vec3 rgb, float satFactor) {
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(luma), rgb, satFactor), 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPATIAL VECTOR SMOOTHING & COHESIVE RIBBON FLOW
// 9-tap neighborhood averaging + velocity snapping for thick macroblock ribbons
// ═══════════════════════════════════════════════════════════════════════════════

vec3 getSmoothedBlockMotion(sampler2D motionTex, vec2 blockUV, vec2 blockGrid) {
  vec2 mbStep = 1.0 / blockGrid;

  // 9-tap neighborhood: center + 8 surrounding blocks
  vec4 center = texture(motionTex, blockUV);
  vec4 up     = texture(motionTex, clamp(blockUV + vec2(0.0, mbStep.y), vec2(0.001), vec2(0.999)));
  vec4 down   = texture(motionTex, clamp(blockUV - vec2(0.0, mbStep.y), vec2(0.001), vec2(0.999)));
  vec4 right  = texture(motionTex, clamp(blockUV + vec2(mbStep.x, 0.0), vec2(0.001), vec2(0.999)));
  vec4 left   = texture(motionTex, clamp(blockUV - vec2(mbStep.x, 0.0), vec2(0.001), vec2(0.999)));
  vec4 upL    = texture(motionTex, clamp(blockUV + vec2(-mbStep.x, mbStep.y), vec2(0.001), vec2(0.999)));
  vec4 upR    = texture(motionTex, clamp(blockUV + vec2( mbStep.x, mbStep.y), vec2(0.001), vec2(0.999)));
  vec4 dnL    = texture(motionTex, clamp(blockUV + vec2(-mbStep.x,-mbStep.y), vec2(0.001), vec2(0.999)));
  vec4 dnR    = texture(motionTex, clamp(blockUV + vec2( mbStep.x,-mbStep.y), vec2(0.001), vec2(0.999)));

  // Decode motion vectors from [0,1] to [-1,1]
  vec2 vCenter = (center.rg - 0.5) * 2.0;
  vec2 vUp     = (up.rg - 0.5) * 2.0;
  vec2 vDown   = (down.rg - 0.5) * 2.0;
  vec2 vRight  = (right.rg - 0.5) * 2.0;
  vec2 vLeft   = (left.rg - 0.5) * 2.0;
  vec2 vUpL    = (upL.rg - 0.5) * 2.0;
  vec2 vUpR    = (upR.rg - 0.5) * 2.0;
  vec2 vDnL    = (dnL.rg - 0.5) * 2.0;
  vec2 vDnR    = (dnR.rg - 0.5) * 2.0;

  // Weighted 9-tap average: center 3x, cardinal 1.5x, diagonal 0.7x
  vec2 avgVec = vCenter * 3.0
              + (vUp + vDown + vRight + vLeft) * 1.5
              + (vUpL + vUpR + vDnL + vDnR) * 0.7;
  float totalW = 3.0 + 4.0 * 1.5 + 4.0 * 0.7;
  avgVec /= totalW;

  float avgConf = (center.b * 3.0
                + (up.b + down.b + right.b + left.b) * 1.5
                + (upL.b + upR.b + dnL.b + dnR.b) * 0.7) / totalW;

  // Lock noise floor strictly to zero
  if (length(avgVec) < 0.02) {
    return vec3(0.0, 0.0, 0.0);
  }

  // Snap to discrete velocity levels for stair-stepped macroblock edges
  const float VELOCITY_LEVELS = 12.0;
  vec2 snappedVec = floor(avgVec * VELOCITY_LEVELS + 0.5) / VELOCITY_LEVELS;

  return vec3(snappedVec, avgConf);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE CONTRAST MASK: Selective Edge Breakthrough
// High-contrast features (eyes, lips, nostrils, dark edges) punch through the melt;
// flat textures (skin, walls, hair mass) remain frozen/smeared at 0% camera injection.
// ═══════════════════════════════════════════════════════════════════════════════

float getEdgeContrast(sampler2D tex, vec2 uv, vec2 texelSize) {
  // Sample 4-neighbor luminance at +/- 2 texels for robust edge detection
  vec2 offset = texelSize * 2.0;
  float lumCenter = getLuma(texture(tex, uv).rgb);
  float lumRight  = getLuma(texture(tex, clamp(uv + vec2(offset.x, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumLeft   = getLuma(texture(tex, clamp(uv - vec2(offset.x, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumUp     = getLuma(texture(tex, clamp(uv + vec2(0.0, offset.y), vec2(0.001), vec2(0.999))).rgb);
  float lumDown   = getLuma(texture(tex, clamp(uv - vec2(0.0, offset.y), vec2(0.001), vec2(0.999))).rgb);

  // Max absolute difference across the 4 neighbors
  float maxDiff = max(
    max(abs(lumCenter - lumRight), abs(lumCenter - lumLeft)),
    max(abs(lumCenter - lumUp), abs(lumCenter - lumDown))
  );

  return maxDiff;
}

void main() {
  // If MOSH AMOUNT == 0, output 100% clean live camera feed (I-frame reset)
  if (u_intensity <= 0.0) {
    fragColor = texture(u_curr_frame, v_uv);
    return;
  }

  vec2 texelSize = 1.0 / u_resolution;

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. MACROBLOCK GRID & MOTION VECTOR LOOKUP
  // ═════════════════════════════════════════════════════════════════════════════

  vec2 blockGrid = max(vec2(4.0), u_resolution / u_macroblock_size);
  vec2 blockUV = (floor(v_uv * blockGrid) + 0.5) / blockGrid;

  // Sample spatially smoothed block motion (9-tap + velocity snapping)
  vec3 smoothedMotion = getSmoothedBlockMotion(u_motion_texture, blockUV, blockGrid);
  vec2 blockMotion = smoothedMotion.xy;
  float motionMag = length(blockMotion);
  float motionConfidence = smoothedMotion.z;

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. INTACT MACROBLOCK TEXTURE ADVECTION (Pure RGB)
  //    Displace continuous pixel UV by the quantized block motion vector.
  //    Each macroblock slides as an intact square tile of image texture.
  // ═════════════════════════════════════════════════════════════════════════════

  const float MAX_UV_TRAVEL = 0.22;
  vec2 uvDisplacement = blockMotion * (u_displacement_scale * MAX_UV_TRAVEL);

  // Transient beat-driven macroblock jolt when strong kick drum hits
  if (u_audioTransient > 0.25) {
    float tJolt = clamp((u_audioTransient - 0.25) / 0.75, 0.0, 1.0);
    vec2 blockFrac = sign(fract(blockUV * 6.0) - 0.5);
    uvDisplacement += blockFrac * (texelSize * u_macroblock_size * 0.40 * tJolt);
  }

  vec2 sourceUV = clamp(v_uv - uvDisplacement, vec2(0.001), vec2(0.999));

  // Sample historical pixels at displaced UV — pure RGB, no color space conversion
  vec3 displacedColor = texture(u_prev_feedback, sourceUV).rgb;

  // Boost saturation (+50% / 1.5x) strictly on the incoming camera frame
  vec3 currentCam = boostSaturation(texture(u_curr_frame, v_uv).rgb, 1.5);

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. PERMANENT PIXEL FREEZE (True I-Frame Starvation)
  //    When motion is below noise threshold and no kick transient hits,
  //    output previous feedback buffer. Smeared/melted pixels remain permanently frozen.
  // ═════════════════════════════════════════════════════════════════════════════

  if (motionMag < 0.001 && u_audioTransient <= 0.25) {
    // Even in frozen state, allow selective edge breakthrough
    float edgeContrast = getEdgeContrast(u_curr_frame, v_uv, texelSize);
    float breakthroughMask = smoothstep(u_sub_partition_threshold, u_sub_partition_threshold + 0.15, edgeContrast);
    float breakthroughBlend = breakthroughMask * u_edge_breakthrough * 0.5; // Gentle in frozen regions

    if (u_decay > 0.0 || u_residual_blend > 0.0) {
      // Healing mode (MOSH AMOUNT 1-24): gradually restore clean camera feed
      vec3 healed = mix(displacedColor, currentCam, u_residual_blend + breakthroughBlend);
      healed = max(vec3(0.0), healed - vec3(u_decay));
      fragColor = vec4(clamp(healed, 0.0, 1.0), 1.0);
    } else {
      // Permanent lock (MOSH AMOUNT 25-100): frozen pixels + subtle edge stamps
      vec3 frozen = mix(displacedColor, currentCam, breakthroughBlend);
      fragColor = vec4(clamp(frozen, 0.0, 1.0), 1.0);
    }
    return;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. ACTIVE MOTION: SELECTIVE EDGE BREAKTHROUGH & PURE RGB ADVECTION
  //    Moving objects act as a brush pushing frozen pixels using strictly original RGB colors.
  //    High-contrast features punch through; flat regions melt into pure smeared trails.
  // ═════════════════════════════════════════════════════════════════════════════

  float edgeContrast = getEdgeContrast(u_curr_frame, v_uv, texelSize);

  // Smooth threshold: features above u_sub_partition_threshold get breakthrough
  float breakthroughMask = smoothstep(u_sub_partition_threshold, u_sub_partition_threshold + 0.12, edgeContrast);

  // Scale breakthrough by edge_breakthrough parameter and motion
  // More motion = slightly less breakthrough to maintain smear coherence
  float motionDampen = clamp(1.0 - motionMag * 0.5, 0.4, 1.0);
  float newCamLeak = breakthroughMask * u_edge_breakthrough * motionDampen;

  // Flat regions: near-zero camera leak so they melt into smooth trails
  // High-contrast: controlled 0.08-0.22 range for feature ghosting
  newCamLeak = clamp(newCamLeak, 0.0, 0.22);

  // Minimal baseline leak for non-feature motion (invisible brush pushing frozen pixels)
  float baseLeak = clamp(motionMag * 0.04, 0.0, 0.06) * (1.0 - breakthroughMask);
  newCamLeak += baseLeak;

  // Blend strictly original advected RGB colors with +50% saturation boosted incoming camera frame
  vec3 finalColor = mix(displacedColor, currentCam, newCamLeak);

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. MACROBLOCK TILE BOUNDARY EMPHASIS
  //    Subtle rectangular tile edges at medium-to-high intensity
  // ═════════════════════════════════════════════════════════════════════════════

  if (u_intensity > 0.30) {
    vec2 blockFrac = abs(fract(v_uv * blockGrid) - 0.5) * 2.0;
    float edgeFactor = step(0.94, max(blockFrac.x, blockFrac.y));
    finalColor = mix(finalColor, finalColor * 0.88, edgeFactor * motionConfidence * 0.6);
  }

  fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`

/**
 * Display Fragment Shader
 * Renders the processed result to the canvas default framebuffer
 * with GPU object-fit: cover behavior preserving camera aspect ratio.
 */
export const DISPLAY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_texture;
uniform float u_canvas_aspect;
uniform float u_video_aspect;
uniform float u_flip_y;
uniform float u_flip_x;

out vec4 fragColor;

void main() {
  vec2 scale = vec2(1.0);
  vec2 offset = vec2(0.0);

  if (u_canvas_aspect > u_video_aspect) {
    // Canvas is wider than camera: crop top & bottom
    scale.y = u_video_aspect / u_canvas_aspect;
    offset.y = (1.0 - scale.y) * 0.5;
  } else {
    // Canvas is taller than camera: crop left & right
    scale.x = u_canvas_aspect / u_video_aspect;
    offset.x = (1.0 - scale.x) * 0.5;
  }

  vec2 uv = v_uv;
  if (u_flip_x > 0.5) {
    uv.x = 1.0 - uv.x;
  }
  if (u_flip_y > 0.5) {
    uv.y = 1.0 - uv.y;
  }

  vec2 coveredUV = uv * scale + offset;
  fragColor = texture(u_texture, coveredUV);
}
`
