'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/collections';
import type { Disposition, DispositionAction, Lead } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { X, Plus, Edit2, Check } from 'lucide-react';

// ── Disposition Selector (used during a live call) ────────────────────────────
interface DispositionSelectorProps {
  lead:          Lead;
  agentId:       string;
  callLogId:     string;
  onDisposed:    (action: DispositionAction, squareUrl?: string) => void;
  disabled?:     boolean;
}

export function DispositionSelector({ lead, agentId, callLogId, onDisposed, disabled }: DispositionSelectorProps) {
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [selected,     setSelected]     = useState<Disposition | null>(null);
  const [notes,        setNotes]        = useState('');
  const [recallAt,     setRecallAt]     = useState('');
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.DISPOSITIONS), orderBy('sortOrder'));
    return onSnapshot(q, snap => {
      setDispositions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Disposition)).filter(d => d.isActive));
    });
  }, []);

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch('/api/leads/dispose', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId:           lead.id,
          agentId,
          callLogId,
          action:           selected.action,
          dispositionLabel: selected.label,
          recallAt:         selected.action === 'RECALL' ? recallAt : undefined,
          notes,
          squareAmount:     19900, // $199
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(
        selected.action === 'SUCCESS'
          ? `✅ CLOSED! Payment link sent.`
          : `Disposition saved: ${selected.label}`,
      );
      onDisposed(selected.action as DispositionAction, data.squareUrl);
      setSelected(null);
      setNotes('');
      setRecallAt('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Disposition failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Disposition Buttons Grid */}
      <div className="grid grid-cols-2 gap-2">
        {dispositions.map(disp => (
          <button
            key={disp.id}
            disabled={disabled}
            onClick={() => setSelected(disp)}
            className={cn(
              'py-2.5 px-3 rounded-lg border text-[11px] font-rajdhani font-bold tracking-widest uppercase transition-all duration-150',
              selected?.id === disp.id
                ? 'ring-2 ring-white scale-[0.97]'
                : 'hover:scale-[1.02] hover:shadow-lg',
            )}
            style={{
              backgroundColor: `${disp.color}15`,
              borderColor:     `${disp.color}40`,
              color:           disp.color,
            }}
          >
            {disp.label}
          </button>
        ))}
      </div>

      {/* Recall time picker */}
      {selected?.action === 'RECALL' && (
        <div className="animate-slideUp">
          <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
            Schedule Recall At
          </label>
          <input
            type="datetime-local"
            value={recallAt}
            onChange={e => setRecallAt(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {/* Notes */}
      {selected && (
        <div className="animate-slideUp">
          <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes..."
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {/* Submit */}
      {selected && (
        <Button
          variant="primary"
          size="lg"
          loading={loading}
          onClick={submit}
          className="w-full"
          style={{ backgroundColor: selected.color, color: '#060810' }}
        >
          Confirm: {selected.label}
        </Button>
      )}
    </div>
  );
}

// ── Supervisor Disposition Manager ────────────────────────────────────────────
export function DispositionManager() {
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [editing,      setEditing]      = useState<Partial<Disposition> | null>(null);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.DISPOSITIONS), orderBy('sortOrder'));
    return onSnapshot(q, snap =>
      setDispositions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Disposition))),
    );
  }, []);

  const save = async () => {
    if (!editing?.label || !editing?.action) return;
    setSaving(true);
    try {
      const id  = editing.id ?? `disp_${Date.now()}`;
      const max = dispositions.reduce((m, d) => Math.max(m, d.sortOrder ?? 0), 0);
      await setDoc(doc(db, COLLECTIONS.DISPOSITIONS, id), {
        label:      editing.label,
        action:     editing.action,
        color:      editing.color ?? '#94a3b8',
        sortOrder:  editing.sortOrder ?? max + 1,
        isActive:   editing.isActive ?? true,
        delayMinutes: editing.delayMinutes ?? 0,
      });
      toast.success('Disposition saved');
      setEditing(null);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, COLLECTIONS.DISPOSITIONS, id));
    toast.success('Deleted');
  };

  const ACTIONS: DispositionAction[] = ['SUCCESS', 'NO_ANSWER', 'BUSY', 'VOICEMAIL', 'RECALL', 'DNC', 'WRONG_NUMBER'];

  return (
    <Card header="⚡ Disposition Manager" noPadding>
      <div className="divide-y divide-border">
        {dispositions.map(d => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="flex-1 font-rajdhani font-bold text-sm tracking-wide text-white">{d.label}</span>
            <span className="text-[10px] tracking-widest text-muted uppercase">{d.action}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', d.isActive ? 'text-neon' : 'text-muted')}>
              {d.isActive ? 'ON' : 'OFF'}
            </span>
            <button onClick={() => setEditing(d)} className="text-muted hover:text-accent transition-colors">
              <Edit2 size={13} />
            </button>
            <button onClick={() => remove(d.id)} className="text-muted hover:text-danger transition-colors">
              <X size={13} />
            </button>
          </div>
        ))}

        {/* Edit / New Form */}
        {editing && (
          <div className="px-4 py-4 bg-surface space-y-3 animate-slideUp">
            <div className="text-[10px] tracking-widest uppercase text-accent font-rajdhani font-bold">
              {editing.id ? 'Edit Disposition' : 'New Disposition'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide">Label</label>
                <input
                  value={editing.label ?? ''}
                  onChange={e => setEditing(p => ({ ...p, label: e.target.value }))}
                  className="w-full mt-1 bg-card border border-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide">Action</label>
                <select
                  value={editing.action ?? ''}
                  onChange={e => setEditing(p => ({ ...p, action: e.target.value as DispositionAction }))}
                  className="w-full mt-1 bg-card border border-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                >
                  <option value="">Select…</option>
                  {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide">Color</label>
                <input
                  type="color"
                  value={editing.color ?? '#94a3b8'}
                  onChange={e => setEditing(p => ({ ...p, color: e.target.value }))}
                  className="w-full mt-1 h-9 bg-card border border-border rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide">Delay (min)</label>
                <input
                  type="number"
                  value={editing.delayMinutes ?? 0}
                  onChange={e => setEditing(p => ({ ...p, delayMinutes: +e.target.value }))}
                  className="w-full mt-1 bg-card border border-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.isActive ?? true}
                  onChange={e => setEditing(p => ({ ...p, isActive: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="text-xs text-muted">Active</span>
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="success" size="sm" loading={saving} onClick={save}><Check size={12} /> Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><X size={12} /> Cancel</Button>
            </div>
          </div>
        )}

        <div className="px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing({})}>
            <Plus size={12} /> Add Disposition
          </Button>
        </div>
      </div>
    </Card>
  );
}
