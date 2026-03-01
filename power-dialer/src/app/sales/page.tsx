'use client';

// SignalWire SDK cannot be SSR'd — must be client-only
import dynamic from 'next/dynamic';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

const BattleStation = dynamic(
  () => import('@/components/battle-station/BattleStation'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted text-sm animate-pulse">Loading Battle Station…</div>
      </div>
    ),
  },
);

export default function SalesPage() {
  const { user, loading } = useRequireAuth();
  const { logOut }        = useAuth();

  if (loading || !user) return (
    <div className="h-screen bg-bg flex items-center justify-center">
      <Loader2 size={24} className="text-accent animate-spin" />
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface flex-shrink-0">
        <span className="font-rajdhani font-bold tracking-[3px] uppercase text-xs text-white">
          ⚡ AgenticLife Dialer
        </span>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-xs">{user.displayName}</span>
          {user.role === 'supervisor' && (
            <a href="/supervisor"
              className="text-[10px] text-accent hover:text-white uppercase tracking-widest font-bold transition">
              Supervisor →
            </a>
          )}
          <button onClick={logOut}
            className="text-[10px] text-gray-600 hover:text-danger uppercase tracking-widest font-bold transition">
            Logout
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <BattleStation
          agentId={user.agentId ?? user.uid}
          agentName={user.displayName}
        />
      </div>
    </div>
  );
}
