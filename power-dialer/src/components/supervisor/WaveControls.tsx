'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, updateDoc, setDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/collections';
import type { CampaignWave } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Radio, Clock, ToggleLeft, ToggleRight, Plus, Edit2, Trash2, X, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
function hourLabel(h: number) {
  if (h === 0)  return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

interface EditingCampaign {
  id?:             string;
  name:            string;
  description:     string;
  startHourLocal:  number;
  endHourLocal:    number;
  timezone:        string;
}

const BLANK: EditingCampaign = {
  name:           '',
  description:    '',
  startHourLocal: 9,
  endHourLocal:   20,
  timezone:       'America/New_York',
};

export default function WaveControls() {
  const [waves,   setWaves]   = useState<CampaignWave[]>([]);
  const [editing, setEditing] = useState<EditingCampaign | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Subscribe to ALL campaigns (not just hardcoded two)
  useEffect(() => {
    const q    = query(collection(db, COLLECTIONS.CAMPAIGNS), orderBy('name'));
    const unsub = onSnapshot(q, snap => {
      setWaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as CampaignWave)));
    });
    return unsub;
  }, []);

  const toggle = async (wave: CampaignWave) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.CAMPAIGNS, wave.id), { isActive: !wave.isActive });
      toast.success(`${wave.name} ${!wave.isActive ? 'activated' : 'paused'}`);
    } catch {
      toast.error('Failed to update');
    }
  };

  const updateHours = async (
    wave:  CampaignWave,
    field: 'startHourLocal' | 'endHourLocal',
    val:   number,
  ) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.CAMPAIGNS, wave.id), { [field]: val });
    } catch {
      toast.error('Failed to update hours');
    }
  };

  const save = async () => {
    if (!editing?.name.trim()) { toast.error('Campaign name required'); return; }
    setSaving(true);
    try {
      const id  = editing.id ?? `campaign_${Date.now()}`;
      await setDoc(doc(db, COLLECTIONS.CAMPAIGNS, id), {
        name:           editing.name.trim(),
        description:    editing.description.trim(),
        startHourLocal: editing.startHourLocal,
        endHourLocal:   editing.endHourLocal,
        timezone:       editing.timezone || 'America/New_York',
        isActive:       false,
      }, { merge: true });
      toast.success(editing.id ? 'Campaign updated' : 'Campaign created');
      setEditing(null);
    } catch {
      toast.error('Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (wave: CampaignWave) => {
    if (!confirm(`Delete "${wave.name}"? This cannot be undone.`)) return;
    setDeleting(wave.id);
    try {
      await deleteDoc(doc(db, COLLECTIONS.CAMPAIGNS, wave.id));
      toast.success(`"${wave.name}" deleted`);
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card
      header={
        <div className="flex items-center justify-between w-full">
          <span className="flex items-center gap-1.5"><Radio size={12} /> Campaigns</span>
          <button
            onClick={() => setEditing({ ...BLANK })}
            className="text-accent hover:text-white flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold"
          >
            <Plus size={11} /> New
          </button>
        </div>
      }
      noPadding
    >
      <div className="divide-y divide-border">
        {waves.length === 0 && !editing && (
          <div className="p-4 text-muted text-xs text-center">
            No campaigns yet. Click <strong>New</strong> to create one.
          </div>
        )}

        {waves.map(wave => (
          <div key={wave.id} className="p-4 space-y-3">
            {/* Name + toggle row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-rajdhani font-bold text-sm truncate">{wave.name}</div>
                {wave.description && (
                  <div className="text-muted text-[11px] truncate">{wave.description}</div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setEditing({
                    id:             wave.id,
                    name:           wave.name,
                    description:    wave.description ?? '',
                    startHourLocal: wave.startHourLocal,
                    endHourLocal:   wave.endHourLocal,
                    timezone:       wave.timezone,
                  })}
                  className="text-muted hover:text-accent transition p-1"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={() => remove(wave)}
                  disabled={deleting === wave.id}
                  className="text-muted hover:text-danger transition p-1"
                >
                  <Trash2 size={12} />
                </button>
                <button onClick={() => toggle(wave)} className="transition-colors ml-1">
                  {wave.isActive
                    ? <ToggleRight size={26} className="text-neon" />
                    : <ToggleLeft  size={26} className="text-muted" />
                  }
                </button>
              </div>
            </div>

            {/* Hours */}
            <div className="flex items-center gap-2 flex-wrap">
              <Clock size={11} className="text-muted flex-shrink-0" />
              <select
                value={wave.startHourLocal}
                onChange={e => updateHours(wave, 'startHourLocal', +e.target.value)}
                className="bg-surface border border-border rounded px-2 py-1 text-white text-[11px] focus:outline-none focus:border-accent"
              >
                {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
              <span className="text-muted text-[10px]">→</span>
              <select
                value={wave.endHourLocal}
                onChange={e => updateHours(wave, 'endHourLocal', +e.target.value)}
                className="bg-surface border border-border rounded px-2 py-1 text-white text-[11px] focus:outline-none focus:border-accent"
              >
                {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
              <span className="text-muted text-[10px]">local time</span>
            </div>

            {/* Status pill */}
            <div className={`flex items-center gap-1.5 text-[10px] font-rajdhani font-bold tracking-widest uppercase ${wave.isActive ? 'text-neon' : 'text-muted'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${wave.isActive ? 'bg-neon animate-pulse' : 'bg-muted'}`} />
              {wave.isActive ? 'ACTIVE — DIALING' : 'PAUSED'}
            </div>
          </div>
        ))}

        {/* Create / Edit form */}
        {editing && (
          <div className="p-4 bg-surface space-y-3 animate-slideUp">
            <div className="text-[10px] tracking-widest uppercase text-accent font-rajdhani font-bold">
              {editing.id ? 'Edit Campaign' : 'New Campaign'}
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">
                  Campaign Name <span className="text-danger">*</span>
                </label>
                <input
                  autoFocus
                  value={editing.name}
                  onChange={e => setEditing(p => p && ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Pizza Restaurants NYC"
                  className="w-full bg-card border border-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">
                  Description (optional)
                </label>
                <input
                  value={editing.description}
                  onChange={e => setEditing(p => p && ({ ...p, description: e.target.value }))}
                  placeholder="e.g. 200 pizza leads, Manhattan"
                  className="w-full bg-card border border-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Start hour</label>
                  <select
                    value={editing.startHourLocal}
                    onChange={e => setEditing(p => p && ({ ...p, startHourLocal: +e.target.value }))}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                  >
                    {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">End hour</label>
                  <select
                    value={editing.endHourLocal}
                    onChange={e => setEditing(p => p && ({ ...p, endHourLocal: +e.target.value }))}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                  >
                    {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Timezone</label>
                <select
                  value={editing.timezone}
                  onChange={e => setEditing(p => p && ({ ...p, timezone: e.target.value }))}
                  className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                >
                  {[
                    'America/New_York',
                    'America/Chicago',
                    'America/Denver',
                    'America/Los_Angeles',
                    'America/Phoenix',
                    'America/Anchorage',
                    'Pacific/Honolulu',
                    'Europe/London',
                    'Europe/Paris',
                    'Asia/Tokyo',
                  ].map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="success" size="sm" loading={saving} onClick={save}>
                <Check size={12} /> {editing.id ? 'Update' : 'Create Campaign'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                <X size={12} /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
