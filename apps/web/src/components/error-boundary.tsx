'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '@/lib/telemetry';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// React error boundaries can only be class components — there's no hook
// equivalent for catching render-time exceptions from descendants.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError('client_react_boundary', error.message, {
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-lg font-semibold">Что-то пошло не так</p>
          <p className="text-sm text-text-secondary">
            Мы уже знаем об этой ошибке. Попробуйте перезагрузить приложение.
          </p>
          <Button onClick={() => window.location.reload()} className="max-w-xs">
            Перезагрузить
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
