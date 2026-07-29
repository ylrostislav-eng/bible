export const SUPPORTED_LANGUAGES = ['ru', 'en'] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  ru: 'Русский',
  en: 'English',
};

export const DEFAULT_LANGUAGE: LanguageCode = 'ru';
