import { MoshSettings } from '../../types/datamosh';
import { FramebufferObject, PingPongFBO } from '../../types/webgl';
import {
  createFBO,
  createPingPongFBO,
  createProgram,
  createQuadVAO,
  createTexture,
  deleteFBO,
  setTextureFilter,
} from './glUtils';
import {
  blockDisplaceFragmentShader,
  commonVertexShader,
  compositeFragmentShader,
  datamoshAccumulationFragmentShader,
  motionVectorFragmentShader,
} from './shaders';

function hexToRgbNormalized(hex: string): [number, number, number] {
  if (!hex || hex.length < 4) return [1.0, 1.0, 1.0];
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [1.0, 1.0, 1.0];
  const r = ((num >> 16) & 255) / 255.0;
  const g = ((num >> 8) & 255) / 255.0;
  const b = (num & 255) / 255.0;
  return [r, g, b];
}

export class MoshRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;

  // Shader programs
  private motionProgram: WebGLProgram | null = null;
  private blockProgram: WebGLProgram | null = null;
  private moshProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;

  // Cached uniform locations
  private motionUniforms: Record<string, WebGLUniformLocation | null> = {};
  private blockUniforms: Record<string, WebGLUniformLocation | null> = {};
  private moshUniforms: Record<string, WebGLUniformLocation | null> = {};
  private compositeUniforms: Record<string, WebGLUniformLocation | null> = {};

  // Textures and Framebuffers
  private currentFrameTex: WebGLTexture | null = null;
  private previousFrameTex: WebGLTexture | null = null;
  private motionFBO: FramebufferObject | null = null;
  private blockFBO: FramebufferObject | null = null;
  private moshPingPong: PingPongFBO | null = null;

  // Sizing and state
  private inputWidth: number = 0;
  private inputHeight: number = 0;
  private internalWidth: number = 0;
  private internalHeight: number = 0;
  private currentScale: number = 0.5;
  private currentFilterMode: 'nearest' | 'linear' = 'linear';

  private videoInitialized: boolean = false;
  private resetPending: boolean = true;
  private isContextLost: boolean = false;

  // Frame timing
  private startTime: number = performance.now();
  private frozenTime: number = 0;
  private lastAutoDropTime: number = performance.now();
  private isAutoDropPhase: boolean = false;

  // Bound event handlers
  private onContextLostBound: (e: Event) => void;
  private onContextRestoredBound: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported on this device/browser.');
    }
    this.gl = gl;

    this.onContextLostBound = this.handleContextLost.bind(this);
    this.onContextRestoredBound = this.handleContextRestored.bind(this);

    canvas.addEventListener('webglcontextlost', this.onContextLostBound, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestoredBound, false);

    this.initResources();
  }

  private handleContextLost(e: Event): void {
    e.preventDefault();
    console.warn('WebGL2 context lost. Pausing rendering.');
    this.isContextLost = true;
    this.destroyBuffers();
  }

  private handleContextRestored(): void {
    console.info('WebGL2 context restored. Rebuilding GPU resources.');
    this.isContextLost = false;
    this.initResources();
    if (this.inputWidth > 0 && this.inputHeight > 0) {
      this.reallocateBuffers(this.inputWidth, this.inputHeight, this.currentScale, this.currentFilterMode);
    }
  }

  private initResources(): void {
    const gl = this.gl;

    // 1. Setup Quad VAO
    const { vao, buffer } = createQuadVAO(gl);
    this.quadVAO = vao;
    this.quadBuffer = buffer;

    // 2. Build Programs
    this.motionProgram = createProgram(gl, commonVertexShader, motionVectorFragmentShader);
    this.blockProgram = createProgram(gl, commonVertexShader, blockDisplaceFragmentShader);
    this.moshProgram = createProgram(gl, commonVertexShader, datamoshAccumulationFragmentShader);
    this.compositeProgram = createProgram(gl, commonVertexShader, compositeFragmentShader);

    // 3. Cache Uniforms
    this.cacheUniforms(this.motionProgram, this.motionUniforms, [
      'u_currentFrame',
      'u_previousFrame',
      'u_resolution',
      'u_blockSize',
      'u_motionSensitivity',
      'u_smearDirectionality',
      'u_masterIntensity',
      'u_time',
      'u_randomSeed',
      'u_flipY',
      'u_mirror',
    ]);

    this.cacheUniforms(this.blockProgram, this.blockUniforms, [
      'u_motionVectorTexture',
      'u_resolution',
      'u_blockSize',
      'u_largeBlockMix',
      'u_displacementStrength',
      'u_blockIrregularity',
      'u_animationSpeed',
      'u_motionWeight',
      'u_corruptFrequency',
      'u_horizontalTear',
      'u_displacedRegions',
      'u_masterIntensity',
      'u_time',
      'u_randomSeed',
      'u_flipY',
      'u_mirror',
    ]);

    this.cacheUniforms(this.moshProgram, this.moshUniforms, [
      'u_historyTexture',
      'u_currentFrame',
      'u_motionVectorTexture',
      'u_blockDisplaceTexture',
      'u_resolution',
      'u_iFrameDrop',
      'u_temporalFeedback',
      'u_feedbackDecay',
      'u_painterlyBleed',
      'u_smearLength',
      'u_ghostTrail',
      'u_pixelSort',
      'u_pixelSortThreshold',
      'u_pixelSortDir',
      'u_driftSpeed',
      'u_masterIntensity',
      'u_time',
      'u_reset',
      'u_flipY',
      'u_mirror',
    ]);

    this.cacheUniforms(this.compositeProgram, this.compositeUniforms, [
      'u_moshTexture',
      'u_currentFrame',
      'u_enabled',
      'u_paletteGrading',
      'u_paletteIntensity',
      'u_rgbSeparation',
      'u_colorTearing',
      'u_colorLevels',
      'u_edgeNoise',
      'u_ditherStrength',
      'u_saturation',
      'u_contrast',
      'u_brightness',
      'u_colorTint',
      'u_noiseAmount',
      'u_brokenScanlines',
      'u_monochrome',
      'u_invert',
      'u_time',
      'u_randomSeed',
      'u_resolution',
      'u_flipY',
      'u_mirror',
    ]);
  }

  private cacheUniforms(
    program: WebGLProgram,
    store: Record<string, WebGLUniformLocation | null>,
    names: string[]
  ): void {
    const gl = this.gl;
    for (const name of names) {
      store[name] = gl.getUniformLocation(program, name);
    }
  }

  /**
   * Reallocates internal textures and framebuffers matching input and processing scale
   */
  public reallocateBuffers(
    inputWidth: number,
    inputHeight: number,
    scale: number,
    filterMode: 'nearest' | 'linear'
  ): void {
    this.inputWidth = inputWidth;
    this.inputHeight = inputHeight;
    this.currentScale = Math.max(0.1, Math.min(1.0, scale));
    this.currentFilterMode = filterMode;

    const gl = this.gl;
    const internalW = Math.max(32, Math.floor(inputWidth * this.currentScale));
    const internalH = Math.max(18, Math.floor(inputHeight * this.currentScale));

    this.internalWidth = internalW;
    this.internalHeight = internalH;

    this.destroyBuffers();

    const glFilter = filterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;

    // Full-resolution camera upload textures
    this.currentFrameTex = createTexture(gl, inputWidth, inputHeight, glFilter);
    this.previousFrameTex = createTexture(gl, inputWidth, inputHeight, glFilter);

    // Intermediate processing FBOs
    this.motionFBO = createFBO(gl, internalW, internalH, gl.NEAREST);
    this.blockFBO = createFBO(gl, internalW, internalH, gl.NEAREST);
    this.moshPingPong = createPingPongFBO(gl, internalW, internalH, glFilter);

    this.resetPending = true;
    this.videoInitialized = false;
  }

  /**
   * Clears temporal history and resets accumulator buffers to clean live feed
   */
  public resetBuffer(): void {
    this.resetPending = true;
  }

  public getInternalDimensions(): { width: number; height: number } {
    return { width: this.internalWidth, height: this.internalHeight };
  }

  /**
   * Main render execution step
   */
  public render(
    video: HTMLVideoElement | HTMLCanvasElement,
    settings: MoshSettings
  ): void {
    if (this.isContextLost || !this.quadVAO) return;

    const gl = this.gl;
    const vWidth = video instanceof HTMLVideoElement ? video.videoWidth : video.width;
    const vHeight = video instanceof HTMLVideoElement ? video.videoHeight : video.height;

    if (vWidth === 0 || vHeight === 0) return;

    const scale = settings.internalResolutionScale || 0.5;
    const filterMode = settings.textureFiltering || 'linear';

    if (
      this.inputWidth !== vWidth ||
      this.inputHeight !== vHeight ||
      Math.abs(this.currentScale - scale) > 0.01 ||
      this.currentFilterMode !== filterMode
    ) {
      this.reallocateBuffers(vWidth, vHeight, scale, filterMode);
    }

    const inW = this.inputWidth;
    const inH = this.inputHeight;
    const intW = this.internalWidth;
    const intH = this.internalHeight;

    // Time calculation (freeze animation support)
    if (!settings.freezeAnimation) {
      this.frozenTime = (performance.now() - this.startTime) / 1000.0;
    }
    const currentTime = this.frozenTime;

    // Handle auto-drop timing
    let activeIFrameDrop = settings.iFrameDrop;
    if (settings.autoDropInterval > 0) {
      const elapsed = (performance.now() - this.lastAutoDropTime) / 1000.0;
      if (elapsed >= settings.autoDropInterval) {
        this.lastAutoDropTime = performance.now();
        this.isAutoDropPhase = !this.isAutoDropPhase;
      }
      activeIFrameDrop = this.isAutoDropPhase;
    }

    // 1. Upload video frame to currentFrameTex
    gl.bindTexture(gl.TEXTURE_2D, this.currentFrameTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, inW, inH, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Initial frame or reset seed
    if (!this.videoInitialized || this.resetPending) {
      gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, inW, inH, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }

    gl.bindVertexArray(this.quadVAO);

    const mirror = settings.mirrorCamera ? 1 : 0;
    const seed = settings.randomSeed || 0;

    // ----------------------------------------------------
    // PASS 1: Motion & Gradient Vector Extraction (motionFBO)
    // ----------------------------------------------------
    if (this.motionProgram && this.motionFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.motionFBO.framebuffer);
      gl.viewport(0, 0, intW, intH);
      gl.useProgram(this.motionProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.currentFrameTex);
      gl.uniform1i(this.motionUniforms.u_currentFrame, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTex);
      gl.uniform1i(this.motionUniforms.u_previousFrame, 1);

      gl.uniform2f(this.motionUniforms.u_resolution, intW, intH);
      gl.uniform1f(this.motionUniforms.u_blockSize, settings.blockSize);
      gl.uniform1f(this.motionUniforms.u_motionSensitivity, settings.motionSensitivity);
      gl.uniform1f(this.motionUniforms.u_smearDirectionality, settings.smearDirectionality);
      gl.uniform1f(this.motionUniforms.u_masterIntensity, settings.masterIntensity);
      gl.uniform1f(this.motionUniforms.u_time, currentTime);
      gl.uniform1f(this.motionUniforms.u_randomSeed, seed);
      gl.uniform1i(this.motionUniforms.u_flipY, 0);
      gl.uniform1i(this.motionUniforms.u_mirror, mirror);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ----------------------------------------------------
    // PASS 2: Multi-Scale Block Displacement (blockFBO)
    // ----------------------------------------------------
    if (this.blockProgram && this.blockFBO && this.motionFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blockFBO.framebuffer);
      gl.viewport(0, 0, intW, intH);
      gl.useProgram(this.blockProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.motionFBO.texture);
      gl.uniform1i(this.blockUniforms.u_motionVectorTexture, 0);

      gl.uniform2f(this.blockUniforms.u_resolution, intW, intH);
      gl.uniform1f(this.blockUniforms.u_blockSize, settings.blockSize);
      gl.uniform1f(this.blockUniforms.u_largeBlockMix, settings.largeBlockMix);
      gl.uniform1f(this.blockUniforms.u_displacementStrength, settings.displacementStrength);
      gl.uniform1f(this.blockUniforms.u_blockIrregularity, settings.blockIrregularity);
      gl.uniform1f(this.blockUniforms.u_animationSpeed, settings.animationSpeed);
      gl.uniform1f(this.blockUniforms.u_motionWeight, settings.motionWeight);
      gl.uniform1f(this.blockUniforms.u_corruptFrequency, settings.corruptFrequency);
      gl.uniform1f(this.blockUniforms.u_horizontalTear, settings.horizontalTear);
      gl.uniform1f(this.blockUniforms.u_displacedRegions, settings.displacedRegions);
      gl.uniform1f(this.blockUniforms.u_masterIntensity, settings.masterIntensity);
      gl.uniform1f(this.blockUniforms.u_time, currentTime);
      gl.uniform1f(this.blockUniforms.u_randomSeed, seed);
      gl.uniform1i(this.blockUniforms.u_flipY, 0);
      gl.uniform1i(this.blockUniforms.u_mirror, mirror);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ----------------------------------------------------
    // PASS 3: Temporal Feedback Accumulation (moshPingPong)
    // ----------------------------------------------------
    if (this.moshProgram && this.moshPingPong && this.motionFBO && this.blockFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.moshPingPong.write.framebuffer);
      gl.viewport(0, 0, intW, intH);
      gl.useProgram(this.moshProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.moshPingPong.read.texture);
      gl.uniform1i(this.moshUniforms.u_historyTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.currentFrameTex);
      gl.uniform1i(this.moshUniforms.u_currentFrame, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.motionFBO.texture);
      gl.uniform1i(this.moshUniforms.u_motionVectorTexture, 2);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.blockFBO.texture);
      gl.uniform1i(this.moshUniforms.u_blockDisplaceTexture, 3);

      gl.uniform2f(this.moshUniforms.u_resolution, intW, intH);
      gl.uniform1f(this.moshUniforms.u_iFrameDrop, activeIFrameDrop ? 1.0 : 0.0);
      gl.uniform1f(this.moshUniforms.u_temporalFeedback, settings.temporalFeedback);
      gl.uniform1f(this.moshUniforms.u_feedbackDecay, settings.feedbackDecay);
      gl.uniform1f(this.moshUniforms.u_painterlyBleed, settings.painterlyBleed);
      gl.uniform1f(this.moshUniforms.u_smearLength, settings.smearLength);
      gl.uniform1f(this.moshUniforms.u_ghostTrail, settings.ghostTrail);
      gl.uniform1f(this.moshUniforms.u_pixelSort, settings.pixelSort ? 1.0 : 0.0);
      gl.uniform1f(this.moshUniforms.u_pixelSortThreshold, settings.pixelSortThreshold);
      gl.uniform1f(this.moshUniforms.u_pixelSortDir, settings.pixelSortDirection === 'vertical' ? 1.0 : 0.0);
      gl.uniform1f(this.moshUniforms.u_driftSpeed, settings.driftSpeed);
      gl.uniform1f(this.moshUniforms.u_masterIntensity, settings.masterIntensity);
      gl.uniform1f(this.moshUniforms.u_time, currentTime);
      gl.uniform1f(this.moshUniforms.u_reset, this.resetPending ? 1.0 : 0.0);
      gl.uniform1i(this.moshUniforms.u_flipY, 0);
      gl.uniform1i(this.moshUniforms.u_mirror, mirror);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      this.moshPingPong.swap();
      this.resetPending = false;
    }

    // ----------------------------------------------------
    // Update previous frame for next iteration
    // ----------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTex);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, inW, inH);

    // ----------------------------------------------------
    // PASS 4: Color Grading, Quantization & Final Screen Composite
    // ----------------------------------------------------
    if (this.compositeProgram && this.moshPingPong) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.compositeProgram);

      const glFilter = filterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;
      setTextureFilter(gl, this.moshPingPong.read.texture, glFilter);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.moshPingPong.read.texture);
      gl.uniform1i(this.compositeUniforms.u_moshTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.currentFrameTex);
      gl.uniform1i(this.compositeUniforms.u_currentFrame, 1);

      const tint = hexToRgbNormalized(settings.colorTint);

      gl.uniform1i(this.compositeUniforms.u_enabled, settings.enabled ? 1 : 0);
      gl.uniform1i(this.compositeUniforms.u_paletteGrading, settings.paletteGrading ? 1 : 0);
      gl.uniform1f(this.compositeUniforms.u_paletteIntensity, settings.paletteIntensity);
      gl.uniform1f(this.compositeUniforms.u_rgbSeparation, settings.rgbSeparation);
      gl.uniform1f(this.compositeUniforms.u_colorTearing, settings.colorTearing);
      gl.uniform1f(this.compositeUniforms.u_colorLevels, settings.colorLevels);
      gl.uniform1f(this.compositeUniforms.u_edgeNoise, settings.edgeNoise);
      gl.uniform1f(this.compositeUniforms.u_ditherStrength, settings.ditherStrength);
      gl.uniform1f(this.compositeUniforms.u_saturation, settings.saturation);
      gl.uniform1f(this.compositeUniforms.u_contrast, settings.contrast);
      gl.uniform1f(this.compositeUniforms.u_brightness, settings.brightness);
      gl.uniform3f(this.compositeUniforms.u_colorTint, tint[0], tint[1], tint[2]);
      gl.uniform1f(this.compositeUniforms.u_noiseAmount, settings.noiseAmount);
      gl.uniform1f(this.compositeUniforms.u_brokenScanlines, settings.brokenScanlines);
      gl.uniform1i(this.compositeUniforms.u_monochrome, settings.monochrome ? 1 : 0);
      gl.uniform1i(this.compositeUniforms.u_invert, settings.invert ? 1 : 0);
      gl.uniform1f(this.compositeUniforms.u_time, currentTime);
      gl.uniform1f(this.compositeUniforms.u_randomSeed, seed);
      gl.uniform2f(this.compositeUniforms.u_resolution, this.canvas.width, this.canvas.height);
      gl.uniform1i(this.compositeUniforms.u_flipY, 0);
      gl.uniform1i(this.compositeUniforms.u_mirror, mirror);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
    this.videoInitialized = true;
  }

  private destroyBuffers(): void {
    const gl = this.gl;
    if (this.currentFrameTex) {
      gl.deleteTexture(this.currentFrameTex);
      this.currentFrameTex = null;
    }
    if (this.previousFrameTex) {
      gl.deleteTexture(this.previousFrameTex);
      this.previousFrameTex = null;
    }
    if (this.motionFBO) {
      deleteFBO(gl, this.motionFBO);
      this.motionFBO = null;
    }
    if (this.blockFBO) {
      deleteFBO(gl, this.blockFBO);
      this.blockFBO = null;
    }
    if (this.moshPingPong) {
      deleteFBO(gl, this.moshPingPong.read);
      deleteFBO(gl, this.moshPingPong.write);
      this.moshPingPong = null;
    }
  }

  public dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLostBound);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestoredBound);

    const gl = this.gl;
    this.destroyBuffers();

    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.motionProgram) gl.deleteProgram(this.motionProgram);
    if (this.blockProgram) gl.deleteProgram(this.blockProgram);
    if (this.moshProgram) gl.deleteProgram(this.moshProgram);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);
  }
}
