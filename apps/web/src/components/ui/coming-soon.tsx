import Link from 'next/link';
import type { ComponentType } from 'react';

interface ComingSoonProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="max-w-xs text-sm text-text-secondary">{description}</p>
      <span className="mt-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-muted">
        В разработке
      </span>
      {/* Экран, на котором нечего делать, обязан хотя бы выпускать. Здесь
          этого не было: человек заходил в «Турниры», видел «в разработке»
          и оставался с ним наедине. */}
      <Link
        href="/"
        className="mt-2 rounded-xl bg-surface-hover px-4 py-2 text-sm font-semibold transition hover:bg-border"
      >
        На главную
      </Link>
    </div>
  );
}
