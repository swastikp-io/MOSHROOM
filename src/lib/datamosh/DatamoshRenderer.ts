import { computeMoshParameters, applyAudioModulation, type MoshParameters } from './parameters.ts'
import type { AudioAnalyzer } from '../audio/AudioAnalyzer.ts'
import {
  VERTEX_SHADER,
  COPY_FRAGMENT_SHADER,
  MOTION_ESTIMATION_FRAGMENT_SHADER,
  DATAMOSH_FRAGMENT_SHADER,
  DISPLAY_FRAGMENT_SHADER,
} from './shaders.ts'

export interface RendererOptions {
  canvas: HTMLCanvasElement
  video: HTMLVideoElement
  audioAnalyzer?: AudioAnalyzer | null
  overlayVideo?: HTMLVideoElement | null
  onFpsUpdate?: (fps: number) => void
  onMoshIntensityUpdate?: (intensityPercent: number) => void
  onError?: (error: Error) => void
}

interface UniformLocations {
  [key: string]: WebGLUniformLocation | null
}

export class DatamoshRenderer {
  private canvas: HTMLCanvasElement
  private video: HTMLVideoElement
  private gl: WebGL2RenderingContext | null = null
  private audioAnalyzer: AudioAnalyzer | null = null
  private onFpsUpdate?: (fps: number) => void
  private onError?: (error: Error) => void

  // Video Overlay
  private overlayVideo: HTMLVideoElement | null = null
  private texOverlay: WebGLTexture | null = null
  private overlayWidth = 0
  private overlayHeight = 0
  private overlayBlendMode = 0
  private overlayOpacity = 0.85
  private lastOverlayVideoTime = -1

  // Shader Programs
  private progCopy: WebGLProgram | null = null
  private progMotion: WebGLProgram | null = null
  private progMosh: WebGLProgram | null = null
  private progDisplay: WebGLProgram | null = null

  // Uniform Location Caches
  private uniformsMotion: UniformLocations = {}
  private uniformsMosh: UniformLocations = {}
  private uniformsDisplay: UniformLocations = {}

  // VAO (required in WebGL2)
  private vao: WebGLVertexArrayObject | null = null
  private extColorBufferFloat: unknown = null

  // Textures
  private texCurrCamera: WebGLTexture | null = null
  private texPrevCamera: WebGLTexture | null = null
  private texMotion: [WebGLTexture | null, WebGLTexture | null] = [null, null]
  private texFeedback: [WebGLTexture | null, WebGLTexture | null] = [null, null]

  // Framebuffers
  private fboPrevCamera: WebGLFramebuffer | null = null
  private fboMotion: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null]
  private fboFeedback: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null]

  // Dimensions
  private videoWidth = 0
  private videoHeight = 0
  private motionWidth = 160
  private motionHeight = 90

  // Ping-pong indices
  private feedbackRead = 0
  private feedbackWrite = 1
  private motionRead = 0
  private motionWrite = 1

  // Parameters & Loop State
  private params: MoshParameters
  private isRunning = false
  private isContextLost = false
  private animFrameId: number | null = null
  private hasInitializedFrames = false

  // Orientation & Mirroring (default flipY=true fixes WebGL texture inversion; flipX=true provides selfie mirror)
  private flipY = true
  private flipX = true

  // FPS estimation
  private frameCount = 0
  private lastFpsTimestamp = 0
  private currentFps = 30

  // Hand Tracking State (Right Hand = Mosh Brush, Left Hand = Audio Reactivity)
  private moshHandActive = 0.0
  private moshHandPos: [number, number] = [0.5, 0.5]
  private moshHandVel: [number, number] = [0.0, 0.0]
  private moshHandRadius = 0.20
  private targetMoshHandActive = 0.0
  private targetMoshHandPos: [number, number] = [0.5, 0.5]
  private targetMoshHandVel: [number, number] = [0.0, 0.0]
  private targetMoshHandRadius = 0.20
  private audioReactivityGain = 1.0

  // Dynamic Hand & Audio-Driven Mosh Intensity
  private particleDisplacement = 25
  private effectiveMoshAmount = 0
  private leftHandHeight = 0
  private leftHandActive = false
  private onMoshIntensityUpdate?: (intensityPercent: number) => void
  private lastIntensityNotifyTime = 0
  private lastReportedIntensity = -1
  private lastVideoTime = -1

  constructor(options: RendererOptions) {
    this.canvas = options.canvas
    this.video = options.video
    this.audioAnalyzer = options.audioAnalyzer || null
    this.overlayVideo = options.overlayVideo || null
    this.onFpsUpdate = options.onFpsUpdate
    this.onMoshIntensityUpdate = options.onMoshIntensityUpdate
    this.onError = options.onError
    this.params = computeMoshParameters(65, null, this.particleDisplacement)

    this.onContextLost = this.onContextLost.bind(this)
    this.onContextRestored = this.onContextRestored.bind(this)
    this.renderLoop = this.renderLoop.bind(this)

    this.initWebGL()
  }

  private initWebGL(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })

    if (!gl) {
      const err = new Error('WebGL2 is not supported by your browser or graphics device.')
      this.onError?.(err)
      return false
    }

    this.gl = gl
    this.extColorBufferFloat = gl.getExtension('EXT_color_buffer_float')
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false)
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false)

    try {
      this.initShaders()
      this.vao = gl.createVertexArray()
      return true
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)))
      return false
    }
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl!
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Failed to create WebGL shader')

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Shader compilation error: ${info}`)
    }
    return shader
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl!
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource)
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource)

    const program = gl.createProgram()
    if (!program) throw new Error('Failed to create WebGL program')

    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    gl.deleteShader(vs)
    gl.deleteShader(fs)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Program link error: ${info}`)
    }
    return program
  }

  private initShaders(): void {
    const gl = this.gl!

    this.progCopy = this.createProgram(VERTEX_SHADER, COPY_FRAGMENT_SHADER)
    this.progMotion = this.createProgram(VERTEX_SHADER, MOTION_ESTIMATION_FRAGMENT_SHADER)
    this.progMosh = this.createProgram(VERTEX_SHADER, DATAMOSH_FRAGMENT_SHADER)
    this.progDisplay = this.createProgram(VERTEX_SHADER, DISPLAY_FRAGMENT_SHADER)

    // Cache uniform locations for motion estimation
    this.uniformsMotion = {
      u_curr_frame: gl.getUniformLocation(this.progMotion, 'u_curr_frame'),
      u_prev_frame: gl.getUniformLocation(this.progMotion, 'u_prev_frame'),
      u_prev_motion: gl.getUniformLocation(this.progMotion, 'u_prev_motion'),
      u_resolution: gl.getUniformLocation(this.progMotion, 'u_resolution'),
      u_texel_size: gl.getUniformLocation(this.progMotion, 'u_texel_size'),
      u_zero_motion_bias: gl.getUniformLocation(this.progMotion, 'u_zero_motion_bias'),
      u_vector_momentum: gl.getUniformLocation(this.progMotion, 'u_vector_momentum'),
      u_momentum_decay: gl.getUniformLocation(this.progMotion, 'u_momentum_decay'),
      u_advection_step: gl.getUniformLocation(this.progMotion, 'u_advection_step'),
      u_motion_threshold: gl.getUniformLocation(this.progMotion, 'u_motion_threshold'),
      u_audioTransient: gl.getUniformLocation(this.progMotion, 'u_audioTransient'),
      u_audioBass: gl.getUniformLocation(this.progMotion, 'u_audioBass'),
      u_audioMid: gl.getUniformLocation(this.progMotion, 'u_audioMid'),
      u_audioHigh: gl.getUniformLocation(this.progMotion, 'u_audioHigh'),
      u_moshHandActive: gl.getUniformLocation(this.progMotion, 'u_moshHandActive'),
      u_moshHandPos: gl.getUniformLocation(this.progMotion, 'u_moshHandPos'),
      u_moshHandVel: gl.getUniformLocation(this.progMotion, 'u_moshHandVel'),
      u_moshHandRadius: gl.getUniformLocation(this.progMotion, 'u_moshHandRadius'),
    }

    // Cache uniform locations for datamosh compositing
    this.uniformsMosh = {
      u_curr_frame: gl.getUniformLocation(this.progMosh, 'u_curr_frame'),
      u_prev_frame: gl.getUniformLocation(this.progMosh, 'u_prev_frame'),
      u_prev_feedback: gl.getUniformLocation(this.progMosh, 'u_prev_feedback'),
      u_motion_texture: gl.getUniformLocation(this.progMosh, 'u_motion_texture'),
      u_resolution: gl.getUniformLocation(this.progMosh, 'u_resolution'),
      u_macroblock_size: gl.getUniformLocation(this.progMosh, 'u_macroblock_size'),
      u_displacement_scale: gl.getUniformLocation(this.progMosh, 'u_displacement_scale'),
      u_feedback_retention: gl.getUniformLocation(this.progMosh, 'u_feedback_retention'),
      u_decay: gl.getUniformLocation(this.progMosh, 'u_decay'),
      u_residual_blend: gl.getUniformLocation(this.progMosh, 'u_residual_blend'),
      u_residual_intensity: gl.getUniformLocation(this.progMosh, 'u_residual_intensity'),
      u_sub_partition_threshold: gl.getUniformLocation(this.progMosh, 'u_sub_partition_threshold'),
      u_intensity: gl.getUniformLocation(this.progMosh, 'u_intensity'),
      u_edge_breakthrough: gl.getUniformLocation(this.progMosh, 'u_edge_breakthrough'),
      u_audioTransient: gl.getUniformLocation(this.progMosh, 'u_audioTransient'),
      u_audioBass: gl.getUniformLocation(this.progMosh, 'u_audioBass'),
      u_audioMid: gl.getUniformLocation(this.progMosh, 'u_audioMid'),
      u_audioHigh: gl.getUniformLocation(this.progMosh, 'u_audioHigh'),
      u_moshHandActive: gl.getUniformLocation(this.progMosh, 'u_moshHandActive'),
      u_moshHandPos: gl.getUniformLocation(this.progMosh, 'u_moshHandPos'),
      u_moshHandVel: gl.getUniformLocation(this.progMosh, 'u_moshHandVel'),
      u_moshHandRadius: gl.getUniformLocation(this.progMosh, 'u_moshHandRadius'),
    }

    this.uniformsDisplay = {
      u_texture: gl.getUniformLocation(this.progDisplay, 'u_texture'),
      u_canvas_aspect: gl.getUniformLocation(this.progDisplay, 'u_canvas_aspect'),
      u_video_aspect: gl.getUniformLocation(this.progDisplay, 'u_video_aspect'),
      u_flip_y: gl.getUniformLocation(this.progDisplay, 'u_flip_y'),
      u_flip_x: gl.getUniformLocation(this.progDisplay, 'u_flip_x'),
      u_overlay_texture: gl.getUniformLocation(this.progDisplay, 'u_overlay_texture'),
      u_overlay_active: gl.getUniformLocation(this.progDisplay, 'u_overlay_active'),
      u_overlay_opacity: gl.getUniformLocation(this.progDisplay, 'u_overlay_opacity'),
      u_overlay_blend_mode: gl.getUniformLocation(this.progDisplay, 'u_overlay_blend_mode'),
      u_overlay_aspect: gl.getUniformLocation(this.progDisplay, 'u_overlay_aspect'),
    }
  }

  private createTexture(
    width: number,
    height: number,
    minFilter: number = this.gl!.LINEAR,
    magFilter: number = this.gl!.LINEAR,
    internalFormat?: number,
    format?: number,
    type?: number,
  ): WebGLTexture {
    const gl = this.gl!
    const tex = gl.createTexture()
    if (!tex) throw new Error('Failed to create WebGL texture')

    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter)

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat ?? gl.RGBA8,
      width,
      height,
      0,
      format ?? gl.RGBA,
      type ?? gl.UNSIGNED_BYTE,
      null,
    )
    return tex
  }

  private createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl!
    const fbo = gl.createFramebuffer()
    if (!fbo) throw new Error('Failed to create framebuffer')

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    )

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return fbo
  }

  private setupBuffers(width: number, height: number): void {
    const gl = this.gl!
    if (!gl) return

    this.videoWidth = width
    this.videoHeight = height

    // Render motion estimation at coarse macroblock grid (strictly width / 16 by height / 16)
    this.motionWidth = Math.max(16, Math.floor(width / 16))
    this.motionHeight = Math.max(9, Math.floor(height / 16))

    this.deleteBuffers()

    // Camera textures
    this.texCurrCamera = this.createTexture(width, height)
    this.texPrevCamera = this.createTexture(width, height)
    this.fboPrevCamera = this.createFramebuffer(this.texPrevCamera)

    // Motion textures & FBOs with strict gl.NEAREST filtering for hard-edged block boundaries
    // Uses RGBA16F half-float precision if EXT_color_buffer_float is supported, falls back to RGBA8
    const motionInternal = this.extColorBufferFloat ? gl.RGBA16F : gl.RGBA8
    const motionType = this.extColorBufferFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE
    this.texMotion[0] = this.createTexture(this.motionWidth, this.motionHeight, gl.NEAREST, gl.NEAREST, motionInternal, gl.RGBA, motionType)
    this.texMotion[1] = this.createTexture(this.motionWidth, this.motionHeight, gl.NEAREST, gl.NEAREST, motionInternal, gl.RGBA, motionType)
    this.fboMotion[0] = this.createFramebuffer(this.texMotion[0])
    this.fboMotion[1] = this.createFramebuffer(this.texMotion[1])

    // Feedback ping-pong textures & FBOs
    this.texFeedback[0] = this.createTexture(width, height)
    this.texFeedback[1] = this.createTexture(width, height)
    this.fboFeedback[0] = this.createFramebuffer(this.texFeedback[0])
    this.fboFeedback[1] = this.createFramebuffer(this.texFeedback[1])

    this.hasInitializedFrames = false
  }

  private deleteBuffers(): void {
    const gl = this.gl
    if (!gl) return

    if (this.texCurrCamera) gl.deleteTexture(this.texCurrCamera)
    if (this.texPrevCamera) gl.deleteTexture(this.texPrevCamera)
    if (this.fboPrevCamera) gl.deleteFramebuffer(this.fboPrevCamera)

    this.texMotion.forEach((tex) => tex && gl.deleteTexture(tex))
    this.fboMotion.forEach((fbo) => fbo && gl.deleteFramebuffer(fbo))
    this.texFeedback.forEach((tex) => tex && gl.deleteTexture(tex))
    this.fboFeedback.forEach((fbo) => fbo && gl.deleteFramebuffer(fbo))

    if (this.texOverlay) {
      gl.deleteTexture(this.texOverlay)
      this.texOverlay = null
      this.overlayWidth = 0
      this.overlayHeight = 0
      this.lastOverlayVideoTime = -1
    }

    this.texCurrCamera = null
    this.texPrevCamera = null
    this.fboPrevCamera = null
    this.texMotion = [null, null]
    this.fboMotion = [null, null]
    this.texFeedback = [null, null]
    this.fboFeedback = [null, null]
  }

  public setMoshAmount(amount: number): void {
    this.effectiveMoshAmount = amount
    this.params = computeMoshParameters(amount, null, this.particleDisplacement)
  }

  public setParticleDisplacement(displacement: number): void {
    this.particleDisplacement = Math.max(0, Math.min(100, displacement))
    this.params = computeMoshParameters(this.effectiveMoshAmount, null, this.particleDisplacement)
  }

  public getParticleDisplacement(): number {
    return this.particleDisplacement
  }

  public getEffectiveMoshAmount(): number {
    return Math.round(this.effectiveMoshAmount)
  }

  public getParams(): MoshParameters {
    return this.params
  }

  public setAudioAnalyzer(analyzer: AudioAnalyzer | null): void {
    this.audioAnalyzer = analyzer
  }

  public start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.lastFpsTimestamp = performance.now()
    this.frameCount = 0
    this.animFrameId = requestAnimationFrame(this.renderLoop)
  }

  public stop(): void {
    this.isRunning = false
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  private renderLoop(timestamp: number): void {
    if (!this.isRunning) return

    // Rolling FPS tracking
    this.frameCount++
    if (timestamp - this.lastFpsTimestamp >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (timestamp - this.lastFpsTimestamp))
      this.onFpsUpdate?.(this.currentFps)
      this.frameCount = 0
      this.lastFpsTimestamp = timestamp
    }

    if (!this.isContextLost && this.gl && this.video.readyState >= 2) {
      const vWidth = this.video.videoWidth
      const vHeight = this.video.videoHeight

      if (vWidth > 0 && vHeight > 0) {
        if (vWidth !== this.videoWidth || vHeight !== this.videoHeight) {
          this.setupBuffers(vWidth, vHeight)
        }
        this.renderFrame()
      }
    }

    this.animFrameId = requestAnimationFrame(this.renderLoop)
  }

  private renderFrame(): void {
    const gl = this.gl!
    if (
      !gl ||
      !this.texCurrCamera ||
      !this.texPrevCamera ||
      !this.texFeedback[0] ||
      !this.texFeedback[1] ||
      !this.texMotion[0] ||
      !this.texMotion[1] ||
      !this.progDisplay
    ) {
      return
    }

    gl.bindVertexArray(this.vao)

    const isNewCameraFrame = (this.video.currentTime !== this.lastVideoTime) && (this.video.readyState >= 2)

    if (isNewCameraFrame) {
      this.lastVideoTime = this.video.currentTime

      // 1. Upload new video frame into texCurrCamera using preallocated texture
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texCurrCamera)
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.video,
      )

      // First frame initialization: initialize feedback, prev camera, and motion ping-pong
      if (!this.hasInitializedFrames) {
        for (let i = 0; i < 2; i++) {
          // Initialize feedback buffers to zero contamination (alpha = 0.0)
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboFeedback[i])
          gl.viewport(0, 0, this.videoWidth, this.videoHeight)
          gl.clearColor(0.0, 0.0, 0.0, 0.0)
          gl.clear(gl.COLOR_BUFFER_BIT)

          // Clear motion textures to neutral zero motion (0.5, 0.5, 0.0, 0.0)
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMotion[i])
          gl.viewport(0, 0, this.motionWidth, this.motionHeight)
          gl.clearColor(0.5, 0.5, 0.0, 0.0)
          gl.clear(gl.COLOR_BUFFER_BIT)
        }

        // Initialize prev camera texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrevCamera)
        gl.viewport(0, 0, this.videoWidth, this.videoHeight)
        gl.useProgram(this.progCopy)
        gl.uniform1i(gl.getUniformLocation(this.progCopy!, 'u_texture'), 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        this.hasInitializedFrames = true
      }
    }

    // Smoothly interpolate hand tracking parameters to prevent discrete pops
    this.moshHandActive += (this.targetMoshHandActive - this.moshHandActive) * 0.45
    this.moshHandPos[0] += (this.targetMoshHandPos[0] - this.moshHandPos[0]) * 0.45
    this.moshHandPos[1] += (this.targetMoshHandPos[1] - this.moshHandPos[1]) * 0.45
    this.moshHandVel[0] += (this.targetMoshHandVel[0] - this.moshHandVel[0]) * 0.45
    this.moshHandVel[1] += (this.targetMoshHandVel[1] - this.moshHandVel[1]) * 0.45
    this.moshHandRadius += (this.targetMoshHandRadius - this.moshHandRadius) * 0.35

    // Read audio metrics
    let audioBass = 0.0
    let audioMid = 0.0
    let audioHigh = 0.0
    let audioTransient = 0.0
    let isAudioPlaying = false
    let rawAudioMetrics = { bass: 0, mid: 0, high: 0, transient: 0, isPlaying: false }

    if (this.audioAnalyzer) {
      rawAudioMetrics = this.audioAnalyzer.getMetrics()
      isAudioPlaying = rawAudioMetrics.isPlaying
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DYNAMIC MOSH INTENSITY CALCULATION:
    // Derives moshAmount directly from Left Hand height + audio and Right Hand motion
    // ═══════════════════════════════════════════════════════════════════════════

    // 1. Right Hand Active (Mosh Brush Gesture):
    // Open right hand provides automatic baseline mosh intensity (60 to 75 scaled by movement/openness)
    let rightHandBaseline = 0
    if (this.targetMoshHandActive > 0.05) {
      const rSpeed = Math.hypot(this.moshHandVel[0], this.moshHandVel[1])
      rightHandBaseline = Math.min(85, 62 + rSpeed * 28)
    }

    // 2. Left Hand Active (Audio Playback & Mosh Intensity Controller):
    let leftHandMosh = 0
    if (this.leftHandActive) {
      const audioEnergy = Math.min(1.0, rawAudioMetrics.bass * 0.65 + rawAudioMetrics.transient * 0.85)
      const audioDrivenMosh = (this.leftHandHeight * 55) + (audioEnergy * 45 * this.leftHandHeight)
      const leftBaseline = this.leftHandHeight * 50
      leftHandMosh = Math.max(leftBaseline, audioDrivenMosh)
    }

    // Combined target mosh amount
    const targetMosh = Math.min(100, Math.max(rightHandBaseline, leftHandMosh))

    // Smoothly interpolate effectiveMoshAmount: fast attack, smooth decay
    if (targetMosh > this.effectiveMoshAmount) {
      this.effectiveMoshAmount += (targetMosh - this.effectiveMoshAmount) * 0.28
    } else {
      this.effectiveMoshAmount += (targetMosh - this.effectiveMoshAmount) * 0.05
    }

    // Notify UI of live mosh intensity (throttled to ~180ms and only on value change)
    const nowMs = performance.now()
    if (nowMs - this.lastIntensityNotifyTime > 180) {
      const rounded = Math.round(this.effectiveMoshAmount)
      if (rounded !== this.lastReportedIntensity) {
        this.lastReportedIntensity = rounded
        this.lastIntensityNotifyTime = nowMs
        this.onMoshIntensityUpdate?.(rounded)
      }
    }

    // Compute parameters dynamically from effectiveMoshAmount and particleDisplacement slider
    let currentParams = computeMoshParameters(
      this.effectiveMoshAmount,
      isAudioPlaying ? rawAudioMetrics : null,
      this.particleDisplacement,
    )

    // Ensure 100% permanent freeze retention when idling or decaying (0 healing)
    // Smeared pixels stay permanently frozen until RESTORE is clicked or new motion sweeps over them
    if (this.effectiveMoshAmount > 0 || !this.targetMoshHandActive) {
      currentParams = {
        ...currentParams,
        bypass: false,
        feedbackRetention: 1.0,
        decayRate: 0.0,
        residualBlend: 0.0,
      }
    }

    if (isAudioPlaying) {
      const gain = this.audioReactivityGain
      const scaledMetrics = {
        bass: Math.min(1.0, rawAudioMetrics.bass * gain),
        mid: Math.min(1.0, rawAudioMetrics.mid * gain),
        high: Math.min(1.0, rawAudioMetrics.high * gain),
        transient: Math.min(1.0, rawAudioMetrics.transient * gain),
        isPlaying: true,
      }
      currentParams = applyAudioModulation(currentParams, scaledMetrics)
      audioBass = scaledMetrics.bass
      audioMid = scaledMetrics.mid
      audioHigh = scaledMetrics.high
      audioTransient = scaledMetrics.transient
    }

    this.params = currentParams

    // 2. PASS 1: Discrete Macroblock Matching Motion Estimation
    // Execute ONLY when a new webcam frame has arrived to conserve GPU bandwidth
    if (isNewCameraFrame) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMotion[this.motionWrite])
      gl.viewport(0, 0, this.motionWidth, this.motionHeight)
      gl.useProgram(this.progMotion)

      // Current camera (unit 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texCurrCamera)
      gl.uniform1i(this.uniformsMotion.u_curr_frame, 0)

      // Previous camera (unit 1)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.texPrevCamera)
      gl.uniform1i(this.uniformsMotion.u_prev_frame, 1)

      // Previous motion texture (unit 2) for temporal vector momentum (P-frame bloom)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, this.texMotion[this.motionRead])
      gl.uniform1i(this.uniformsMotion.u_prev_motion, 2)

      gl.uniform2f(this.uniformsMotion.u_resolution, this.motionWidth, this.motionHeight)
      gl.uniform2f(this.uniformsMotion.u_texel_size, 1.0 / this.motionWidth, 1.0 / this.motionHeight)
      gl.uniform1f(this.uniformsMotion.u_zero_motion_bias, currentParams.zeroMotionBias)
      gl.uniform1f(this.uniformsMotion.u_vector_momentum, currentParams.vectorMomentum)
      gl.uniform1f(this.uniformsMotion.u_momentum_decay, currentParams.momentumDecay)
      gl.uniform1f(this.uniformsMotion.u_advection_step, currentParams.advectionStep)
      gl.uniform1f(this.uniformsMotion.u_motion_threshold, currentParams.motionThreshold)
      gl.uniform1f(this.uniformsMotion.u_audioTransient, audioTransient)
      gl.uniform1f(this.uniformsMotion.u_audioBass, audioBass)
      gl.uniform1f(this.uniformsMotion.u_audioMid, audioMid)
      gl.uniform1f(this.uniformsMotion.u_audioHigh, audioHigh)
      gl.uniform1f(this.uniformsMotion.u_moshHandActive, this.moshHandActive)
      gl.uniform2f(this.uniformsMotion.u_moshHandPos, this.moshHandPos[0], this.moshHandPos[1])
      gl.uniform2f(this.uniformsMotion.u_moshHandVel, this.moshHandVel[0], this.moshHandVel[1])
      gl.uniform1f(this.uniformsMotion.u_moshHandRadius, this.moshHandRadius)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // Update previous camera frame via GPU copy
      this.copyCurrentToPrevCamera()

      // Swap motion ping-pong so motionRead points to the fresh motion texture
      this.motionRead = 1 - this.motionRead
      this.motionWrite = 1 - this.motionWrite
    }

    // 3. PASS 2: Macroblock Datamoshing & P-Frame Displacement Feedback
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboFeedback[this.feedbackWrite])
    gl.viewport(0, 0, this.videoWidth, this.videoHeight)
    gl.useProgram(this.progMosh)

    // Unit 0: Current camera frame
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texCurrCamera)
    gl.uniform1i(this.uniformsMosh.u_curr_frame, 0)

    // Unit 1: Previous camera frame (for P-frame high-frequency difference residual)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texPrevCamera)
    gl.uniform1i(this.uniformsMosh.u_prev_frame, 1)

    // Unit 2: Previous feedback frame
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.texFeedback[this.feedbackRead])
    gl.uniform1i(this.uniformsMosh.u_prev_feedback, 2)

    // Unit 3: Quantized motion texture (gl.NEAREST) - reads latest computed motion field
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.texMotion[this.motionRead])
    gl.uniform1i(this.uniformsMosh.u_motion_texture, 3)

    gl.uniform2f(this.uniformsMosh.u_resolution, this.videoWidth, this.videoHeight)
    gl.uniform1f(this.uniformsMosh.u_macroblock_size, currentParams.macroblockSize)
    gl.uniform1f(this.uniformsMosh.u_displacement_scale, currentParams.displacementScale)
    gl.uniform1f(this.uniformsMosh.u_feedback_retention, currentParams.feedbackRetention)
    gl.uniform1f(this.uniformsMosh.u_decay, currentParams.decayRate)
    gl.uniform1f(this.uniformsMosh.u_residual_blend, currentParams.residualBlend)
    gl.uniform1f(this.uniformsMosh.u_residual_intensity, currentParams.residualIntensity)
    gl.uniform1f(this.uniformsMosh.u_sub_partition_threshold, currentParams.subPartitionThreshold)
    gl.uniform1f(this.uniformsMosh.u_intensity, currentParams.intensity)
    gl.uniform1f(this.uniformsMosh.u_edge_breakthrough, currentParams.edgeBreakthrough)
    gl.uniform1f(this.uniformsMosh.u_audioTransient, audioTransient)
    gl.uniform1f(this.uniformsMosh.u_audioBass, audioBass)
    gl.uniform1f(this.uniformsMosh.u_audioMid, audioMid)
    gl.uniform1f(this.uniformsMosh.u_audioHigh, audioHigh)
    gl.uniform1f(this.uniformsMosh.u_moshHandActive, this.moshHandActive)
    gl.uniform2f(this.uniformsMosh.u_moshHandPos, this.moshHandPos[0], this.moshHandPos[1])
    gl.uniform2f(this.uniformsMosh.u_moshHandVel, this.moshHandVel[0], this.moshHandVel[1])
    gl.uniform1f(this.uniformsMosh.u_moshHandRadius, this.moshHandRadius)

    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 4. PASS 3: Display to canvas default framebuffer (with aspect-ratio cover)
    this.drawToScreen(this.texFeedback[this.feedbackWrite])

    // Ping-pong swaps for feedback
    this.feedbackRead = 1 - this.feedbackRead
    this.feedbackWrite = 1 - this.feedbackWrite
  }

  private drawToScreen(sourceTexture: WebGLTexture | null): void {
    if (!sourceTexture) return
    const gl = this.gl!
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.progDisplay)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
    gl.uniform1i(this.uniformsDisplay.u_texture, 0)

    let overlayActive = 0
    let overlayAspect = 1.0

    if (
      this.overlayVideo &&
      this.overlayVideo.readyState >= 2 &&
      this.overlayVideo.videoWidth > 0 &&
      this.overlayVideo.videoHeight > 0
    ) {
      const oW = this.overlayVideo.videoWidth
      const oH = this.overlayVideo.videoHeight
      overlayAspect = oW / oH

      if (!this.texOverlay || this.overlayWidth !== oW || this.overlayHeight !== oH) {
        if (this.texOverlay) {
          gl.deleteTexture(this.texOverlay)
        }
        this.texOverlay = this.createTexture(oW, oH, gl.LINEAR, gl.LINEAR)
        this.overlayWidth = oW
        this.overlayHeight = oH
        this.lastOverlayVideoTime = -1
      }

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.texOverlay)

      if (this.overlayVideo.currentTime !== this.lastOverlayVideoTime) {
        this.lastOverlayVideoTime = this.overlayVideo.currentTime
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          this.overlayVideo,
        )
      }

      overlayActive = 1
    } else {
      gl.activeTexture(gl.TEXTURE1)
      if (this.texOverlay) {
        gl.bindTexture(gl.TEXTURE_2D, this.texOverlay)
      }
    }

    const canvasAspect = this.canvas.width / Math.max(1, this.canvas.height)
    const videoAspect = this.videoWidth / Math.max(1, this.videoHeight)

    gl.uniform1f(this.uniformsDisplay.u_canvas_aspect, canvasAspect)
    gl.uniform1f(this.uniformsDisplay.u_video_aspect, videoAspect)
    gl.uniform1f(this.uniformsDisplay.u_flip_y, this.flipY ? 1.0 : 0.0)
    gl.uniform1f(this.uniformsDisplay.u_flip_x, this.flipX ? 1.0 : 0.0)

    gl.uniform1i(this.uniformsDisplay.u_overlay_texture, 1)
    gl.uniform1i(this.uniformsDisplay.u_overlay_active, overlayActive)
    gl.uniform1f(this.uniformsDisplay.u_overlay_opacity, this.overlayOpacity)
    gl.uniform1i(this.uniformsDisplay.u_overlay_blend_mode, this.overlayBlendMode)
    gl.uniform1f(this.uniformsDisplay.u_overlay_aspect, overlayAspect)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  public setFlip(flipY: boolean, flipX: boolean): void {
    this.flipY = flipY
    this.flipX = flipX
  }

  public toggleMirror(): boolean {
    this.flipX = !this.flipX
    return this.flipX
  }

  public toggleFlipY(): boolean {
    this.flipY = !this.flipY
    return this.flipY
  }

  public isMirrored(): boolean {
    return this.flipX
  }

  public isFlippedY(): boolean {
    return this.flipY
  }

  public setMoshHand(
    active: boolean,
    pos: [number, number],
    vel: [number, number],
    radius = 0.20,
  ): void {
    this.targetMoshHandActive = active ? 1.0 : 0.0
    this.targetMoshHandPos = [pos[0], pos[1]]
    this.targetMoshHandVel = [vel[0], vel[1]]
    this.targetMoshHandRadius = radius
  }

  public setLeftHand(active: boolean, height: number): void {
    this.leftHandActive = active
    this.leftHandHeight = Math.max(0.0, Math.min(1.0, height))
  }

  public setAudioReactivityGain(gain: number): void {
    this.audioReactivityGain = Math.max(0.1, Math.min(3.0, gain))
  }

  public getAudioReactivityGain(): number {
    return this.audioReactivityGain
  }

  public setOverlayVideo(video: HTMLVideoElement | null): void {
    this.overlayVideo = video
    this.lastOverlayVideoTime = -1
    if (!video && this.gl && this.texOverlay) {
      this.gl.deleteTexture(this.texOverlay)
      this.texOverlay = null
      this.overlayWidth = 0
      this.overlayHeight = 0
    }
  }

  public setOverlayBlendMode(mode: number): void {
    this.overlayBlendMode = mode
  }

  public setOverlayOpacity(opacity: number): void {
    this.overlayOpacity = Math.max(0.0, Math.min(1.0, opacity))
  }

  public getOverlayBlendMode(): number {
    return this.overlayBlendMode
  }

  public getOverlayOpacity(): number {
    return this.overlayOpacity
  }

  public resetFeedback(): void {
    const gl = this.gl
    if (
      !gl ||
      !this.texCurrCamera ||
      !this.fboFeedback[0] ||
      !this.fboFeedback[1] ||
      !this.fboMotion[0] ||
      !this.fboMotion[1] ||
      !this.fboPrevCamera ||
      !this.progCopy
    ) {
      return
    }

    // If video is active and ready, upload latest frame into texCurrCamera
    if (this.video.readyState >= 2 && this.videoWidth > 0 && this.videoHeight > 0) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texCurrCamera)
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.videoWidth,
        this.videoHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.video,
      )
    }

    gl.bindVertexArray(this.vao)

    // Reset both feedback buffers to zero contamination (alpha = 0.0)
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboFeedback[i])
      gl.viewport(0, 0, this.videoWidth, this.videoHeight)
      gl.clearColor(0.0, 0.0, 0.0, 0.0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // Clear motion textures to neutral zero motion (0.5, 0.5, 0.0, 0.0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMotion[i])
      gl.viewport(0, 0, this.motionWidth, this.motionHeight)
      gl.clearColor(0.5, 0.5, 0.0, 0.0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    // Reset prev camera texture with current camera
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrevCamera)
    gl.viewport(0, 0, this.videoWidth, this.videoHeight)
    gl.useProgram(this.progCopy)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texCurrCamera)
    gl.uniform1i(gl.getUniformLocation(this.progCopy, 'u_texture'), 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Reset ping-pong indices
    this.feedbackRead = 0
    this.feedbackWrite = 1
    this.motionRead = 0
    this.motionWrite = 1

    // Immediately present the clean frame on screen
    this.drawToScreen(this.texCurrCamera)
  }

  private copyCurrentToPrevCamera(): void {
    const gl = this.gl!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrevCamera)
    gl.viewport(0, 0, this.videoWidth, this.videoHeight)
    gl.useProgram(this.progCopy)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texCurrCamera)
    gl.uniform1i(gl.getUniformLocation(this.progCopy!, 'u_texture'), 0)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private onContextLost(event: Event): void {
    event.preventDefault()
    this.isContextLost = true
    this.deleteBuffers()
  }

  private onContextRestored(): void {
    this.isContextLost = false
    this.initWebGL()
    if (this.videoWidth > 0 && this.videoHeight > 0) {
      this.setupBuffers(this.videoWidth, this.videoHeight)
    }
  }

  public resizeCanvas(displayRatio = window.devicePixelRatio || 1): void {
    const rect = this.canvas.getBoundingClientRect()
    const targetWidth = Math.max(1, Math.round(rect.width * displayRatio))
    const targetHeight = Math.max(1, Math.round(rect.height * displayRatio))

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth
      this.canvas.height = targetHeight
    }
  }

  public destroy(): void {
    this.stop()

    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)

    this.deleteBuffers()

    if (this.texOverlay && this.gl) {
      this.gl.deleteTexture(this.texOverlay)
      this.texOverlay = null
    }
    this.overlayVideo = null

    const gl = this.gl
    if (gl) {
      if (this.vao) gl.deleteVertexArray(this.vao)
      if (this.progCopy) gl.deleteProgram(this.progCopy)
      if (this.progMotion) gl.deleteProgram(this.progMotion)
      if (this.progMosh) gl.deleteProgram(this.progMosh)
      if (this.progDisplay) gl.deleteProgram(this.progDisplay)
    }

    this.gl = null
  }
}
