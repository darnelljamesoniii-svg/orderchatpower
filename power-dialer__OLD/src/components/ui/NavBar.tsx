'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Zap, LogOut, Shield } from 'lucide-react';

export function NavBar() {
  const { user, logOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logOut();
    router.replace('/login');
  };

  return (
    <nav className="flex items-center h-12 bg-surface border-b border-border px-4 flex-shrink-0 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-accent" />
        <span className="font-rajdhani font-bold text-base tracking-[3px] uppercase text-white">
          Power<span className="text-accent">Dial</span>
        </span>
      </div>

      {/* Supervisor badge + link */}
      {user?.role === 'supervisor' && (
        <button
          onClick={() => router.push('/supervisor')}
          className="flex items-center gap-1.5 text-[10px] text-accent hover:text-white uppercase tracking-widest font-bold transition"
        >
          <Shield size={11} /> Supervisor Dashboard
        </button>
      )}

      {/* Live status */}
      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-2 text-[11px] font-mono text-neon">
          <div className="w-2 h-2 rounded-full bg-neon animate-pulse" />
          LIVE
        </div>

        {/* User info + logout */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-white text-[11px] font-bold">{user.displayName}</div>
              <div className="text-gray-600 text-[9px] uppercase tracking-widest">{user.role}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="text-muted hover:text-danger transition p-1"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

// Keep default export for any existing imports
export default NavBar;
