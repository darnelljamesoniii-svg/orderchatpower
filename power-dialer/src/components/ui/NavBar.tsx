'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

const TABS = [
  { href: '/sales',      label: 'Battle Station' },
  { href: '/supervisor', label: 'Supervisor'      },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center h-12 bg-surface border-b border-border px-4 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-8">
        <Zap size={16} className="text-accent" />
        <span className="font-rajdhani font-bold text-base tracking-[3px] uppercase text-white">
          Power<span className="text-accent">Dial</span>
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-stretch h-full gap-0">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center px-5 h-full font-rajdhani font-bold text-[12px] tracking-[2px] uppercase border-b-2 transition-all',
              pathname.startsWith(tab.href)
                ? 'text-accent border-accent'
                : 'text-muted border-transparent hover:text-white',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Live status */}
      <div className="ml-auto flex items-center gap-2 text-[11px] font-mono text-neon">
        <div className="w-2 h-2 rounded-full bg-neon animate-pulseGlow" />
        LIVE
      </div>
    </nav>
  );
}
