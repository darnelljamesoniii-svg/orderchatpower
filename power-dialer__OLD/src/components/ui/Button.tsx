import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'success' | 'ghost' | 'amber' | 'purple';
  size?:    'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-rajdhani font-bold tracking-widest uppercase transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg';

    const variants = {
      primary: 'bg-accent text-bg hover:shadow-[0_0_20px_rgba(0,212,255,0.4)]',
      danger:  'bg-danger text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]',
      success: 'bg-neon text-bg hover:shadow-[0_0_20px_rgba(0,255,136,0.4)]',
      ghost:   'bg-transparent text-muted border border-border hover:text-white hover:border-accent',
      amber:   'bg-amber text-bg hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]',
      purple:  'bg-purple text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-[11px]',
      md: 'px-4 py-2 text-[12px]',
      lg: 'px-6 py-3 text-[13px]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
