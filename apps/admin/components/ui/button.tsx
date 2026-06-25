import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'default' | 'lg';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  default:
    'bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)] hover:opacity-90',
  outline:
    'border border-[color:var(--color-border)] bg-transparent hover:bg-[color:var(--color-muted)]',
  ghost: 'hover:bg-[color:var(--color-muted)]',
  destructive: 'bg-[color:var(--color-destructive)] text-white hover:opacity-90',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  default: 'h-9 px-4 py-2 text-sm',
  lg: 'h-10 px-6',
};

export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'default', size = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)] disabled:pointer-events-none disabled:opacity-50',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
});
