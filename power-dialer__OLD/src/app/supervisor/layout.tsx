'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/lib/auth-context';
import { Shield, Loader2 } from 'lucide-react';

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth('supervisor');
  const { logOut }        = useAuth();

  if (loading || !user) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <Loader2 size={24} className="text-accent animate-spin" />
    </div>
  );

  // useRequireAuth bounces reps to /sales — if we're here, user is supervisor
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-accent" />
          <span className="font-rajdhani font-bold tracking-[3px] uppercase text-sm text-white">
            Supervisor Dashboard
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-xs">{user.displayName}</span>
          <a
            href="/sales"
            className="text-[10px] text-accent hover:text-white uppercase tracking-widest font-bold transition"
          >
            → Agent View
          </a>
          <button
            onClick={logOut}
            className="text-[10px] text-gray-600 hover:text-danger uppercase tracking-widest font-bold transition"
          >
            Logout
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
