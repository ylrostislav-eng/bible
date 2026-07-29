import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('flex rounded-2xl border border-border bg-surface p-4', className)}
      {...props}
    />
  );
}
