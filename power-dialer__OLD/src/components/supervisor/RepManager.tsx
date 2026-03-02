'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { COLLECTIONS } from '@/lib/collections';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { AppUser } from '@/types';
import {
  Users, Plus, X, Check, Copy, Mail, ShieldOff,
  ShieldCheck, RefreshCw, Eye, EyeOff, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Create Rep Form ───────────────────────────────────────────────────────────
interface CreatedCreds {
  email:       string;
  password:    string;
  emailSent:   boolean;
  displayName: string;
}

function CreateRepForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email,       setEmail]       = useState('');
  const [role,        setRole]        = useState<'rep' | 'supervisor'>('rep');
  const [loading,     setLoading]     = useState(false);
  const [creds,       setCreds]       = useState<CreatedCreds | null>(null);
  const [showPass,    setShowPass]    = useState(true);
  const [copied,      setCopied]      = useState(false);

  const create = async () => {
    if (!displayName.trim() || !email.trim()) {
      toast.error('Name and email required');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          displayName: displayName.trim(),
          email:       email.trim().toLowerCase(),
          role,
          supervisorUid: user!.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreds({
        email:       email.trim().toLowerCase(),
        password:    data.password,
        emailSent:   data.emailSent,
        displayName: displayName.trim(),
      });
      toast.success(`${role === 'rep' ? 'Rep' : 'Supervisor'} account created!`);
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    if (!creds) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    navigator.clipboard.writeText(
      `Login: ${appUrl}/login\nEmail: ${creds.email}\nPassword: ${creds.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Credentials copied!');
  };

  const reset = () => {
    setCreds(null);
    setDisplayName('');
    setEmail('');
    setRole('rep');
  };

  if (creds) {
    return (
      <div className="space-y-3 animate-slideUp">
        <div className="bg-neon/5 border border-neon/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-neon" />
            <span className="text-neon text-xs font-bold font-rajdhani uppercase tracking-widest">
              Account Created — {creds.displayName}
            </span>
          </div>

          {/* Credentials display */}
          <div className="bg-gray-900 rounded-lg p-3 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-white">{creds.email}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Password</span>
              <div className="flex items-center gap-2">
                <span className="text-white">
                  {showPass ? creds.password : '••••••••'}
                </span>
                <button onClick={() => setShowPass(p => !p)} className="text-gray-500 hover:text-white">
                  {showPass ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
            </div>
          </div>

          {/* Email status */}
          {creds.emailSent ? (
            <div className="flex items-center gap-1.5 text-[10px] text-neon">
              <Mail size={10} /> Credentials emailed to {creds.email}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-amber">
              <Mail size={10} /> Email not sent (Resend not configured) — share manually
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={copyAll} className="flex-1">
              {copied ? <Check size={12} className="text-neon" /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy credentials'}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Plus size={12} /> Add another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-muted uppercase tracking-widest block mb-1">
          Full Name <span className="text-danger">*</span>
        </label>
        <input
          autoFocus
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g. Sarah Johnson"
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="text-[10px] text-muted uppercase tracking-widest block mb-1">
          Email Address <span className="text-danger">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
          placeholder="rep@company.com"
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="text-[10px] text-muted uppercase tracking-widest block mb-1">Role</label>
        <div className="flex gap-2">
          {(['rep', 'supervisor'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 py-1.5 rounded border text-[11px] font-rajdhani font-bold tracking-widest uppercase transition-all ${
                role === r
                  ? 'bg-accent/20 border-accent/50 text-accent'
                  : 'bg-card border-border text-muted hover:text-white'
              }`}
            >
              {r === 'rep' ? '👤 Rep' : '🛡 Supervisor'}
            </button>
          ))}
        </div>
      </div>

      <Button variant="primary" size="sm" loading={loading} onClick={create} className="w-full">
        <Plus size={12} /> Create Account
      </Button>
    </div>
  );
}

// ── Rep Row ───────────────────────────────────────────────────────────────────
function RepRow({ rep, supervisorUid, onAction }: {
  rep:          AppUser;
  supervisorUid: string;
  onAction:     () => void;
}) {
  const [loading,   setLoading]   = useState(false);
  const [newPass,   setNewPass]   = useState<string | null>(null);
  const [showPass,  setShowPass]  = useState(false);

  const doAction = async (action: string) => {
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/deactivate-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ targetUid: rep.uid, supervisorUid, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (action === 'reset_password' && data.newPassword) {
        setNewPass(data.newPassword);
        toast.success('Password reset — share the new password with the rep');
      } else {
        toast.success(action === 'deactivate' ? 'Account deactivated' : 'Account reactivated');
        onAction();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors ${!rep.active ? 'opacity-50' : ''}`}>
      {/* Avatar initial */}
      <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
        {rep.displayName.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-xs font-bold truncate">{rep.displayName}</span>
          <span className={`text-[9px] font-rajdhani font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
            rep.role === 'supervisor'
              ? 'text-accent bg-accent/10'
              : 'text-gray-500 bg-gray-800'
          }`}>{rep.role}</span>
          {!rep.active && (
            <span className="text-[9px] text-danger bg-danger/10 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">inactive</span>
          )}
        </div>
        <div className="text-gray-500 text-[10px] truncate">{rep.email}</div>
      </div>

      {/* New password display after reset */}
      {newPass && (
        <div className="flex items-center gap-1.5 bg-gray-900 rounded px-2 py-1">
          <span className="text-white text-[10px] font-mono">
            {showPass ? newPass : '••••••••'}
          </span>
          <button onClick={() => setShowPass(p => !p)} className="text-gray-500 hover:text-white">
            {showPass ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(newPass);
              toast.success('Copied!');
            }}
            className="text-gray-500 hover:text-white"
          >
            <Copy size={10} />
          </button>
        </div>
      )}

      {/* Actions */}
      {loading ? (
        <Loader2 size={13} className="animate-spin text-muted" />
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => doAction('reset_password')}
            title="Reset password"
            className="p-1.5 text-muted hover:text-amber transition rounded hover:bg-amber/10"
          >
            <RefreshCw size={12} />
          </button>
          {rep.active ? (
            <button
              onClick={() => doAction('deactivate')}
              title="Deactivate"
              className="p-1.5 text-muted hover:text-danger transition rounded hover:bg-danger/10"
            >
              <ShieldOff size={12} />
            </button>
          ) : (
            <button
              onClick={() => doAction('reactivate')}
              title="Reactivate"
              className="p-1.5 text-muted hover:text-neon transition rounded hover:bg-neon/10"
            >
              <ShieldCheck size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main RepManager ───────────────────────────────────────────────────────────
export default function RepManager() {
  const { user } = useAuth();
  const [users,      setUsers]      = useState<AppUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.USERS), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => d.data() as AppUser));
    });
  }, []);

  const reps       = users.filter(u => u.role === 'rep');
  const supervisors = users.filter(u => u.role === 'supervisor');
  const activeReps = reps.filter(u => u.active).length;

  return (
    <Card
      header={
        <div className="flex items-center justify-between w-full">
          <span className="flex items-center gap-1.5">
            <Users size={12} /> Team ({activeReps} active rep{activeReps !== 1 ? 's' : ''})
          </span>
          <button
            onClick={() => setShowCreate(p => !p)}
            className="text-accent hover:text-white flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold transition"
          >
            {showCreate ? <><X size={11} /> Cancel</> : <><Plus size={11} /> Add Rep</>}
          </button>
        </div>
      }
      noPadding
    >
      {/* Create form */}
      {showCreate && (
        <div className="p-4 border-b border-border bg-surface animate-slideUp">
          <CreateRepForm onCreated={() => setShowCreate(false)} />
        </div>
      )}

      {/* Supervisors */}
      {supervisors.length > 0 && (
        <>
          <div className="px-4 py-2 bg-gray-900/50">
            <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Supervisors</span>
          </div>
          {supervisors.map(u => (
            <RepRow key={u.uid} rep={u} supervisorUid={user!.uid} onAction={() => {}} />
          ))}
        </>
      )}

      {/* Reps */}
      <div className="px-4 py-2 bg-gray-900/50 border-t border-border">
        <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Reps</span>
      </div>

      {reps.length === 0 ? (
        <div className="p-4 text-muted text-xs text-center">
          No reps yet. Click <strong>Add Rep</strong> to create the first account.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {reps.map(u => (
            <RepRow key={u.uid} rep={u} supervisorUid={user!.uid} onAction={() => {}} />
          ))}
        </div>
      )}
    </Card>
  );
}
