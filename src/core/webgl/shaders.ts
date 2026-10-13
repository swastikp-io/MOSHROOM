/**
 * GLSL ES 3.00 Multi-Pass Shaders for MOSHROOM Real-Time Datamosh Engine
 * Every control is connected to real shader uniforms with deterministic
 * and smoothly animated parameters.
 */

export const commonVertexShader = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

uniform bool u_flipY;
uniform bool u_mirror;

out vec2 v_uv;

void main() {
  vec2 uv = a_texCoord;
  if (u_mirror) {
    uv.x = 1.0 - uv.x;
  }
  if (u_flipY) {
    uv.y = 1.0 - uv.y;
  }
  v_uv = uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Pass 1: Motion vector extraction and gradient estimation.
 */
export const motionVectorFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_currentFrame;
uniform sampler2D u_previousFrame;
uniform vec2 u_resolution;
uniform float u_blockSize;
uniform float u_motionSensitivity;   // 0 to 100
uniform float u_smearDirectionality;  // 0.0 to 1.0
uniform float u_masterIntensity;      // 0 to 100
uniform float u_time;
uniform float u_randomSeed;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 texel = 1.0 / u_resolution;

  // Macroblock coordinate quantization
  vec2 blockUV = v_uv;
  if (u_blockSize > 1.0) {
    vec2 blocks = u_resolution / u_blockSize;
    blockUV = (floor(v_uv * blocks) + 0.5) / blocks;
  }

  // Sample current and previous frames at block center
  vec3 currC = texture(u_currentFrame, blockUV).rgb;
  vec3 prevC = texture(u_previousFrame, blockUV).rgb;

  float currL = luma(currC);
  float prevL = luma(prevC);
  float deltaL = currL - prevL;

  // 4-point spatial gradient around block
  vec2 step = texel * max(1.0, u_blockSize * 0.5);
  float gx = luma(texture(u_currentFrame, blockUV + vec2(step.x, 0.0)).rgb) -
             luma(texture(u_currentFrame, blockUV - vec2(step.x, 0.0)).rgb);
  float gy = luma(texture(u_currentFrame, blockUV + vec2(0.0, step.y)).rgb) -
             luma(texture(u_currentFrame, blockUV - vec2(0.0, step.y)).rgb);

  vec2 grad = vec2(gx, gy);
  float gradSq = dot(grad, grad) + 0.0001;

  // 1. Optical Flow formulation
  vec2 opticalFlow = -(deltaL / gradSq) * grad;

  // 2. Directional momentum / spatial edge tangent direction
  vec2 edgeTangent = vec2(-gy, gx) * sign(deltaL);

  // Blend between optical flow and tangent momentum
  vec2 flow = mix(opticalFlow, edgeTangent * 0.05, clamp(u_smearDirectionality, 0.0, 1.0));

  // Inversely map motion sensitivity (0 to 100): 100 = highly sensitive (low threshold)
  float threshold = mix(0.15, 0.005, clamp(u_motionSensitivity / 100.0, 0.0, 1.0));

  float speed = length(flow);
  float motionMask = 1.0;
  if (abs(deltaL) < threshold || speed < 0.001) {
    flow = vec2(0.0);
    speed = 0.0;
    motionMask = 0.0;
  } else {
    flow = clamp(flow, vec2(-0.14), vec2(0.14)) * (u_masterIntensity / 100.0);
    motionMask = clamp(speed * 12.0, 0.0, 1.0);
  }

  // RG = encoded velocity vector, B = speed, A = motion mask
  vec2 encodedFlow = flow * 5.0 + 0.5;
  fragColor = vec4(clamp(encodedFlow, 0.0, 1.0), clamp(speed * 8.0, 0.0, 1.0), motionMask);
}
`;

/**
 * Pass 2: Multi-Scale Irregular Block Displacement & Spatial Corruption.
 */
export const blockDisplaceFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_motionVectorTexture;
uniform vec2 u_resolution;
uniform float u_blockSize;
uniform float u_largeBlockMix;
uniform float u_displacementStrength; // 0 to 100
uniform float u_blockIrregularity;
uniform float u_animationSpeed;       // 0.0 to 3.0
uniform float u_motionWeight;
uniform float u_corruptFrequency;     // 0 to 100
uniform float u_horizontalTear;
uniform float u_displacedRegions;
uniform float u_masterIntensity;      // 0 to 100
uniform float u_time;
uniform float u_randomSeed;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * (0.1031 + u_randomSeed * 0.0001));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * (vec3(0.1031, 0.1030, 0.0973) + u_randomSeed * 0.0001));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time * u_animationSpeed;
  float steppedTime = floor(t * 5.0) / 5.0;

  float masterScalar = clamp(u_masterIntensity / 100.0, 0.0, 1.0);
  float displaceScalar = clamp(u_displacementStrength / 100.0, 0.0, 1.0) * masterScalar;

  // Local motion from Pass 1
  float localMotion = texture(u_motionVectorTexture, uv).a;
  float motionFactor = mix(1.0, clamp(localMotion * 2.0, 0.05, 1.0), u_motionWeight);

  // Irregular noise perturbation on block borders
  vec2 irregularOffset = vec2(0.0);
  if (u_blockIrregularity > 0.01) {
    vec2 noiseCoord = uv * (u_resolution / max(4.0, u_blockSize)) * 0.25;
    float n1 = vnoise(noiseCoord + steppedTime);
    float n2 = vnoise(noiseCoord + steppedTime + 15.0);
    irregularOffset = (vec2(n1, n2) - 0.5) * (u_blockSize / u_resolution) * u_blockIrregularity * 2.2;
  }

  vec2 warpedUV = uv + irregularOffset;

  // Primary Grid
  vec2 gridCount = u_resolution / max(2.0, u_blockSize);
  vec2 blockIndex = floor(warpedUV * gridCount);

  // Pseudo-random block displacement vector
  vec2 randVec = hash22(blockIndex + floor(steppedTime));
  vec2 blockDisp = (randVec - 0.5) * 0.08 * displaceScalar;

  // Intermittent Large Macroblock Grid
  if (u_largeBlockMix > 0.01) {
    vec2 largeGridCount = u_resolution / max(24.0, u_blockSize * 3.5);
    vec2 largeBlockIndex = floor(warpedUV * largeGridCount);
    float largeNoise = hash12(largeBlockIndex + floor(steppedTime * 0.8));
    if (largeNoise < u_largeBlockMix * 0.38) {
      vec2 largeShift = (hash22(largeBlockIndex * 3.7) - 0.5) * 0.15 * displaceScalar;
      blockDisp = mix(blockDisp, largeShift, 0.85);
    }
  }

  blockDisp *= motionFactor;

  // Horizontal Tearing
  float tearAmount = 0.0;
  if (u_horizontalTear > 0.01) {
    float lineIndex = floor(uv.y * (u_resolution.y / 14.0));
    float lineNoise = hash12(vec2(lineIndex, floor(steppedTime * 1.5)));
    if (lineNoise < u_horizontalTear * 0.4) {
      float shift = (hash12(vec2(lineIndex * 5.7, 1.0)) - 0.5) * 0.16 * u_horizontalTear * masterScalar;
      blockDisp.x += shift * motionFactor;
      tearAmount = 1.0;
    }
  }

  // Displaced Rectangular Fragments
  if (u_displacedRegions > 0.01) {
    vec2 macroRegion = floor(uv * vec2(4.0, 5.0));
    float regNoise = hash12(macroRegion + floor(steppedTime * 1.2));
    if (regNoise < u_displacedRegions * 0.32) {
      blockDisp += (hash22(macroRegion * 2.3) - 0.5) * 0.09 * u_displacedRegions * motionFactor * masterScalar;
    }
  }

  // Compression packet dropouts
  float corruptScalar = clamp(u_corruptFrequency / 100.0, 0.0, 1.0) * masterScalar;
  float corruptMask = 0.0;
  if (corruptScalar > 0.005) {
    float cNoise = hash12(blockIndex + floor(u_time * 6.0));
    if (cNoise < corruptScalar * 0.20) {
      blockDisp *= 2.5;
      corruptMask = 1.0;
    }
  }

  vec2 encodedDisp = clamp(blockDisp * 5.0 + 0.5, 0.0, 1.0);
  fragColor = vec4(encodedDisp, tearAmount, corruptMask);
}
`;

/**
 * Pass 3: Temporal Feedback Accumulation & Painterly Bleed.
 */
export const datamoshAccumulationFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_historyTexture;
uniform sampler2D u_currentFrame;
uniform sampler2D u_motionVectorTexture;
uniform sampler2D u_blockDisplaceTexture;

uniform vec2 u_resolution;
uniform float u_iFrameDrop;
uniform float u_temporalFeedback;   // 0 to 100
uniform float u_feedbackDecay;      // 0 to 100
uniform float u_painterlyBleed;
uniform float u_smearLength;        // 0 to 100
uniform float u_ghostTrail;
uniform float u_pixelSort;
uniform float u_pixelSortThreshold;
uniform float u_pixelSortDir;
uniform float u_driftSpeed;
uniform float u_masterIntensity;    // 0 to 100
uniform float u_time;
uniform float u_reset;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 uv = v_uv;
  vec2 texel = 1.0 / u_resolution;

  if (u_reset > 0.5) {
    fragColor = texture(u_currentFrame, uv);
    return;
  }

  float masterScalar = clamp(u_masterIntensity / 100.0, 0.0, 1.0);
  float smearMultiplier = (u_smearLength / 50.0) * masterScalar;

  // Optical motion vector
  vec4 motionSample = texture(u_motionVectorTexture, uv);
  vec2 motionFlow = (motionSample.xy - 0.5) / 5.0;
  float motionSpeed = motionSample.z;

  // Block displacement
  vec4 blockSample = texture(u_blockDisplaceTexture, uv);
  vec2 blockDisp = (blockSample.xy - 0.5) / 5.0;

  // Combined displacement
  vec2 displacement = motionFlow * smearMultiplier + blockDisp;
  displacement.y += u_driftSpeed * 0.0018 * masterScalar;

  vec2 sampleUV = uv - displacement;

  // Pixel sorting
  if (u_pixelSort > 0.5) {
    vec3 testCol = texture(u_historyTexture, uv).rgb;
    float testL = luma(testCol);
    if (testL > u_pixelSortThreshold) {
      float sortOffset = (testL - u_pixelSortThreshold) * 0.035 * masterScalar;
      if (u_pixelSortDir > 0.5) {
        sampleUV.y -= sortOffset;
      } else {
        sampleUV.x -= sortOffset;
      }
    }
  }

  sampleUV = clamp(sampleUV, vec2(0.001), vec2(0.999));

  // Painterly diffusion
  vec3 col0 = texture(u_historyTexture, sampleUV).rgb;
  vec3 historyCol;

  if (u_painterlyBleed > 0.01) {
    vec2 blurOffset = max(texel * 1.5, abs(displacement) * 0.4);
    vec3 col1 = texture(u_historyTexture, clamp(sampleUV + vec2(blurOffset.x, 0.0), 0.001, 0.999)).rgb;
    vec3 col2 = texture(u_historyTexture, clamp(sampleUV - vec2(blurOffset.x, 0.0), 0.001, 0.999)).rgb;
    vec3 col3 = texture(u_historyTexture, clamp(sampleUV + vec2(0.0, blurOffset.y), 0.001, 0.999)).rgb;
    vec3 col4 = texture(u_historyTexture, clamp(sampleUV - vec2(0.0, blurOffset.y), 0.001, 0.999)).rgb;

    vec3 diffusedCol = (col0 * 2.0 + col1 + col2 + col3 + col4) / 6.0;
    historyCol = mix(col0, diffusedCol, u_painterlyBleed * 0.85);
  } else {
    historyCol = col0;
  }

  // Ghost trail
  if (u_ghostTrail > 0.01) {
    vec2 ghostUV = clamp(uv - displacement * 1.8, vec2(0.001), vec2(0.999));
    vec3 ghostCol = texture(u_historyTexture, ghostUV).rgb;
    historyCol = mix(historyCol, ghostCol, u_ghostTrail * 0.35);
  }

  vec3 currentCol = texture(u_currentFrame, uv).rgb;
  vec3 outCol;

  float decayRate = clamp(u_feedbackDecay / 100.0, 0.0, 1.0);

  if (u_iFrameDrop > 0.5) {
    // I-Frame Keyframe suppression
    float decayFactor = decayRate * 0.08;
    outCol = mix(historyCol, currentCol, decayFactor);
  } else {
    // Temporal feedback blend
    float persistence = (u_temporalFeedback / 100.0) * 0.98 * masterScalar;
    float motionBoost = clamp(motionSpeed * 1.4, 0.0, 0.25);
    float blendFactor = clamp(persistence + motionBoost - (decayRate * 0.45), 0.0, 0.97);
    outCol = mix(currentCol, historyCol, blendFactor);
  }

  // Anti-runaway luminance protection
  float l = luma(outCol);
  if (l > 0.95) {
    outCol = mix(outCol, vec3(0.89), (l - 0.95) * 3.5);
  } else if (l < 0.05) {
    outCol = mix(outCol, vec3(0.09), (0.05 - l) * 3.5);
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

/**
 * Pass 4: Color Grading, Quantization, Edge Noise, Tint, Saturation, Brightness, and Final Screen Composite.
 */
export const compositeFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_moshTexture;
uniform sampler2D u_currentFrame;

uniform bool u_enabled;
uniform bool u_paletteGrading;
uniform float u_paletteIntensity;
uniform float u_rgbSeparation;      // 0 to 100
uniform float u_colorTearing;
uniform float u_colorLevels;        // 2 to 32
uniform float u_edgeNoise;
uniform float u_ditherStrength;
uniform float u_saturation;         // 0.0 to 2.0
uniform float u_contrast;           // 0.5 to 2.5
uniform float u_brightness;         // 0.5 to 1.5
uniform vec3 u_colorTint;           // RGB tint multiplier
uniform float u_noiseAmount;        // 0 to 100
uniform float u_brokenScanlines;
uniform bool u_monochrome;
uniform bool u_invert;
uniform float u_time;
uniform float u_randomSeed;
uniform vec2 u_resolution;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * (0.1031 + u_randomSeed * 0.0001));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float bayer4(vec2 coord) {
  vec2 p = mod(coord, 4.0);
  int x = int(p.x);
  int y = int(p.y);
  
  float b[16] = float[16](
     0.0 / 16.0,  8.0 / 16.0,  2.0 / 16.0, 10.0 / 16.0,
    12.0 / 16.0,  4.0 / 16.0, 14.0 / 16.0,  6.0 / 16.0,
     3.0 / 16.0, 11.0 / 16.0,  1.0 / 16.0,  9.0 / 16.0,
    15.0 / 16.0,  7.0 / 16.0, 13.0 / 16.0,  5.0 / 16.0
  );
  return b[y * 4 + x] - 0.5;
}

vec3 applyPainterlyPalette(vec3 c) {
  float l = luma(c);
  vec3 shadowPurple = vec3(0.18, 0.12, 0.22);
  vec3 dustyGreen   = vec3(0.42, 0.50, 0.40);
  vec3 warmPeach    = vec3(0.86, 0.64, 0.56);
  vec3 paleCyan     = vec3(0.74, 0.86, 0.90);

  vec3 graded;
  if (l < 0.30) {
    graded = mix(shadowPurple, dustyGreen, l / 0.30);
  } else if (l < 0.65) {
    graded = mix(dustyGreen, warmPeach, (l - 0.30) / 0.35);
  } else {
    graded = mix(warmPeach, paleCyan, (l - 0.65) / 0.35);
  }

  vec3 desatOriginal = mix(c, vec3(l), 0.35);
  return mix(desatOriginal, graded, 0.75);
}

void main() {
  vec2 uv = v_uv;

  // BYPASS: clean unmodified feed
  if (!u_enabled) {
    fragColor = texture(u_currentFrame, uv);
    return;
  }

  // Color Tearing offset
  vec2 tearOffsetR = vec2(0.0);
  vec2 tearOffsetB = vec2(0.0);
  if (u_colorTearing > 0.01) {
    float tearLine = floor(uv.y * (u_resolution.y / 10.0));
    float tNoise = hash12(vec2(tearLine, floor(u_time * 10.0)));
    if (tNoise < u_colorTearing * 0.28) {
      tearOffsetR.x = (hash12(vec2(tearLine * 2.1, 1.0)) - 0.5) * 0.04 * u_colorTearing;
      tearOffsetB.x = (hash12(vec2(tearLine * 3.7, 2.0)) - 0.5) * -0.04 * u_colorTearing;
    }
  }

  // RGB Separation
  vec3 col;
  if (u_rgbSeparation > 0.5 || u_colorTearing > 0.01) {
    float dist = (u_rgbSeparation / 100.0) * 0.02;
    vec2 dirR = vec2(dist, 0.0) + tearOffsetR;
    vec2 dirG = vec2(-dist * 0.5, dist * 0.866);
    vec2 dirB = vec2(-dist * 0.5, -dist * 0.866) + tearOffsetB;

    float r = texture(u_moshTexture, clamp(uv + dirR, 0.001, 0.999)).r;
    float g = texture(u_moshTexture, clamp(uv + dirG, 0.001, 0.999)).g;
    float b = texture(u_moshTexture, clamp(uv + dirB, 0.001, 0.999)).b;
    col = vec3(r, g, b);
  } else {
    col = texture(u_moshTexture, clamp(uv, 0.001, 0.999)).rgb;
  }

  // Painterly Reference Palette Grading
  if (u_paletteGrading && u_paletteIntensity > 0.01) {
    vec3 painterlyCol = applyPainterlyPalette(col);
    col = mix(col, painterlyCol, u_paletteIntensity);
  }

  // Color Quantization (2 to 32 levels)
  if (u_colorLevels < 31.5) {
    float levels = clamp(u_colorLevels, 2.0, 32.0);
    float dither = bayer4(gl_FragCoord.xy) * (1.0 / levels) * u_ditherStrength;
    float boundaryNoise = (hash12(gl_FragCoord.xy * 0.75 + fract(u_time * 12.0)) - 0.5) * (1.0 / levels) * u_edgeNoise * 0.5;
    col = floor((col + dither + boundaryNoise) * levels) / (levels - 1.0);
    col = clamp(col, 0.0, 1.0);
  }

  // IMAGE CONTROLS: Contrast, Brightness, Saturation, Tint
  // 1. Contrast
  if (abs(u_contrast - 1.0) > 0.005) {
    col = (col - 0.5) * u_contrast + 0.5;
  }

  // 2. Brightness
  if (abs(u_brightness - 1.0) > 0.005) {
    col = col * u_brightness;
  }

  // 3. Saturation
  if (abs(u_saturation - 1.0) > 0.005) {
    float l = luma(col);
    col = mix(vec3(l), col, u_saturation);
  }

  // 4. Color Tint
  if (length(u_colorTint - vec3(1.0)) > 0.01) {
    col = col * u_colorTint;
  }

  // 5. Broken Scanlines
  if (u_brokenScanlines > 0.01) {
    float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.5 + 0.5;
    float segmentNoise = hash12(vec2(floor(uv.x * 24.0), floor(uv.y * (u_resolution.y / 4.0))));
    if (segmentNoise > 0.4) {
      col -= scanline * u_brokenScanlines * 0.18;
    }
  }

  // 6. Noise Amount (0 to 100)
  if (u_noiseAmount > 0.5) {
    float nStrength = (u_noiseAmount / 100.0) * 0.35;
    float grain = hash12(uv * 1000.0 + fract(u_time * 33.123 + u_randomSeed * 0.1));
    col += (grain - 0.5) * nStrength;
  }

  if (u_monochrome) {
    float l = luma(col);
    col = vec3(l);
  }

  if (u_invert) {
    col = 1.0 - col;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
