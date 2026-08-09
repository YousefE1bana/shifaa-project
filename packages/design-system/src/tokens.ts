export const color = {
  canvas: '#F5FAFC',
  surface: '#FFFFFF',
  ink: '#102A43',
  mutedInk: '#486581',
  careBlue: '#075985',
  healingTeal: '#00796B',
  focus: '#A13D00',
  positive: '#176B45',
  warning: '#8A4B08',
  danger: '#B42318',
  border: '#BCCCDC',
  inverse: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { control: 10, card: 16, capsule: 999 } as const;
export const type = {
  display: { fontFamily: 'Cairo', fontSize: 32, lineHeight: 43, fontWeight: '700' as const },
  title: { fontFamily: 'Cairo', fontSize: 24, lineHeight: 34, fontWeight: '700' as const },
  body: {
    fontFamily: 'Noto Sans Arabic',
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400' as const,
  },
  label: {
    fontFamily: 'Noto Sans Arabic',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
} as const;
export const motion = {
  patientProgressMs: 180,
  safetyCriticalMs: 0,
  reducedMotionMs: 0,
} as const;
export const minimumTargetSize = 44;

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
    minHeight: minimumTargetSize,
    backgroundColor: color.careBlue,
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
} as const;
