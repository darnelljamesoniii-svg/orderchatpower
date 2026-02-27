'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // <-- adjust this path if needed
import { COLLECTIONS, DEFAULT_CAMPAIGNS } from '@/lib/collections';
import type { CampaignWave } from '@/types';
import { Card } from '@/components/ui/Card';
import { Radio, Clock, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WaveControls() {
  const [waves, setWaves] = useState<CampaignWave[]>([]);

  useEffect(() => {
    const unsubs = DEFAULT_CAMPAIGNS.map((c) => {
      const ref = doc(db, COLLECTIONS.CAMPAIGNS, c.id);

      return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          setWaves((prev) => {
            const next = prev.filter((w) => w.id !== c.id);
            return [...next, { id: snap.id, ...(snap.data() as any) } as CampaignWave].sort((a, b) =>
              a.id.localeCompare(b.id),
            );
          });
        } else {
          fetch('/api/campaigns/seed', { method: 'POST' }).catch(() => {});
        }
      });
    });

    return () => unsubs.forEach((u) => u());
  }, []);

  const toggle = async (wave: CampaignWave) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.CAMPAIGNS, wave.id), { isActive: !wave.isActive });
      toast.success(`${wave.name} ${!wave.isActive ? 'activated' : 'paused'}`);
    } catch {
      toast.error('Failed to update wave');
    }
  };

  const updateHours = async (wave: CampaignWave, field: 'startHourLocal' | 'endHourLocal', val: number) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.CAMPAIGNS, wave.id), { [field]: val });
    } catch {
      toast.error('Failed to update hours');
    }
  };

  return (
    <Card header={<><Radio size={12} /> Campaign Wave Controls</>} noPadding>
      <div className="divide-y divide-border">
        {waves.map((wave) => (
          <div key={wave.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-rajdhani font-bold text-sm">{wave.name}</div>
                <div className="text-muted text-[11px]">{wave.description}</div>
              </div>
              <button onClick={() => toggle(wave)} className="transition-colors" type="button">
                {wave.isActive ? <ToggleRight size={28} className="text-neon" /> : <ToggleLeft size={28} className="text-muted" />}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Clock size={12} className="text-muted flex-shrink-0" />
              <div className="flex items-center gap-2 text-xs">
                <label className="text-muted">From</label>
                <select
                  value={wave.startHourLocal}
                  onChange={(e) => updateHours(wave, 'startHourLocal', Number(e.target.value))}
                  className="bg-surface border border-border rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-accent"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00 {i < 12 ? 'AM' : 'PM'}</option>
                  ))}
                </select>

                <label className="text-muted">To</label>
                <select
                  value={wave.endHourLocal}
                  onChange={(e) => updateHours(wave, 'endHourLocal', Number(e.target.value))}
                  className="bg-surface border border-border rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-accent"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00 {i < 12 ? 'AM' : 'PM'}</option>
                  ))}
                </select>

                <span className="text-muted text-[10px]">local time</span>
              </div>
            </div>

            <div className={`flex items-center gap-2 text-[10px] font-rajdhani font-bold tracking-widest uppercase ${wave.isActive ? 'text-neon' : 'text-muted'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${wave.isActive ? 'bg-neon animate-pulseGlow' : 'bg-muted'}`} />
              {wave.isActive ? 'ACTIVE — DIALING' : 'PAUSED'}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
