export interface Country {
  /** ISO 3166-1 alpha-2 code */
  code: string;
  nameEn: string;
  nameRu: string;
}

/**
 * Curated list of countries for the profile country selector.
 * Not the full ISO-3166 list, but covers the vast majority of the expected
 * audience. Extend this array as needed — it requires no migration since
 * `User.country` simply stores the ISO code as a string.
 */
export const COUNTRIES: Country[] = [
  { code: 'RU', nameEn: 'Russia', nameRu: 'Россия' },
  { code: 'UA', nameEn: 'Ukraine', nameRu: 'Украина' },
  { code: 'BY', nameEn: 'Belarus', nameRu: 'Беларусь' },
  { code: 'KZ', nameEn: 'Kazakhstan', nameRu: 'Казахстан' },
  { code: 'UZ', nameEn: 'Uzbekistan', nameRu: 'Узбекистан' },
  { code: 'KG', nameEn: 'Kyrgyzstan', nameRu: 'Киргизия' },
  { code: 'TJ', nameEn: 'Tajikistan', nameRu: 'Таджикистан' },
  { code: 'TM', nameEn: 'Turkmenistan', nameRu: 'Туркменистан' },
  { code: 'AM', nameEn: 'Armenia', nameRu: 'Армения' },
  { code: 'AZ', nameEn: 'Azerbaijan', nameRu: 'Азербайджан' },
  { code: 'GE', nameEn: 'Georgia', nameRu: 'Грузия' },
  { code: 'MD', nameEn: 'Moldova', nameRu: 'Молдова' },
  { code: 'EE', nameEn: 'Estonia', nameRu: 'Эстония' },
  { code: 'LV', nameEn: 'Latvia', nameRu: 'Латвия' },
  { code: 'LT', nameEn: 'Lithuania', nameRu: 'Литва' },
  { code: 'PL', nameEn: 'Poland', nameRu: 'Польша' },
  { code: 'DE', nameEn: 'Germany', nameRu: 'Германия' },
  { code: 'FR', nameEn: 'France', nameRu: 'Франция' },
  { code: 'GB', nameEn: 'United Kingdom', nameRu: 'Великобритания' },
  { code: 'ES', nameEn: 'Spain', nameRu: 'Испания' },
  { code: 'IT', nameEn: 'Italy', nameRu: 'Италия' },
  { code: 'NL', nameEn: 'Netherlands', nameRu: 'Нидерланды' },
  { code: 'BE', nameEn: 'Belgium', nameRu: 'Бельгия' },
  { code: 'CH', nameEn: 'Switzerland', nameRu: 'Швейцария' },
  { code: 'AT', nameEn: 'Austria', nameRu: 'Австрия' },
  { code: 'SE', nameEn: 'Sweden', nameRu: 'Швеция' },
  { code: 'NO', nameEn: 'Norway', nameRu: 'Норвегия' },
  { code: 'FI', nameEn: 'Finland', nameRu: 'Финляндия' },
  { code: 'DK', nameEn: 'Denmark', nameRu: 'Дания' },
  { code: 'IE', nameEn: 'Ireland', nameRu: 'Ирландия' },
  { code: 'PT', nameEn: 'Portugal', nameRu: 'Португалия' },
  { code: 'GR', nameEn: 'Greece', nameRu: 'Греция' },
  { code: 'CZ', nameEn: 'Czechia', nameRu: 'Чехия' },
  { code: 'SK', nameEn: 'Slovakia', nameRu: 'Словакия' },
  { code: 'HU', nameEn: 'Hungary', nameRu: 'Венгрия' },
  { code: 'RO', nameEn: 'Romania', nameRu: 'Румыния' },
  { code: 'BG', nameEn: 'Bulgaria', nameRu: 'Болгария' },
  { code: 'RS', nameEn: 'Serbia', nameRu: 'Сербия' },
  { code: 'HR', nameEn: 'Croatia', nameRu: 'Хорватия' },
  { code: 'CY', nameEn: 'Cyprus', nameRu: 'Кипр' },
  { code: 'IL', nameEn: 'Israel', nameRu: 'Израиль' },
  { code: 'TR', nameEn: 'Turkey', nameRu: 'Турция' },
  { code: 'US', nameEn: 'United States', nameRu: 'США' },
  { code: 'CA', nameEn: 'Canada', nameRu: 'Канада' },
  { code: 'MX', nameEn: 'Mexico', nameRu: 'Мексика' },
  { code: 'BR', nameEn: 'Brazil', nameRu: 'Бразилия' },
  { code: 'AR', nameEn: 'Argentina', nameRu: 'Аргентина' },
  { code: 'CO', nameEn: 'Colombia', nameRu: 'Колумбия' },
  { code: 'CL', nameEn: 'Chile', nameRu: 'Чили' },
  { code: 'PE', nameEn: 'Peru', nameRu: 'Перу' },
  { code: 'EG', nameEn: 'Egypt', nameRu: 'Египет' },
  { code: 'NG', nameEn: 'Nigeria', nameRu: 'Нигерия' },
  { code: 'ZA', nameEn: 'South Africa', nameRu: 'ЮАР' },
  { code: 'KE', nameEn: 'Kenya', nameRu: 'Кения' },
  { code: 'ET', nameEn: 'Ethiopia', nameRu: 'Эфиопия' },
  { code: 'GH', nameEn: 'Ghana', nameRu: 'Гана' },
  { code: 'PH', nameEn: 'Philippines', nameRu: 'Филиппины' },
  { code: 'IN', nameEn: 'India', nameRu: 'Индия' },
  { code: 'ID', nameEn: 'Indonesia', nameRu: 'Индонезия' },
  { code: 'CN', nameEn: 'China', nameRu: 'Китай' },
  { code: 'JP', nameEn: 'Japan', nameRu: 'Япония' },
  { code: 'KR', nameEn: 'South Korea', nameRu: 'Южная Корея' },
  { code: 'VN', nameEn: 'Vietnam', nameRu: 'Вьетнам' },
  { code: 'TH', nameEn: 'Thailand', nameRu: 'Таиланд' },
  { code: 'SG', nameEn: 'Singapore', nameRu: 'Сингапур' },
  { code: 'MY', nameEn: 'Malaysia', nameRu: 'Малайзия' },
  { code: 'AE', nameEn: 'United Arab Emirates', nameRu: 'ОАЭ' },
  { code: 'SA', nameEn: 'Saudi Arabia', nameRu: 'Саудовская Аравия' },
  { code: 'AU', nameEn: 'Australia', nameRu: 'Австралия' },
  { code: 'NZ', nameEn: 'New Zealand', nameRu: 'Новая Зеландия' },
];

export const COUNTRY_CODES: string[] = COUNTRIES.map((c) => c.code);
