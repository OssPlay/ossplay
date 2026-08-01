import type { LucideIcon } from 'lucide-react';
import type React from 'react';
import { cn } from '@/lib/utils';

export default function Container({
  inner: { className: innerClassName, ...innerProps } = {},
  children,
  className,
  header,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>> & {
  inner?: React.HTMLAttributes<HTMLDivElement>;
  header?: {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: {
      icon?: LucideIcon;
      title?: string;
      onClick?: () => void;
    };
  };
}) {
  return (
    <section
      {...props}
      className={cn(
        'p-4 border-sidebar-border dark:bg-card bg-muted/50 border rounded-4xl',
        className,
      )}
    >
      <div
        {...innerProps}
        className={cn('flex flex-1 flex-col bg-background rounded-4xl shadow-lg', innerClassName)}
      >
        {header && (
          <header className="flex items-center p-4 mb-4 border-b flex-nowrap">
            {header.icon && <header.icon className="mr-4 size-8" />}
            <div className="flex flex-col flex-1 ">
              <h3 className="text-lg font-bold dark:text-white">{header.title}</h3>
              {header.description && (
                <p className="text-sm text-muted-foreground">{header.description}</p>
              )}
            </div>
          </header>
        )}
        <div className={cn('flex flex-1 flex-col p-4')}>{children}</div>
      </div>
    </section>
  );
}
