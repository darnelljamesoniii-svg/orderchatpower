'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * Call at the top of any protected page.
 * - Not logged in → /login
 * - Wrong role → their correct page
 * - Returns { user, loading }
 */
export function useRequireAuth(requiredRole?: 'supervisor' | 'rep') {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (requiredRole && user.role !== requiredRole) {
      // Supervisor trying to hit /sales — let them through (they can see both)
      // Rep trying to hit /supervisor — bounce them back
      if (user.role === 'supervisor') return; // supervisors can go anywhere
      router.replace('/sales');
    }
  }, [user, loading, requiredRole, router]);

  return { user, loading };
}
