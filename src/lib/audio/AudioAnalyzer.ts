export interface AudioMetrics {
  bass: number
  mid: number
  high: number
  transient: number
  isPlaying: boolean
}

export class AudioAnalyzer {
  private audio: HTMLAudioElement | null = null
  private audioCtx: AudioContext | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null
  private objectUrl: string | null = null

  // Smoothing & Transient state
  private emaBass = 0
  private transient = 0
  private isLooping = false
  private isPlayingState = false

  // Pre-calculated FFT bin ranges
  private minBassBin = 1
  private maxBassBin = 4
  private minMidBin = 5
  private maxMidBin = 47
  private minHighBin = 58
  private maxHighBin = 232

  constructor() {
    this.initAudioNodes()
  }

  private initAudioNodes(): void {
    if (typeof window === 'undefined') return

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

    if (!AudioContextClass) return

    try {
      this.audio = new Audio()
      this.audio.crossOrigin = 'anonymous'
      this.audio.preload = 'auto'
      this.audio.loop = this.isLooping

      this.audio.addEventListener('play', () => {
        this.isPlayingState = true
      })
      this.audio.addEventListener('pause', () => {
        this.isPlayingState = false
      })
      this.audio.addEventListener('ended', () => {
        if (!this.audio?.loop) {
          this.isPlayingState = false
        }
      })

      this.audioCtx = new AudioContextClass()
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.75

      // Pre-allocate typed array once during initialization (zero allocations inside render loop)
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)

      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio)
      this.sourceNode.connect(this.analyser)
      this.analyser.connect(this.audioCtx.destination)

      this.updateBinRanges()
    } catch {
      // AudioContext may be restricted until user gesture; nodes will initialize or resume on demand
    }
  }

  private updateBinRanges(): void {
    if (!this.analyser || !this.audioCtx) return

    const binCount = this.analyser.frequencyBinCount
    const sampleRate = this.audioCtx.sampleRate || 44100
    const binWidth = sampleRate / this.analyser.fftSize // ~43.07 Hz for 44.1kHz

    // Low bins (~20–150 Hz): skip bin 0 (DC rumble)
    this.minBassBin = Math.max(1, Math.floor(20 / binWidth))
    this.maxBassBin = Math.min(binCount - 1, Math.ceil(150 / binWidth))

    // Mid bins (~200–2000 Hz)
    this.minMidBin = Math.max(this.maxBassBin + 1, Math.floor(200 / binWidth))
    this.maxMidBin = Math.min(binCount - 1, Math.ceil(2000 / binWidth))

    // High bins (~2500–10000 Hz)
    this.minHighBin = Math.max(this.maxMidBin + 1, Math.floor(2500 / binWidth))
    this.maxHighBin = Math.min(binCount - 1, Math.ceil(10000 / binWidth))
  }

  public async loadFile(file: File): Promise<void> {
    if (!this.audio || !this.audioCtx) {
      this.initAudioNodes()
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }

    this.objectUrl = URL.createObjectURL(file)

    if (this.audio) {
      this.audio.src = this.objectUrl
      this.audio.load()
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume()
      } catch {
        // Will resume on play()
      }
    }

    this.emaBass = 0
    this.transient = 0
  }

  public async play(): Promise<void> {
    if (!this.audio) return

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume()
      } catch {
        // Continue attempting to play
      }
    }

    try {
      await this.audio.play()
      this.isPlayingState = true
    } catch (err) {
      this.isPlayingState = false
      throw err
    }
  }

  public pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause()
    }
    this.isPlayingState = false
  }

  public stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.currentTime = 0
    }
    this.isPlayingState = false
    this.emaBass = 0
    this.transient = 0
  }

  public setLoop(loop: boolean): void {
    this.isLooping = loop
    if (this.audio) {
      this.audio.loop = loop
    }
  }

  public getIsLooping(): boolean {
    return this.isLooping
  }

  public getIsPlaying(): boolean {
    return this.isPlayingState && !!this.audio && !this.audio.paused && !this.audio.ended
  }

  public getAudioElement(): HTMLAudioElement | null {
    return this.audio
  }

  /**
   * Called once per render frame. Computes normalized 0.0 - 1.0 metrics:
   *  - bass: Low frequency energy (~20–150 Hz) shaped by Math.pow(val, 1.4)
   *  - mid: Mid frequency energy (~200–2000 Hz)
   *  - high: High frequency energy (~2500–10000 Hz)
   *  - transient: Beat/onset detector from positive delta of bass with fast attack & exponential decay (~0.88)
   */
  public getMetrics(): AudioMetrics {
    const isPlaying = this.getIsPlaying()

    if (!isPlaying || !this.analyser || !this.freqData) {
      this.transient *= 0.88
      if (this.transient < 0.001) this.transient = 0
      return {
        bass: 0,
        mid: 0,
        high: 0,
        transient: this.transient,
        isPlaying: false,
      }
    }

    // Populate pre-allocated buffer with current frequency domain data
    this.analyser.getByteFrequencyData(this.freqData)

    // 1. Bass Energy (~20–150 Hz)
    let bassSum = 0
    let bassCount = 0
    for (let i = this.minBassBin; i <= this.maxBassBin; i++) {
      bassSum += this.freqData[i]
      bassCount++
    }
    const rawBass = bassCount > 0 ? (bassSum / bassCount) / 255.0 : 0
    // Shape with power curve so quiet rumble doesn't over-trigger
    const bass = Math.min(1.0, Math.max(0.0, Math.pow(rawBass, 1.4)))

    // 2. Mid Energy (~200–2000 Hz)
    let midSum = 0
    let midCount = 0
    for (let i = this.minMidBin; i <= this.maxMidBin; i++) {
      midSum += this.freqData[i]
      midCount++
    }
    const mid = midCount > 0 ? Math.min(1.0, Math.max(0.0, (midSum / midCount) / 255.0)) : 0

    // 3. High Energy (~2500–10000 Hz)
    let highSum = 0
    let highCount = 0
    for (let i = this.minHighBin; i <= this.maxHighBin; i++) {
      highSum += this.freqData[i]
      highCount++
    }
    const high = highCount > 0 ? Math.min(1.0, Math.max(0.0, (highSum / highCount) / 255.0)) : 0

    // 4. Transient / Beat Onset Detector
    // Calculated from positive delta of bass (Math.max(0, currentBass - emaBass))
    const delta = Math.max(0, bass - this.emaBass)
    // Update EMA baseline
    this.emaBass = this.emaBass * 0.90 + bass * 0.10

    // Fast attack & exponential decay (~0.88 per frame) to catch kick and snare hits cleanly
    const targetTransient = Math.min(1.0, delta * 3.2)
    if (targetTransient > this.transient) {
      this.transient = targetTransient
    } else {
      this.transient *= 0.88
    }

    return {
      bass,
      mid,
      high,
      transient: this.transient,
      isPlaying: true,
    }
  }

  public destroy(): void {
    this.stop()

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect()
      } catch {
        // Ignored
      }
      this.sourceNode = null
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect()
      } catch {
        // Ignored
      }
      this.analyser = null
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close()
      } catch {
        // Ignored
      }
      this.audioCtx = null
    }

    if (this.audio) {
      this.audio.src = ''
      this.audio = null
    }

    this.freqData = null
  }
}
