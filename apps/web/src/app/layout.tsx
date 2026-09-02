import type { Metadata, Viewport } from 'next';
import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalErrorReporter } from '@/components/global-error-reporter';
import { AuthProvider } from '@/lib/auth-context';
import { TelegramProvider } from '@/lib/telegram-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bible Arena',
  description: 'Игровая платформа для изучения Библии в Telegram',
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
            <AuthProvider>{children}</AuthProvider>
          </TelegramProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
