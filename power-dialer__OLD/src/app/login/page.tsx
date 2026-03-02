'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Zap, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const router = useRouter();

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // Redirect once user is confirmed
  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === 'supervisor' ? '/supervisor' : '/sales');
    }
  }, [user, loading, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password required'); return; }
    setSubmitting(true);
    setError('');
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <Loader2 size={24} className="text-accent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mx-auto">
            <Zap size={32} className="text-accent" />
          </div>
          <div>
            <h1 className="font-rajdhani font-bold text-3xl text-white tracking-[4px] uppercase">AgenticLife</h1>
            <p className="text-muted text-sm mt-1">Power Dialer CRM</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl">
          <h2 className="font-rajdhani font-bold text-sm tracking-widest uppercase text-muted mb-5">Sign In</h2>
          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="Email address" autoComplete="email" autoFocus
                className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="relative">
              <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Password" autoComplete="current-password"
                className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5">
                <AlertCircle size={13} className="text-danger flex-shrink-0 mt-0.5" />
                <span className="text-danger text-xs leading-relaxed">{error}</span>
              </div>
            )}
            <button type="submit" disabled={submitting}
              className="w-full mt-1 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-rajdhani font-bold tracking-widest uppercase py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-700 text-xs">No account? Contact your supervisor to get access.</p>
      </div>
    </div>
  );
}
