/**
 * VoxScore brand tokens — the dark "audio laboratory" palette and typography
 * used by the branded surfaces (onboarding, demo). Historically these values
 * were duplicated inline across screens; this module is the single source of
 * truth. Import `COLORS` / `FONTS` instead of hardcoding hexes.
 *
 * Palette source: the Onboarding v2 design handoff (Claude Design).
 */
export const COLORS = {
  /** Deepest page backdrop (outside the phone frame / app root). */
  pageBg: '#04070f',
  /** Primary surface — screen background. */
  surface: '#070d18',
  /** Slightly raised card fills (use with low alpha). */
  raised: 'rgba(255,255,255,0.04)',
  raisedFaint: 'rgba(255,255,255,0.02)',

  /** Hairline borders. */
  border: '#16233a',
  borderDeep: '#1c2a42',

  /** Primary accent — the VoxScore cyan. */
  cyan: '#22D3EE',
  cyanDeep: '#0e7490',
  cyanSoft: '#7fe3f3',

  /** Trust-chain accents. Amber = provisional, green = verified. */
  amber: '#F59E0B',
  green: '#34D399',
  /** Juror / battle accent. */
  rose: '#FB7185',

  /** Text. */
  ink: '#F4F8FC',
  inkBright: '#F8FAFC',
  muted: '#9fb1c6',
  faint: '#7c8ba1',
  faint2: '#5a6b82',
  faint3: '#3b4c63',

  /** Ink used on top of a solid cyan button. */
  onCyan: '#04121f',
} as const;

/**
 * Loaded font-family names. React Native resolves custom fonts by the exact
 * name registered with `useFonts` (fontWeight is unreliable for custom faces),
 * so each weight is its own family. Names match `@expo-google-fonts/*` exports.
 */
export const FONTS = {
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_500Medium',
  sansSemibold: 'InstrumentSans_600SemiBold',
  sansBold: 'InstrumentSans_700Bold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/** Compose an rgba() string from a hex color and an alpha in [0,1]. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
