'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children:     React.ReactNode;
  requiredRole?: 'supervisor' | 'rep' | 'any';
}

export default function AuthGuard({ children, requiredRole = 'any' }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    // Reps trying to hit supervisor — bounce to sales
    if (requiredRole === 'supervisor' && user.role !== 'supervisor') {
      router.replace('/sales');
      return;
    }
  }, [user, loading, requiredRole, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 size={24} className="text-accent animate-spin" />
      </div>
    );
  }

  // Not authed or wrong role — render nothing while redirect happens
  if (!user) return null;
  if (requiredRole === 'supervisor' && user.role !== 'supervisor') return null;

  return <>{children}</>;
}
