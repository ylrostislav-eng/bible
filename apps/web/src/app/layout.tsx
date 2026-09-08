import type { Metadata, Viewport } from 'next';
import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalErrorReporter } from '@/components/global-error-reporter';
import { AuthProvider } from '@/lib/auth-context';
import { AmbientMusic } from '@/lib/music';
import { SoundProvider } from '@/lib/sound';
import { TelegramProvider } from '@/lib/telegram-provider';
import './globals.css';

/**
 * Это видит не игрок, а тот, кому ссылку переслали.
 *
 * Telegram разворачивает адрес в карточку с заголовком, описанием и
 * картинкой — и по ней человек решает, открывать ли вообще. Прежнее
 * описание («Игровая платформа для изучения Библии») говорило, из чего
 * приложение сделано, а не что в нём делать; карточки без картинки в
 * ленте чата не видно вовсе.
 *
 * `metadataBase` нужен, чтобы `/og.png` превратился в полный адрес:
 * относительный путь Telegram и остальные не разворачивают. Берётся из
 * `NEXT_PUBLIC_APP_URL`, а без него — из адреса Railway, чтобы на
 * развёрнутом сервере карточка работала без новой настройки.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: 'Библейская арена',
  description:
    'Викторина по Библии в Telegram: играйте один на один, собирайте комнату до десяти человек, объясняйте слова в Alias и угадывайте слово дня.',
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Библейская арена',
    title: 'Библейская арена',
    description:
      'Дуэли один на один, комнаты с друзьями, Alias за одним телефоном и слово дня. Викторина по Писанию прямо в Telegram.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Библейская арена' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0b0f14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <GlobalErrorReporter />
        <ErrorBoundary>
          <TelegramProvider>
            <AuthProvider>
              {/* Звук выше всех экранов: настройки живут в профиле, и
                  провайдер должен видеть его целиком. */}
              <SoundProvider>
                <AmbientMusic />
                {children}
              </SoundProvider>
            </AuthProvider>
          </TelegramProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
