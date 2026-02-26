import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    NEW:             'text-accent border-accent/30 bg-accent/10',
    IN_PROGRESS:     'text-amber  border-amber/30  bg-amber/10',
    CALLBACK_MANUAL: 'text-purple border-purple/30 bg-purple/10',
    CALLBACK_AUTO:   'text-amber  border-amber/30  bg-amber/10',
    CLOSED:          'text-neon   border-neon/30   bg-neon/10',
    BLACKLISTED:     'text-danger border-danger/30 bg-danger/10',
    EXHAUSTED:       'text-muted  border-muted/30  bg-muted/10',
  };
  return map[status] ?? 'text-muted border-muted/30 bg-muted/10';
}
