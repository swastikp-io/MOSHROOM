import { computeMoshParameters, type MoshParameters } from './parameters.ts'
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
  onFpsUpdate?: (fps: number) => void
  onError?: (error: Error) => void
}

interface UniformLocations {
  [key: string]: WebGLUniformLocation | null
}

export class DatamoshRenderer {
  private canvas: HTMLCanvasElement
  private video: HTMLVideoElement
  private gl: WebGL2RenderingContext | null = null
  private onFpsUpdate?: (fps: number) => void
  private onError?: (error: Error) => void

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
  private moshAmount = 45
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

  constructor(options: RendererOptions) {
    this.canvas = options.canvas
    this.video = options.video
    this.onFpsUpdate = options.onFpsUpdate
    this.onError = options.onError
    this.params = computeMoshParameters(this.moshAmount)

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
      u_motion_threshold: gl.getUniformLocation(this.progMotion, 'u_motion_threshold'),
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
      u_chroma_offset: gl.getUniformLocation(this.progMosh, 'u_chroma_offset'),
    }

    this.uniformsDisplay = {
      u_texture: gl.getUniformLocation(this.progDisplay, 'u_texture'),
      u_canvas_aspect: gl.getUniformLocation(this.progDisplay, 'u_canvas_aspect'),
      u_video_aspect: gl.getUniformLocation(this.progDisplay, 'u_video_aspect'),
      u_flip_y: gl.getUniformLocation(this.progDisplay, 'u_flip_y'),
      u_flip_x: gl.getUniformLocation(this.progDisplay, 'u_flip_x'),
    }
  }

  private createTexture(
    width: number,
    height: number,
    minFilter: number = this.gl!.LINEAR,
    magFilter: number = this.gl!.LINEAR,
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
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
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

    // Render motion estimation at coarse macroblock grid (e.g. width / 8 by height / 8)
    this.motionWidth = Math.max(16, Math.round(width / 8))
    this.motionHeight = Math.max(9, Math.round(height / 8))

    this.deleteBuffers()

    // Camera textures
    this.texCurrCamera = this.createTexture(width, height)
    this.texPrevCamera = this.createTexture(width, height)
    this.fboPrevCamera = this.createFramebuffer(this.texPrevCamera)

    // Motion textures & FBOs with strict gl.NEAREST filtering for hard-edged block boundaries
    this.texMotion[0] = this.createTexture(this.motionWidth, this.motionHeight, gl.NEAREST, gl.NEAREST)
    this.texMotion[1] = this.createTexture(this.motionWidth, this.motionHeight, gl.NEAREST, gl.NEAREST)
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

    this.texCurrCamera = null
    this.texPrevCamera = null
    this.fboPrevCamera = null
    this.texMotion = [null, null]
    this.fboMotion = [null, null]
    this.texFeedback = [null, null]
    this.fboFeedback = [null, null]
  }

  public setMoshAmount(amount: number): void {
    this.moshAmount = amount
    this.params = computeMoshParameters(amount)
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

    // 1. Upload new video frame into texCurrCamera
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

    // First frame initialization: initialize feedback, prev camera, and motion ping-pong
    if (!this.hasInitializedFrames) {
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboFeedback[i])
        gl.viewport(0, 0, this.videoWidth, this.videoHeight)
        gl.useProgram(this.progCopy)
        gl.uniform1i(gl.getUniformLocation(this.progCopy!, 'u_texture'), 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)

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

    // Handle bypass (MOSHROOM AMOUNT == 0)
    if (this.params.bypass) {
      this.drawToScreen(this.texCurrCamera)
      this.copyCurrentToPrevCamera()
      return
    }

    // 2. PASS 1: Discrete Macroblock Matching Motion Estimation
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
    gl.uniform1f(this.uniformsMotion.u_zero_motion_bias, this.params.zeroMotionBias)
    gl.uniform1f(this.uniformsMotion.u_vector_momentum, this.params.vectorMomentum)
    gl.uniform1f(this.uniformsMotion.u_motion_threshold, this.params.motionThreshold)

    gl.drawArrays(gl.TRIANGLES, 0, 3)

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

    // Unit 3: Quantized motion texture (gl.NEAREST)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.texMotion[this.motionWrite])
    gl.uniform1i(this.uniformsMosh.u_motion_texture, 3)

    gl.uniform2f(this.uniformsMosh.u_resolution, this.videoWidth, this.videoHeight)
    gl.uniform1f(this.uniformsMosh.u_macroblock_size, this.params.macroblockSize)
    gl.uniform1f(this.uniformsMosh.u_displacement_scale, this.params.displacementScale)
    gl.uniform1f(this.uniformsMosh.u_feedback_retention, this.params.feedbackRetention)
    gl.uniform1f(this.uniformsMosh.u_decay, this.params.decayRate)
    gl.uniform1f(this.uniformsMosh.u_residual_blend, this.params.residualBlend)
    gl.uniform1f(this.uniformsMosh.u_residual_intensity, this.params.residualIntensity)
    gl.uniform1f(this.uniformsMosh.u_sub_partition_threshold, this.params.subPartitionThreshold)
    gl.uniform1f(this.uniformsMosh.u_intensity, this.params.intensity)
    gl.uniform1f(this.uniformsMosh.u_chroma_offset, this.params.chromaOffset)

    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 4. PASS 3: Display to canvas default framebuffer (with aspect-ratio cover)
    this.drawToScreen(this.texFeedback[this.feedbackWrite])

    // Update previous camera frame via GPU copy
    this.copyCurrentToPrevCamera()

    // Ping-pong swaps
    this.feedbackRead = 1 - this.feedbackRead
    this.feedbackWrite = 1 - this.feedbackWrite
    this.motionRead = 1 - this.motionRead
    this.motionWrite = 1 - this.motionWrite
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

    const canvasAspect = this.canvas.width / Math.max(1, this.canvas.height)
    const videoAspect = this.videoWidth / Math.max(1, this.videoHeight)

    gl.uniform1f(this.uniformsDisplay.u_canvas_aspect, canvasAspect)
    gl.uniform1f(this.uniformsDisplay.u_video_aspect, videoAspect)
    gl.uniform1f(this.uniformsDisplay.u_flip_y, this.flipY ? 1.0 : 0.0)
    gl.uniform1f(this.uniformsDisplay.u_flip_x, this.flipX ? 1.0 : 0.0)

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

    // Reset both feedback buffers with pristine current camera frame
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboFeedback[i])
      gl.viewport(0, 0, this.videoWidth, this.videoHeight)
      gl.useProgram(this.progCopy)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texCurrCamera)
      gl.uniform1i(gl.getUniformLocation(this.progCopy, 'u_texture'), 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

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
