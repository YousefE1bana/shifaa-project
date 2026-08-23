export const color = {
  canvas: '#F7FAF9',
  surface: '#FFFFFF',
  surfaceSubtle: '#EDF4F2',
  ink: '#102522',
  mutedInk: '#4E6662',
  brand: '#087F6C',
  brandHover: '#066858',
  brandPressed: '#064F45',
  info: '#1264A3',
  positive: '#19733D',
  warning: '#8A5400',
  danger: '#B42318',
  emergency: '#8E1111',
  focus: '#6D4AFF',
  border: '#C9D8D5',
  inverse: '#FFFFFF',
  careBlue: '#087F6C',
  healingTeal: '#087F6C',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { control: 8, card: 12, dialog: 16, capsule: 999 } as const;
export const type = {
  display: {
    fontFamily: 'IBM Plex Sans Arabic',
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
  },
  title: {
    fontFamily: 'IBM Plex Sans Arabic',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700' as const,
  },
  body: {
    fontFamily: 'IBM Plex Sans Arabic',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  label: {
    fontFamily: 'IBM Plex Sans Arabic',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
} as const;
export type TypographyVariant = keyof typeof type;
export function localizedType(locale: 'ar-EG' | 'en-EG', variant: TypographyVariant) {
  const weight =
    variant === 'body' ? '400Regular' : variant === 'label' ? '600SemiBold' : '700Bold';
  return {
    ...type[variant],
    fontFamily: locale === 'ar-EG' ? `IBMPlexSansArabic_${weight}` : `Inter_${weight}`,
  };
}
export const motion = {
  patientProgressMs: 180,
  safetyCriticalMs: 0,
  reducedMotionMs: 0,
} as const;
export const minimumTargetSize = 44;
export const patientPrimaryTargetSize = 48;
export const breakpoint = { compact: 0, medium: 600, wide: 1024, xwide: 1440 } as const;

export const semanticStyles = {
  screen: { flex: 1, backgroundColor: color.canvas, paddingInline: spacing.md },
  card: {
    backgroundColor: color.surface,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  primaryAction: {
    minHeight: patientPrimaryTargetSize,
    backgroundColor: color.brand,
    borderRadius: radius.control,
    paddingInline: spacing.lg,
    justifyContent: 'center' as const,
  },
  destructiveAction: {
    minHeight: minimumTargetSize,
    backgroundColor: color.danger,
    borderRadius: radius.control,
    paddingInline: spacing.lg,
    justifyContent: 'center' as const,
  },
  focusRing: { borderColor: color.focus, borderWidth: 3 },
  emergencyAction: {
    minHeight: 56,
    backgroundColor: color.emergency,
    borderRadius: radius.control,
    paddingInline: spacing.lg,
    justifyContent: 'center' as const,
  },
} as const;
