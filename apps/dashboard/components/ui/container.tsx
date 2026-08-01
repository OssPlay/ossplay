import type { VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type React from 'react';
import { Button, type buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ContainerHeaderAction {
  icon?: LucideIcon;
  title: string;
  onClick?: () => void;
  variant?: VariantProps<typeof buttonVariants>['variant'];
  disabled?: boolean;
}

export interface ContainerHeaderConfig {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** A single header-row action (e.g. "Add key") — most list-style pages need exactly one. */
  action?: ContainerHeaderAction;
}

export default function Container({
  inner: { className: innerClassName, ...innerProps } = {},
  children,
  className,
  header,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>> & {
  inner?: React.HTMLAttributes<HTMLDivElement>;
  header?: ContainerHeaderConfig;
}) {
  return (
    <section
      {...props}
      className={cn(
        'flex flex-col p-4 border-sidebar-border dark:bg-card bg-muted/50 border rounded-4xl',
        className,
      )}
    >
      <div
        {...innerProps}
        className={cn('flex flex-1 flex-col bg-background rounded-4xl shadow-lg', innerClassName)}
      >
        {header && (
          <header className="flex items-center gap-4 p-4 mb-4 border-b flex-nowrap">
            {header.icon && <header.icon className="size-8 shrink-0" />}
            <div className="flex flex-col flex-1 min-w-0">
              <h3 className="text-lg font-bold dark:text-white">{header.title}</h3>
              {header.description && (
                <p className="text-sm text-muted-foreground">{header.description}</p>
              )}
            </div>
            {header.action && (
              <Button
                variant={header.action.variant ?? 'outline'}
                size="sm"
                disabled={header.action.disabled}
                onClick={header.action.onClick}
              >
                {header.action.icon && <header.action.icon />}
                {header.action.title}
              </Button>
            )}
          </header>
        )}
        <div className={cn('flex flex-1 flex-col p-4')}>{children}</div>
      </div>
    </section>
  );
}
