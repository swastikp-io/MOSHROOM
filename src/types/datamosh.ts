export type InputResolution = 'default' | '480p' | '720p' | '1080p';

export interface MoshSettings {
  // Master bypass switch
  enabled: boolean;

  // ----------------------------------------------------
  // 1. INPUT CONTROLS
  // ----------------------------------------------------
  mirrorCamera: boolean;          // Mirror/flip horizontal
  inputResolution: InputResolution;// 'default' | '480p' | '720p' | '1080p'

  // ----------------------------------------------------
  // 2. DATAMOSH CONTROLS
  // ----------------------------------------------------
  masterIntensity: number;        // 0 to 100 (overall multiplier for all datamosh vectors & displacements)
  temporalFeedback: number;       // 0 to 100 (temporal feedback retention / persistence)
  blockSize: number;              // 2 to 40 (macroblock grid size)
  displacementStrength: number;   // 0 to 100 (block displacement magnitude)
  motionSensitivity: number;      // 0 to 100 (sensitivity to movement; maps to threshold)
  smearLength: number;            // 0 to 100 (length of directional motion smearing)
  corruptFrequency: number;       // 0 to 100 (frequency of compression packet dropouts)
  colorLevels: number;            // 2 to 32 (quantization levels per channel)
  rgbSeparation: number;          // 0 to 100 (chromatic offset and channel misalignment)
  internalResolutionScale: number;// 0.1 to 1.0 (internal GPU processing resolution scale)

  // ----------------------------------------------------
  // 3. IMAGE CONTROLS
  // ----------------------------------------------------
  saturation: number;             // 0.0 to 2.0 (0 = grayscale, 1 = normal, 2 = vibrant)
  contrast: number;               // 0.5 to 2.5 (1.0 = normal)
  brightness: number;             // 0.5 to 1.5 (1.0 = normal)
  colorTint: string;              // Hex color string (e.g. #ffffff = neutral, #e0a996 = peach, #362438 = dark purple)
  noiseAmount: number;            // 0 to 100 (organic sensor / film grain noise)

  // ----------------------------------------------------
  // 4. MOTION CONTROLS
  // ----------------------------------------------------
  animationSpeed: number;         // 0.0 to 3.0 (temporal evolution rate)
  feedbackDecay: number;          // 0 to 100 (how quickly smearing decays to live feed)
  corruptionBurstAmount: number;  // 0 to 100 (strength of triggered corruption bursts)
  randomSeed: number;             // 0 to 9999 (seed for procedural noise distributions)
  freezeAnimation: boolean;       // Freeze effect temporal progression

  // ----------------------------------------------------
  // 5. ADVANCED / PAINTERLY CONTROLS (COLLAPSIBLE)
  // ----------------------------------------------------
  iFrameDrop: boolean;            // Suppresses I-frame keyframes
  autoDropInterval: number;       // 0 = manual hold; >0 = auto-drop cadence in seconds
  painterlyBleed: number;         // 0.0 to 1.0 (watercolor multi-tap diffusion)
  largeBlockMix: number;          // 0.0 to 1.0 (intermittent 32-64px macroblocks)
  blockIrregularity: number;      // 0.0 to 1.0 (noise-deformed block boundaries)
  motionWeight: number;           // 0.0 to 1.0 (weight corruption by motion magnitude)
  smearDirectionality: number;    // 0.0 to 1.0 (optical flow vs edge tangent momentum)
  ghostTrail: number;             // 0.0 to 1.0 (secondary lagging ghost trail)
  paletteGrading: boolean;        // Enables reference painterly color grading
  paletteIntensity: number;       // 0.0 to 1.0 (palette blend factor)
  colorTearing: number;           // 0.0 to 1.0 (horizontal channel tearing lines)
  edgeNoise: number;              // 0.0 to 1.0 (boundary noise along color bands)
  ditherStrength: number;         // 0.0 to 1.0 (Bayer matrix dither)
  brokenScanlines: number;        // 0.0 to 1.0 (intermittent scanline segments)
  horizontalTear: number;         // 0.0 to 1.0 (horizontal slit scan tearing)
  displacedRegions: number;       // 0.0 to 1.0 (discontinuous rectangular fragments)
  textureFiltering: 'nearest' | 'linear'; // Nearest-neighbor vs linear interpolation
  pixelSort: boolean;
  pixelSortThreshold: number;     // 0.0 to 1.0
  pixelSortDirection: 'horizontal' | 'vertical';
  driftSpeed: number;             // -2.0 to 2.0
  monochrome: boolean;            // Brutalist B&W
  invert: boolean;                // Negative invert
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  settings: Partial<MoshSettings>;
}

export interface StreamStats {
  fps: number;
  width: number;
  height: number;
  internalWidth: number;
  internalHeight: number;
  renderTimeMs: number;
  isRecording: boolean;
  recordingDuration: number;
  cameraActive: boolean;
  isSynthetic: boolean;
  activeDeviceId: string;
}

export type CameraStatus = 
  | 'idle'
  | 'requesting'
  | 'active'
  | 'permission_denied'
  | 'device_not_found'
  | 'unsupported'
  | 'error';
