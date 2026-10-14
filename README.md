# MOSHROOM — Real-Time Video Deformation

Experimental real-time video instrument that turns a live camera feed into a continuously deforming, melting, pixel-smearing image using GPU-based temporal feedback and true discrete macroblock-matching P-frame displacement.

## Overview

Classic datamoshing manipulates inter-frame prediction in compressed video streams (such as dropping I-frames to force P-frames to apply motion vectors to historical picture data). Rather than relying on smooth optical flow gradients that produce water-ripple distortions, **MOSHROOM** implements a discrete, grid-bound GPU pipeline in WebGL2 that matches authentic MPEG-4 / H.264 compression artifacts:

- **Discrete Block-Matching Motion Estimation (SAD)**: A coarse macroblock grid FBO (`width / 8` by `height / 8`) evaluates 3x3 structural luminance patterns per macroblock cell and performs neighborhood search to minimize the **Sum of Absolute Differences (SAD)**.
- **Strict `gl.NEAREST` Motion Texture Filtering**: Motion textures are configured with `gl.NEAREST` filtering. Every pixel within an 8x8 or 16x16 block receives the exact same motion vector without bilinear smoothing.
- **Zero-Motion Noise Gate**: A cost penalty is applied to non-zero displacements so webcam sensor grain in dark or stationary backgrounds locks firmly to `(0.0, 0.0)`.
- **Temporal Vector Momentum (P-Frame Bloom)**: Ping-pong motion FBOs store motion history. At high MOSHROOM AMOUNT (>70), momentum carries vectors across multiple frames so a rapid hand swipe continues pushing macroblocks across the screen even after motion ceases.
- **Sub-Block Quantization Jitter**: Dynamically subdivides 16x16 macroblocks into 8x8 blocks on fast-moving edges (simulating H.264 adaptive partition modes).
- **Authentic P-Frame Residual Bleeding**: Computes the high-frequency camera difference (`currentCam - prevCam`) and injects a quantized, posterized residual into displaced feedback pixels for raw, crunchy MPEG color-block contamination.
- **4:2:0 Chroma Subsampling Displacement**: Displaces YCbCr chroma planes on coarser block grids than luminance, creating characteristic detached color-block tears.

## Single Control

- **MOSH AMOUNT (0 – 100, default 45)**: Single continuous control that nonlinearly derives macroblock dimensions, vector momentum, displacement scale, feedback retention, and residual bleeding:
  - **0**: Clean bypass (acts as an immediate I-frame reset to 100% clean live video).
  - **1 – 24**: Healing range. Gradual recovery and decay are active so lowering the slider smoothly heals and restores the image.
  - **25 – 100**: True I-frame starvation. **Zero background healing (`decayRate = 0.0`, `baseLeak = 0.0`)**. Smeared pixels freeze permanently on screen until new motion pushes them again. Higher values scale up displacement travel, vector momentum (bloom), macroblock size (12px to 24px), and compressed P-frame edge residuals.

## Technology Stack

- React 19 + TypeScript
- Vite + Tailwind CSS v4
- WebGL2 + GLSL ES 3.00 fragment & vertex shaders
- Lucide React (monochromatic icons)

## Getting Started

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Test Suite
```bash
npm test
```

### Linting
```bash
npm run lint
```

## Hardware and Browser Requirements

- Requires a modern browser with **WebGL2** support (Chrome, Edge, Firefox, Safari 15+).
- Requires a video capture device (webcam). Browser camera permission must be granted.
