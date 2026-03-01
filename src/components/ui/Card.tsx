import { cn, getStatusColor } from '@/lib/utils';

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-rajdhani font-bold tracking-widest uppercase border',
      getStatusColor(status),
      className,
    )}>
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  className?: string;
  header?:    React.ReactNode;
  noPadding?: boolean;
}

export function Card({ children, className, header, noPadding }: CardProps) {
  return (
    <div className={cn('bg-card border border-border rounded-xl overflow-hidden', className)}>
      {header && (
        <div className="px-4 py-3 border-b border-border font-rajdhani font-bold text-[11px] tracking-[3px] uppercase text-accent flex items-center gap-2">
          {header}
        </div>
      )}
      <div className={cn(!noPadding && 'p-4')}>
        {children}
      </div>
    </div>
  );
}

// ── Metric Tile ───────────────────────────────────────────────────────────────
interface MetricProps {
  value:    string | number;
  label:    string;
  color?:   string;
  sublabel?: string;
}

export function MetricTile({ value, label, color = 'text-white', sublabel }: MetricProps) {
  return (
    <div className="text-center">
      <div className={cn('font-rajdhani font-bold text-3xl', color)}>{value}</div>
      <div className="text-[10px] tracking-[2px] uppercase text-muted mt-0.5">{label}</div>
      {sublabel && <div className="text-[10px] text-muted/60 mt-0.5">{sublabel}</div>}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-border" />
      {label && <span className="text-[10px] tracking-[2px] uppercase text-muted">{label}</span>}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
