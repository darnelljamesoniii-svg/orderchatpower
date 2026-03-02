'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/collections';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { AppUser } from '@/types';
import {
  Users, Plus, Copy, Check, Mail, X, UserCheck, UserX, Eye, EyeOff, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface NewRepForm {
  displayName: string;
  email:       string;
}

interface CreatedAccount {
  email:     string;
  password:  string;
  emailSent: boolean;
}

export default function TeamManager() {
  const { user } = useAuth();
  const [reps,    setReps]    = useState<AppUser[]>([]);
  const [form,    setForm]    = useState<NewRepForm>({ displayName: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [created,  setCreated]  = useState<CreatedAccount | null>(null);
  const [showPw,   setShowPw]   = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Subscribe to all users
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.USERS), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setReps(snap.docs.map(d => d.data() as AppUser).filter(u => u.role === 'rep'));
    });
  }, []);

  const createRep = async () => {
    if (!form.displayName.trim() || !form.email.trim()) {
      toast.error('Name and email required');
      return;
    }
    if (!user?.uid) return;
    setCreating(true);
    try {
      const res  = await fetch('/api/auth/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:         form.email.trim().toLowerCase(),
          displayName:   form.displayName.trim(),
          role:          'rep',
          supervisorUid: user.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreated({ email: data.email, password: data.password, emailSent: data.emailSent });
      setForm({ displayName: '', email: '' });
      setShowForm(false);
      toast.success(`Account created for ${form.displayName.trim()}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (rep: AppUser) => {
    setTogglingId(rep.uid);
    try {
      const res  = await fetch('/api/auth/deactivate-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          targetUid:     rep.uid,
          supervisorUid: user?.uid,
          active:        !rep.active,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`${rep.displayName} ${!rep.active ? 'activated' : 'deactivated'}`);
    } catch {
      toast.error('Failed to update account');
    } finally {
      setTogglingId(null);
    }
  };

  const copyCredentials = (email: string, password: string) => {
    navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Credentials copied');
  };

  return (
    <Card
      header={
        <div className="flex items-center justify-between w-full">
          <span className="flex items-center gap-1.5"><Users size={12} /> Team ({reps.length})</span>
          <button
            onClick={() => { setShowForm(f => !f); setCreated(null); }}
            className="text-accent hover:text-white flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold"
          >
            {showForm ? <><X size={11} /> Cancel</> : <><Plus size={11} /> Add Rep</>}
          </button>
        </div>
      }
      noPadding
    >
      <div className="divide-y divide-border">

        {/* New account form */}
        {showForm && (
          <div className="p-4 bg-surface space-y-3 animate-slideUp">
            <div className="text-[10px] tracking-widest uppercase text-accent font-bold font-rajdhani">
              Create Rep Account
            </div>
            <div className="space-y-2">
              <input
                autoFocus
                value={form.displayName}
                onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                placeholder="Full name"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-accent"
              />
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && createRep()}
                placeholder="Email address"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-accent"
              />
            </div>
            <Button variant="primary" size="sm" loading={creating} onClick={createRep} className="w-full">
              <Plus size={12} /> Create Account + Send Login
            </Button>
            <p className="text-[10px] text-gray-600">
              A temp password will be generated. If Resend is configured, login details are emailed automatically.
            </p>
          </div>
        )}

        {/* Credentials reveal after creation */}
        {created && (
          <div className="p-4 bg-neon/5 border-b border-neon/20 space-y-3 animate-slideUp">
            <div className="flex items-center gap-2">
              <UserCheck size={14} className="text-neon" />
              <span className="text-neon text-xs font-bold">Account created!</span>
              {created.emailSent
                ? <span className="text-[10px] text-gray-500 flex items-center gap-1"><Mail size={10} /> Email sent</span>
                : <span className="text-[10px] text-amber">Email not sent — Resend not configured</span>
              }
            </div>

            <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Email:</span>
                <span className="text-white">{created.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Password:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">
                    {showPw ? created.password : '••••••••'}
                  </span>
                  <button onClick={() => setShowPw(p => !p)} className="text-gray-600 hover:text-white">
                    {showPw ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => copyCredentials(created.email, created.password)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 rounded-lg transition"
              >
                {copied ? <Check size={11} className="text-neon" /> : <Copy size={11} />}
                {copied ? 'Copied!' : 'Copy credentials'}
              </button>
              <button
                onClick={() => setCreated(null)}
                className="text-gray-600 hover:text-white px-3 py-2 rounded-lg transition"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Rep list */}
        {reps.length === 0 && !showForm && (
          <div className="p-4 text-muted text-xs text-center">
            No reps yet. Click <strong>Add Rep</strong> to create the first account.
          </div>
        )}

        {reps.map(rep => (
          <div key={rep.uid} className="flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${rep.active ? 'bg-neon' : 'bg-gray-700'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-rajdhani font-bold truncate">{rep.displayName}</div>
              <div className="text-gray-500 text-[10px] truncate">{rep.email}</div>
            </div>
            <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
              rep.active ? 'text-neon bg-neon/10' : 'text-gray-600 bg-gray-800'
            }`}>
              {rep.active ? 'Active' : 'Inactive'}
            </div>
            <button
              onClick={() => toggleActive(rep)}
              disabled={togglingId === rep.uid}
              className="text-muted hover:text-white transition p-1 flex-shrink-0"
              title={rep.active ? 'Deactivate' : 'Activate'}
            >
              {togglingId === rep.uid
                ? <Loader2 size={14} className="animate-spin" />
                : rep.active
                  ? <UserX size={14} className="hover:text-danger" />
                  : <UserCheck size={14} className="hover:text-neon" />
              }
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
