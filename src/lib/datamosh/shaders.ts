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
uniform float u_audioBass;       // Audio bass energy (multiplies organic smear momentum)
uniform float u_audioMid;        // Audio mid energy
uniform float u_audioHigh;       // Audio high energy
uniform float u_momentum_decay;  // Velocity friction decay factor across frames (0.90 - 0.97)
uniform float u_advection_step;  // UV advection step factor for self-advecting motion field
uniform float u_moshHandActive;  // 1.0 = open right hand (actively moshing), 0.0 = no hand or closed fist (locked)
uniform vec2 u_moshHandPos;      // Palm UV position (0.0 - 1.0)
uniform vec2 u_moshHandVel;      // Hand velocity vector in UV space
uniform float u_moshHandRadius;  // Brush radius in UV space

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
  // 1. Center sample in current frame
  float cCenter = sampleLuma(u_curr_frame, v_uv);

  // 2. Zero-Displacement Evaluation: Sample previous frame at center
  float pCenter = sampleLuma(u_prev_frame, v_uv);
  float sadZero = abs(cCenter - pCenter);

  // 3. Fast 9-Point Cross / Diamond Search (Center + 4 Inner Cardinal + 4 Outer Cardinal/Diagonal)
  float effectiveZeroBias = u_zero_motion_bias;
  float effectiveThreshold = u_motion_threshold;

  float minSad = sadZero;
  vec2 bestOffset = vec2(0.0);
  float bestSadUnpenalized = sadZero;

  const vec2 SEARCH_OFFSETS[9] = vec2[9](
    vec2( 0.0,  0.0),
    vec2( 1.0,  0.0),
    vec2(-1.0,  0.0),
    vec2( 0.0,  1.0),
    vec2( 0.0, -1.0),
    vec2( 2.0,  0.0),
    vec2(-2.0,  0.0),
    vec2( 0.0,  2.0),
    vec2( 0.0, -2.0)
  );

  for (int i = 1; i < 9; i++) {
    vec2 off = SEARCH_OFFSETS[i] * u_texel_size;
    float pSample = sampleLuma(u_prev_frame, v_uv + off);
    float sad = abs(cCenter - pSample);

    float penalty = effectiveZeroBias * (1.0 + length(SEARCH_OFFSETS[i]) * 0.20);
    float totalCost = sad + penalty;

    if (totalCost < minSad) {
      minSad = totalCost;
      bestOffset = off;
      bestSadUnpenalized = sad;
    }
  }

  // Strict Noise Gate: if improvement over zero-displacement is within sensor noise floor, lock to (0,0)
  if ((sadZero - bestSadUnpenalized) < effectiveThreshold) {
    bestOffset = vec2(0.0);
  }

  // Normalize displacement vector (-1.0 to 1.0) based on max search radius (2 blocks)
  const float MAX_BLOCK_SEARCH = 2.0;
  vec2 currVector = clamp((bestOffset / u_texel_size) / MAX_BLOCK_SEARCH, vec2(-1.0), vec2(1.0));

  // Hand-Gated Motion & Kinetic Velocity Injection:
  // When no mosh hand is open (u_moshHandActive < 0.05), camera sensor grain is gated to 0.0!
  if (u_moshHandActive < 0.05) {
    currVector = vec2(0.0);
  } else {
    // Open right hand acts as an active datamosh & particle brush
    float handDist = length(v_uv - u_moshHandPos);
    float handInfluence = smoothstep(u_moshHandRadius, u_moshHandRadius * 0.25, handDist);
    // Gate optical flow to the brush area and inject hand kinetic velocity
    currVector = currVector * handInfluence + u_moshHandVel * 3.5 * handInfluence;
  }
  float currMag = length(currVector);

  // 4. Self-Advecting Temporal Motion Field (Travelling Momentum Wave)
  // Sample local previous motion at current cell
  vec4 localPrevSample = texture(u_prev_motion, v_uv);
  vec2 localPrevVec = (localPrevSample.rg - 0.5) * 2.0;

  // Look back along the velocity vector to carry motion forward across frames
  vec2 advectOffset = localPrevVec * u_texel_size * u_advection_step;
  vec2 advectUV = clamp(v_uv - advectOffset, vec2(0.001), vec2(0.999));
  vec4 advectedSample = texture(u_prev_motion, advectUV);
  vec2 advectedVec = (advectedSample.rg - 0.5) * 2.0;

  // 5. 9-Tap Spatial Neighborhood Sweep:
  // Propagate momentum outward into stationary regions (like the background wall)
  vec2 nAvg = currVector;
  float nCount = 1.0;
  vec2 incomingMomentum = vec2(0.0);
  float maxIncomingMag = 0.0;

  for (float ny = -1.0; ny <= 1.0; ny += 1.0) {
    for (float nx = -1.0; nx <= 1.0; nx += 1.0) {
      if (nx == 0.0 && ny == 0.0) continue;
      vec2 offsetUV = vec2(nx, ny) * u_texel_size;
      vec2 nUV = clamp(v_uv + offsetUV, vec2(0.001), vec2(0.999));
      vec4 nSample = texture(u_prev_motion, nUV);
      vec2 nVec = (nSample.rg - 0.5) * 2.0;
      float nMag = length(nVec);

      float w = (abs(nx) + abs(ny) > 1.5) ? 0.5 : 1.0;
      nAvg += nVec * w;
      nCount += w;

      if (nMag > 0.04) {
        vec2 dirToCenter = -normalize(vec2(nx, ny));
        float alignment = dot(normalize(nVec), dirToCenter);
        if (alignment > 0.15) {
          float incomingStr = nMag * alignment;
          if (incomingStr > maxIncomingMag) {
            maxIncomingMag = incomingStr;
            incomingMomentum = nVec;
          }
        }
      }
    }
  }

  vec2 spatialSmoothed = nAvg / nCount;
  currVector = mix(currVector, spatialSmoothed, 0.45);

  // Strongest carried momentum (advected along vector or propagating from adjacent neighbor)
  vec2 carriedMomentum = advectedVec;
  if (maxIncomingMag > length(carriedMomentum)) {
    carriedMomentum = incomingMomentum;
  }
  float carriedMag = length(carriedMomentum);

  vec2 finalVector = vec2(0.0);
  if (u_moshHandActive < 0.05) {
    // Fist closed or no hand detected: instant freeze/lock of all vectors
    finalVector = vec2(0.0);
  } else if (currMag > 0.04) {
    // Active motion detected: mix with carried momentum wave
    finalVector = mix(currVector, carriedMomentum, u_vector_momentum);
  } else if (carriedMag > 0.03 && u_momentum_decay > 0.5) {
    // Audio Bass increases temporal momentum retention on EXISTING motion vectors up to 0.97
    float effectiveDecay = min(0.975, u_momentum_decay + u_audioBass * 0.03);
    finalVector = carriedMomentum * effectiveDecay;
  }

  finalVector = clamp(finalVector, vec2(-1.0), vec2(1.0));

  // Strict zero floor: stationary regions stay strictly zero (0.0 * audio = 0.0)
  const float zeroFloor = 0.012;
  if (length(finalVector) < zeroFloor) {
    finalVector = vec2(0.0);
  }

  float motionConfidence = clamp(length(finalVector) * 1.5, 0.0, 1.0);
  float residualError = clamp(bestSadUnpenalized / 4.5, 0.0, 1.0);

  // 6. Output Encoding: (vector.x, vector.y, confidence, residual)
  // Biased to 0.5 so both negative and positive velocities are preserved in unsigned textures
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
 *  1. Two-Tier Grid: Primary Macroblocks (16px–28px) & Micro-Particles (4px–10px)
 *  2. Micro-Particle Scatter & Ejection: 0.6x to 2.8x speed variation + +/-18° angular spread
 *  3. Amplified UV Displacement Scale: Flings pixel blocks 50 to 200+ pixels across screen
 *  4. Permanent Feedback Lock: Zero-motion regions stay 100% frozen (0.0 live camera healing)
 *  5. Audio Kick Particle Burst: Transient onset scatters particles outward from active edges
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
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_moshHandActive;
uniform vec2 u_moshHandPos;
uniform vec2 u_moshHandVel;
uniform float u_moshHandRadius;

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

// ═══════════════════════════════════════════════════════════════════════════════
// FAST SINGLE-TAP MACROBLOCK MOTION LOOKUP
// Relies on the low-res spatial smoothing already performed in the Motion FBO pass
// ═══════════════════════════════════════════════════════════════════════════════

vec3 getSingleTapBlockMotion(sampler2D motionTex, vec2 blockUV) {
  vec4 center = texture(motionTex, blockUV);
  vec2 vCenter = (center.rg - 0.5) * 2.0;

  if (length(vCenter) < 0.02) {
    return vec3(0.0);
  }

  const float VELOCITY_LEVELS = 12.0;
  vec2 snappedVec = floor(vCenter * VELOCITY_LEVELS + 0.5) / VELOCITY_LEVELS;
  return vec3(snappedVec, center.b);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE CONTRAST MASK: Selective Edge Breakthrough
// High-contrast features (eyes, lips, nostrils, dark edges) punch through the melt
// ═══════════════════════════════════════════════════════════════════════════════

float getEdgeContrast(sampler2D tex, vec2 uv, vec2 texelSize) {
  vec2 offset = texelSize * 2.0;
  float lumCenter = getLuma(texture(tex, uv).rgb);
  float lumRight  = getLuma(texture(tex, clamp(uv + vec2(offset.x, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumLeft   = getLuma(texture(tex, clamp(uv - vec2(offset.x, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumUp     = getLuma(texture(tex, clamp(uv + vec2(0.0, offset.y), vec2(0.001), vec2(0.999))).rgb);
  float lumDown   = getLuma(texture(tex, clamp(uv - vec2(0.0, offset.y), vec2(0.001), vec2(0.999))).rgb);

  float maxDiff = max(
    max(abs(lumCenter - lumRight), abs(lumCenter - lumLeft)),
    max(abs(lumCenter - lumUp), abs(lumCenter - lumDown))
  );

  return maxDiff;
}

void main() {
  // 1. Live camera frame at current UV (with 1.5x saturation boost)
  vec3 liveCamRGB = boostSaturation(texture(u_curr_frame, v_uv).rgb, 1.5);

  // If MOSH AMOUNT == 0, output 100% clean live camera feed (I-frame reset)
  if (u_intensity <= 0.0) {
    fragColor = vec4(liveCamRGB, 0.0);
    return;
  }

  vec2 texelSize = 1.0 / u_resolution;

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. ORGANIC MACROBLOCK WARPING & DUAL-SCALE SAMPLING
  // ═════════════════════════════════════════════════════════════════════════════

  // Low-frequency motion field lookup at continuous UV
  vec4 rawMotion = texture(u_motion_texture, v_uv);
  vec2 blurredMotion = (rawMotion.rg - 0.5) * 2.0;

  // Warp sampling coordinates organically along moving subject contours
  vec2 warpedUV = clamp(v_uv + blurredMotion * 0.15, vec2(0.001), vec2(0.999));

  // Scale 1: Primary Macroblocks (16px–24px)
  vec2 grid1 = max(vec2(4.0), u_resolution / u_macroblock_size);
  vec2 blockUV1 = (floor(warpedUV * grid1) + 0.5) / grid1;
  vec3 motion1 = getSingleTapBlockMotion(u_motion_texture, blockUV1);

  // Scale 2: Secondary Macroblocks (10px–14px)
  float scale2Size = max(8.0, floor(u_macroblock_size * 0.60));
  vec2 grid2 = max(vec2(4.0), u_resolution / scale2Size);
  vec2 blockUV2 = (floor(warpedUV * grid2) + 0.5) / grid2;
  vec3 motion2 = getSingleTapBlockMotion(u_motion_texture, blockUV2);

  // Local luminance contrast determines blending between primary and secondary macroblocks
  float edgeContrast = getEdgeContrast(u_curr_frame, v_uv, texelSize);
  float contrastBlend = smoothstep(0.06, 0.24, edgeContrast);

  vec2 organicMotionVector = mix(motion1.xy, motion2.xy, contrastBlend);
  float motionMag = length(organicMotionVector);

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. PER-BLOCK MICRO-PARTICLE SCATTER (Strictly On Active Motion)
  // ═════════════════════════════════════════════════════════════════════════════

  vec2 effectiveMotion = organicMotionVector;
  float handDist = length(warpedUV - u_moshHandPos);
  float brushRadius = max(0.28, u_moshHandRadius);
  float nearHand = smoothstep(brushRadius, 0.0, handDist) * u_moshHandActive;

  if (motionMag > 0.001) {
    float microSize = clamp(floor(scale2Size * 0.5), 4.0, 8.0);
    vec2 microGrid = max(vec2(8.0), u_resolution / microSize);
    vec2 microCellId = floor(warpedUV * microGrid);

    float cellHash = fract(sin(dot(microCellId, vec2(12.9898, 78.233))) * 43758.5453);
    float cellHash2 = fract(sin(dot(microCellId + vec2(23.7, 71.9), vec2(26.419, 54.341))) * 28614.7319);

    float speedMultiplier = mix(0.7, 2.2, cellHash);
    float angleSpread = (cellHash2 - 0.5) * 2.0 * 0.314159; // +/- 18 deg
    float cosA = cos(angleSpread);
    float sinA = sin(angleSpread);
    vec2 spreadMotion = vec2(
      organicMotionVector.x * cosA - organicMotionVector.y * sinA,
      organicMotionVector.x * sinA + organicMotionVector.y * cosA
    );

    float ejectChance = smoothstep(0.06, 0.30, motionMag) * 0.65 + smoothstep(0.05, 0.25, edgeContrast) * 0.35 + nearHand * 0.25;
    if (cellHash > (1.0 - clamp(ejectChance, 0.15, 0.85))) {
      effectiveMotion = spreadMotion * speedMultiplier;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. MULTIPLICATIVE AUDIO GAIN (0.0 * Audio = 0.0)
  // ═════════════════════════════════════════════════════════════════════════════

  float audioGain = 1.0 + (u_audioBass * 2.0) + (u_audioTransient * 3.0);
  vec2 totalDisplacement = effectiveMotion * (u_displacement_scale * 1.5 * audioGain);

  // Advect coordinates backward along motion vector
  vec2 displacedUV = clamp(v_uv - totalDisplacement, vec2(0.001), vec2(0.999));
  vec4 smearedData = texture(u_prev_feedback, displacedUV);

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. MOSH CONTAMINATION MASK & LOCALIZED HAND BRUSH (Alpha Channel)
  //    smearedData.a stores whether a pixel has been displaced/contaminated.
  //    Uncontaminated pixels (alpha < 0.01) ALWAYS stream live webcam at 60 FPS!
  // ═════════════════════════════════════════════════════════════════════════════

  float brushDist = length(v_uv - u_moshHandPos);
  float brushInfluence = smoothstep(brushRadius, brushRadius * 0.25, brushDist);
  float activeHandSweep = brushInfluence * step(0.1, u_moshHandActive) * smoothstep(0.005, 0.06, motionMag + length(u_moshHandVel));

  float newAlpha = 0.0;
  if (activeHandSweep > 0.05) {
    // Ripping fresh blocks from live camera into the mosh stream
    newAlpha = max(smearedData.a, activeHandSweep);
  } else if (u_moshHandActive < 0.1) {
    // Fist closed: LOCK existing sculpted mosh artifacts permanently!
    newAlpha = smearedData.a;
  } else {
    // Hand active elsewhere: carry existing trails forward with slight decay
    newAlpha = smearedData.a * 0.994;
  }

  // If no contamination has touched this pixel or its advection source, output LIVE CAMERA!
  if (newAlpha < 0.01) {
    fragColor = vec4(liveCamRGB, 0.0);
    return;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. CONTAMINATED MOSH COMPOSITING OVER LIVE CAMERA
  // ═════════════════════════════════════════════════════════════════════════════

  vec3 displacedColor = smearedData.rgb;

  // On active motion, mid/highs modulate edge cross-contamination
  if (motionMag > 0.001 && (u_audioMid > 0.1 || u_audioHigh > 0.1)) {
    vec2 perpDir = vec2(-effectiveMotion.y, effectiveMotion.x);
    if (length(perpDir) > 0.0001) {
      vec2 perpOffset = normalize(perpDir) * texelSize * (u_audioMid * 4.0 + u_audioHigh * 6.0);
      vec3 smearBlend = texture(u_prev_feedback, clamp(displacedUV + perpOffset, vec2(0.001), vec2(0.999))).rgb;
      float contamAmount = clamp(u_audioMid * 0.45 + u_audioHigh * 0.55, 0.0, 0.75);
      displacedColor = mix(displacedColor, smearBlend, contamAmount);
    }
  }

  // If this pixel was just newly contaminated by the brush (advected alpha was near 0),
  // initialize it from the live camera so it rips fresh pixels cleanly
  if (smearedData.a < 0.08) {
    displacedColor = liveCamRGB;
  } else {
    // Edge breakthrough on fast moving edges
    float breakthroughMask = smoothstep(u_sub_partition_threshold, u_sub_partition_threshold + 0.12, edgeContrast);
    float camLeak = breakthroughMask * u_edge_breakthrough * 0.18;
    displacedColor = mix(displacedColor, liveCamRGB, camLeak);
  }

  // Composite the moshed pixels over the live camera using newAlpha
  float blendFactor = clamp(newAlpha, 0.0, 1.0);
  vec3 finalRGB = mix(liveCamRGB, displacedColor, blendFactor);
  fragColor = vec4(clamp(finalRGB, 0.0, 1.0), blendFactor);
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
  vec4 texSample = texture(u_texture, coveredUV);
  fragColor = vec4(texSample.rgb, 1.0);
}
`
