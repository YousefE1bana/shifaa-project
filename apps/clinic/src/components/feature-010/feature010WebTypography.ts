import { localizedType, type TypographyVariant } from '@shifaa/design-system/tokens';

type Feature010Locale = 'ar-EG' | 'en-EG';

export function feature010WebTypography(locale: Feature010Locale, variant: TypographyVariant) {
  const typography = localizedType(locale, variant);
  return { ...typography, lineHeight: typography.lineHeight / typography.fontSize };
}
