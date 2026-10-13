# MOSHROOM

> **Real-time webcam datamosh & painterly glitch-art playground** inspired by damaged analog video, broken digital compression footage, pixel displacement, and painterly motion artifacts.

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **Lucide React**, and a custom **WebGL2 & GLSL ES 3.00** multi-pass GPU rendering engine.

---

## 🎛️ Complete Parameter Panel Specification

Every control is wired directly to real GPU shader uniforms or native MediaStream renderer properties:

### 1. Input Controls
- **Camera Device Selector**: Enumerate and switch between any physical webcam or the built-in synthetic test subject.
- **Input Resolution**: Request explicit native camera resolutions (`480p`, `720p`, `1080p`, or `default`).
- **Mirror Camera**: Horizontal flip toggle via vertex shader (`u_mirror`).

### 2. Datamosh Controls
- **Master Intensity (0–100%)**: Global scalar across all optical vectors, block displacement, and spatial shear.
- **Temporal Feedback (0–100%)**: Persistence of warped previous frames in ping-pong accumulation buffers.
- **Block Size (2–40px)**: Macroblock tile quantization grid.
- **Displacement Strength (0–100%)**: Magnitude of irregular block offsets.
- **Motion Sensitivity (0–100%)**: Movement activation threshold.
- **Smear Length (0–100%)**: Optical flow smearing along motion vectors.
- **Corruption Frequency (0–100%)**: Transport stream packet dropouts.
- **Color Quantization (2–32 levels)**: Bayer-dithered compression posterization.
- **RGB Separation (0–100%)**: Non-linear channel prism displacement.
- **Internal Resolution Scale (10–100%)**: Scaled intermediate processing FBO resolution independent of canvas output.

### 3. Image Controls
- **Saturation (0–200%)**: Luma/chroma color saturation adjustment.
- **Contrast (0.5x–2.5x)**: S-curve tonal contrast.
- **Brightness (50–150%)**: Linear exposure luminance scaling.
- **Color Tint**: Hex color picker & palette swatches (Neutral, Peach, Sage, Cyan, Plum) mapped to `vec3 u_colorTint`.
- **Noise Amount (0–100%)**: Procedural film/sensor grain.

### 4. Motion Controls
- **Animation Speed (0.0x–3.0x)**: Rate of temporal block evolution.
- **Feedback Decay (0–100%)**: Fade rate from feedback trails back to live video.
- **Corruption Burst Amount (0–100%)**: Intensity of triggered corruption spikes.
- **Random Seed (0–9999)**: Procedural noise seed distribution with instant reroll.
- **Freeze Effect Animation**: Holds temporal phase constant while keeping camera input responsive.

### 5. Advanced / Painterly Controls (Collapsible)
- **I-Frame Keyframe Hold**: Suppresses keyframes so scenes drag continuously through themselves.
- **Painterly Watercolor Bleed**: Multi-tap directional diffusion for soft melted transitions.
- **Large Block Mix**: Intermittent 32–64px macroblocks that lag and collapse.
- **Block Irregularity**: Non-uniform noise perturbation removing mosaic grid lines.
- **Motion Weighting**: Moving areas corrupt aggressively while static backgrounds stay anchored.
- **Muted Painterly Palette**: Desaturated blues, pale cyan, muted greens, warm peach, dusty pink, and dark purple.
- **Color & Horizontal Tearing**: Slit-scan shearing lines and channel tear bands.

---

## ⚡ The Three Core Presets

- **PETRICHOR**: Muted, painterly, low-intensity smearing with soft watercolor bleed, dusty peach, and muted sage greens.
- **COLLAPSE**: Heavy block displacement, 18px macroblocks, 60% large block collapse, and persistent temporal feedback dragging the scene through itself.
- **AFTERIMAGE**: Softer trails, ethereal ghosting, and subtle chromatic separation.

*Each preset includes a one-click apply and one-click reset action. Switching presets updates uniforms instantly without restarting the webcam or recreating the WebGL context.*

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Master Bypass Toggle (Effect On / Clean Video) |
| `D` | Toggle I-Frame Keyframe Hold |
| `R` | Purge / Reset Accumulator Buffer |
| `S` | Instant High-Resolution PNG Snapshot |
| `F` | Toggle Fullscreen |

---

## 🚀 Quick Start

```bash
npm install
npm run dev
npm run build
```
