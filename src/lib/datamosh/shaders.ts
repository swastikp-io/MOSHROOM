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
      float penalty = u_zero_motion_bias * (1.0 + length(vec2(dx, dy)) * 0.18);
      float totalCost = sad + penalty;

      if (totalCost < minSad) {
        minSad = totalCost;
        bestOffset = off;
        bestSadUnpenalized = sad;
      }
    }
  }

  // Noise gate: if improvement over zero-displacement is within sensor noise floor, lock to (0,0)
  if ((sadZero - bestSadUnpenalized) < u_motion_threshold) {
    bestOffset = vec2(0.0);
  }

  // Normalize displacement vector (-1.0 to 1.0) based on max search radius (3 blocks)
  const float MAX_BLOCK_SEARCH = 3.0;
  vec2 currVector = clamp((bestOffset / u_texel_size) / MAX_BLOCK_SEARCH, vec2(-1.0), vec2(1.0));
  float currMag = length(currVector);

  // 4. Temporal Vector Momentum (P-Frame Bloom)
  vec4 prevMotionSample = texture(u_prev_motion, v_uv);
  vec2 prevVector = (prevMotionSample.rg - 0.5) * 2.0;
  float prevMag = prevMotionSample.b;

  vec2 finalVector = vec2(0.0);
  if (currMag > 0.04) {
    finalVector = mix(currVector, prevVector, u_vector_momentum);
  } else if (prevMag > 0.05 && u_vector_momentum > 0.35) {
    finalVector = prevVector * (u_vector_momentum * 0.94);
  }

  finalVector = clamp(finalVector, vec2(-1.0), vec2(1.0));
  float motionConfidence = clamp(length(finalVector) * 1.5, 0.0, 1.0);
  float residualError = clamp(bestSadUnpenalized / 4.5, 0.0, 1.0);

  // 5. Output Encoding: (vector.x, vector.y, confidence, residual)
  fragColor = vec4(finalVector * 0.5 + 0.5, motionConfidence, residualError);
}
`

/**
 * Discrete Macroblock Datamosh & P-Frame Displacement Fragment Shader
 * Operates with:
 *  1. Spatial 5-tap neighbor vector smoothing + snapping to prevent confetti shattering.
 *  2. Continuous pixel UV advection using uniform block vectors for coherent video tiles.
 *  3. Calmed sub-block splitting restricted only to extreme contrast edges.
 *  4. P-frame high-frequency compressed residual injection.
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
uniform float u_chroma_offset;

out vec4 fragColor;

// Rec. 601 perceptual luminance
float getLuma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// RGB to YCbCr conversion
vec3 rgb2ycbcr(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = dot(c, vec3(-0.168736, -0.331264, 0.5));
  float cr = dot(c, vec3(0.5, -0.418688, -0.081312));
  return vec3(y, cb, cr);
}

// YCbCr to RGB conversion
vec3 ycbcr2rgb(vec3 ycbcr) {
  float r = ycbcr.x + 1.402 * ycbcr.z;
  float g = ycbcr.x - 0.344136 * ycbcr.y - 0.714136 * ycbcr.z;
  float b = ycbcr.x + 1.772 * ycbcr.y;
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

// Spatial Vector Smoothing before Quantization:
// Averages the current macroblock's vector with its 4 immediate neighbors (up, down, left, right)
// and snaps/floors it so large groups of blocks travel together in cohesive ribbons instead of confetti.
vec3 getSmoothedBlockMotion(sampler2D motionTex, vec2 blockUV, vec2 blockGrid) {
  vec2 mbStep = 1.0 / blockGrid;

  vec4 center = texture(motionTex, blockUV);
  vec4 up     = texture(motionTex, clamp(blockUV + vec2(0.0, mbStep.y), vec2(0.001), vec2(0.999)));
  vec4 down   = texture(motionTex, clamp(blockUV - vec2(0.0, mbStep.y), vec2(0.001), vec2(0.999)));
  vec4 right  = texture(motionTex, clamp(blockUV + vec2(mbStep.x, 0.0), vec2(0.001), vec2(0.999)));
  vec4 left   = texture(motionTex, clamp(blockUV - vec2(mbStep.x, 0.0), vec2(0.001), vec2(0.999)));

  vec2 vCenter = (center.rg - 0.5) * 2.0;
  vec2 vUp     = (up.rg - 0.5) * 2.0;
  vec2 vDown   = (down.rg - 0.5) * 2.0;
  vec2 vRight  = (right.rg - 0.5) * 2.0;
  vec2 vLeft   = (left.rg - 0.5) * 2.0;

  // 5-tap neighbor average
  vec2 avgVec = (vCenter * 2.0 + vUp + vDown + vRight + vLeft) / 6.0;
  float avgConf = (center.b * 2.0 + up.b + down.b + right.b + left.b) / 6.0;

  // Snap/floor the motion vector to discrete macroblock velocity levels
  // This locks adjacent blocks with similar motion to the exact same discrete velocity
  const float VELOCITY_LEVELS = 14.0;
  vec2 snappedVec = floor(avgVec * VELOCITY_LEVELS + 0.5) / VELOCITY_LEVELS;

  return vec3(snappedVec, avgConf);
}

void main() {
  if (u_intensity <= 0.0) {
    fragColor = texture(u_curr_frame, v_uv);
    return;
  }

  // 1. Base Macroblock Grid (kept strictly large, e.g. 16x16 / 20x20 for 80%+ of motion)
  float mbSize = u_macroblock_size;
  vec2 blockGrid = max(vec2(4.0), u_resolution / mbSize);
  vec2 blockUV = (floor(v_uv * blockGrid) + 0.5) / blockGrid;

  vec3 smoothedMotion = getSmoothedBlockMotion(u_motion_texture, blockUV, blockGrid);
  float motionConfidence = smoothedMotion.z;

  // 2. Calmed Down Sub-Block Splitting:
  // Only split into smaller blocks on extreme contrast edges (>0.30) with very high motion (>0.70)
  vec3 currentCam = texture(u_curr_frame, v_uv).rgb;
  float lumaCenter = getLuma(currentCam);
  float lumaRight  = getLuma(texture(u_curr_frame, v_uv + vec2(2.0 / u_resolution.x, 0.0)).rgb);
  float lumaUp     = getLuma(texture(u_curr_frame, v_uv + vec2(0.0, 2.0 / u_resolution.y)).rgb);
  float edgeContrast = length(vec2(lumaRight - lumaCenter, lumaUp - lumaCenter));

  if (edgeContrast > 0.30 && motionConfidence > u_sub_partition_threshold && u_intensity > 0.50) {
    mbSize *= 0.5;
    blockGrid = max(vec2(4.0), u_resolution / mbSize);
    blockUV = (floor(v_uv * blockGrid) + 0.5) / blockGrid;
    smoothedMotion = getSmoothedBlockMotion(u_motion_texture, blockUV, blockGrid);
  }

  vec2 motion = smoothedMotion.xy;

  // 3. Advect UVs Smoothly, Quantize the Lookup:
  // Calculate sourceUV using the pixel's continuous UV offset by the block's uniform motion vector.
  // The whole block slides together as a coherent chunk of image, without turning into solid-color pixel art.
  const float MAX_UV_TRAVEL = 0.22;
  vec2 uvDisplacement = motion * (u_displacement_scale * MAX_UV_TRAVEL);
  vec2 sourceUV = clamp(v_uv - uvDisplacement, vec2(0.001), vec2(0.999));

  // 4. Chroma Subsampling Displacement (4:2:0 codec motion displacement)
  vec2 chromaGrid = max(vec2(2.0), blockGrid * 0.5);
  vec2 chromaBlockUV = (floor(v_uv * chromaGrid) + 0.5) / chromaGrid;
  vec3 chromaMotionData = getSmoothedBlockMotion(u_motion_texture, chromaBlockUV, chromaGrid);
  vec2 chromaMotion = chromaMotionData.xy;

  vec2 chromaDisplacement = chromaMotion * (u_displacement_scale * (1.0 + u_chroma_offset * 0.4) * MAX_UV_TRAVEL);
  vec2 sourceChromaUV = clamp(v_uv - chromaDisplacement, vec2(0.001), vec2(0.999));

  // Sample historical pixels at smoothly advected UV coordinates
  vec3 prevLumaRGB = texture(u_prev_feedback, sourceUV).rgb;
  vec3 prevChromaRGB = texture(u_prev_feedback, sourceChromaUV).rgb;

  // Reconstruct in YCbCr color space
  vec3 ycbcrLuma = rgb2ycbcr(prevLumaRGB);
  vec3 ycbcrChroma = rgb2ycbcr(prevChromaRGB);
  vec3 prevMosh = ycbcr2rgb(vec3(ycbcrLuma.x, ycbcrChroma.yz));

  // 5. Authentic P-Frame High-Frequency Residual Injection
  vec3 prevCam = texture(u_prev_frame, v_uv).rgb;
  vec3 rawResidual = currentCam - prevCam;
  vec3 quantizedResidual = floor(rawResidual * 8.0 + 0.5) / 8.0;
  float residualWeight = smoothstep(0.08, 0.35, motionConfidence) * u_residual_intensity;
  prevMosh = clamp(prevMosh + quantizedResidual * residualWeight, 0.0, 1.0);

  // 6. Persistence & Decay Blending
  float motionActivity = smoothstep(0.04, 0.28, motionConfidence * (1.0 + u_intensity * 2.5));
  float retention = mix(u_feedback_retention * 0.45, u_feedback_retention, motionActivity);

  // Stationary area decay to prevent permanent freeze
  float stationaryDecay = u_decay * (1.0 - motionActivity * 0.9);
  vec3 decayedMosh = max(vec3(0.0), prevMosh - vec3(stationaryDecay));

  // Residual blend of live camera feed
  float liveBlend = mix(u_residual_blend, u_residual_blend * 0.12, motionActivity * u_intensity);
  vec3 blended = mix(currentCam, decayedMosh, retention);
  vec3 finalColor = mix(blended, currentCam, liveBlend);

  // 7. Hard Macroblock Seam Boundaries
  if (u_intensity > 0.35) {
    vec2 blockFrac = abs(fract(v_uv * blockGrid) - 0.5) * 2.0;
    float edgeFactor = step(0.96, max(blockFrac.x, blockFrac.y));
    float seamDarkening = edgeFactor * motionActivity * (u_intensity - 0.35) * 0.18;
    finalColor = mix(finalColor, finalColor * (1.0 - seamDarkening), edgeFactor);
  }

  // Safety clamp
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
