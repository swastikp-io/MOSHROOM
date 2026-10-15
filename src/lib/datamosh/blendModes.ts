export type BlendModeId =
  // Normal modes
  | 'normal'
  | 'dissolve'
  // Darken modes
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'linear-burn'
  | 'darker-color'
  // Lighten modes
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'linear-dodge'
  | 'lighter-color'
  // Contrast modes
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  // Comparative modes
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  // Composite modes
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface BlendModeOption {
  id: BlendModeId
  label: string
  glIndex: number
}

export interface BlendModeCategory {
  category: string
  modes: BlendModeOption[]
}

export const BLEND_MODE_CATEGORIES: BlendModeCategory[] = [
  {
    category: 'Normal modes',
    modes: [
      { id: 'normal', label: 'Normal', glIndex: 0 },
      { id: 'dissolve', label: 'Dissolve', glIndex: 1 },
    ],
  },
  {
    category: 'Darken modes',
    modes: [
      { id: 'darken', label: 'Darken', glIndex: 2 },
      { id: 'multiply', label: 'Multiply', glIndex: 3 },
      { id: 'color-burn', label: 'Color Burn', glIndex: 4 },
      { id: 'linear-burn', label: 'Linear Burn', glIndex: 5 },
      { id: 'darker-color', label: 'Darker Color', glIndex: 6 },
    ],
  },
  {
    category: 'Lighten modes',
    modes: [
      { id: 'lighten', label: 'Lighten', glIndex: 7 },
      { id: 'screen', label: 'Screen', glIndex: 8 },
      { id: 'color-dodge', label: 'Color Dodge', glIndex: 9 },
      { id: 'linear-dodge', label: 'Linear Dodge (Add)', glIndex: 10 },
      { id: 'lighter-color', label: 'Lighter Color', glIndex: 11 },
    ],
  },
  {
    category: 'Contrast modes',
    modes: [
      { id: 'overlay', label: 'Overlay', glIndex: 12 },
      { id: 'soft-light', label: 'Soft Light', glIndex: 13 },
      { id: 'hard-light', label: 'Hard Light', glIndex: 14 },
      { id: 'vivid-light', label: 'Vivid Light', glIndex: 15 },
      { id: 'linear-light', label: 'Linear Light', glIndex: 16 },
      { id: 'pin-light', label: 'Pin Light', glIndex: 17 },
      { id: 'hard-mix', label: 'Hard Mix', glIndex: 18 },
    ],
  },
  {
    category: 'Comparative modes',
    modes: [
      { id: 'difference', label: 'Difference', glIndex: 19 },
      { id: 'exclusion', label: 'Exclusion', glIndex: 20 },
      { id: 'subtract', label: 'Subtract', glIndex: 21 },
      { id: 'divide', label: 'Divide', glIndex: 22 },
    ],
  },
  {
    category: 'Composite modes',
    modes: [
      { id: 'hue', label: 'Hue', glIndex: 23 },
      { id: 'saturation', label: 'Saturation', glIndex: 24 },
      { id: 'color', label: 'Color', glIndex: 25 },
      { id: 'luminosity', label: 'Luminosity', glIndex: 26 },
    ],
  },
]

export const BLEND_MODE_MAP: Record<BlendModeId, number> = BLEND_MODE_CATEGORIES.flatMap(
  (cat) => cat.modes,
).reduce(
  (acc, mode) => {
    acc[mode.id] = mode.glIndex
    return acc
  },
  {} as Record<BlendModeId, number>,
)

export function getBlendModeGlIndex(mode: BlendModeId): number {
  return BLEND_MODE_MAP[mode] ?? 0
}
