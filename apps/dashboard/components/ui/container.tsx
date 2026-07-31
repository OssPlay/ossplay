import type React from 'react';
import { cn } from '@/lib/utils';

export default function Container({
  inner: { className: innerClassName, ...innerProps } = {},
  children,
  className,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>> & {
  inner?: React.HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div
      {...props}
      className={cn('p-4 border-sidebar-border bg-card border rounded-4xl', className)}
    >
      <div
        {...innerProps}
        className={cn(
          'flex flex-1 flex-col items-center justify-center p-4 bg-background rounded-4xl',
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
