'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { DispositionManager } from '@/components/disposition/DispositionPanel';
import { Shield, CheckCircle, Loader2 } from 'lucide-react';

const CsvImporter  = dynamic(() => import('@/components/supervisor/CsvImporter'),  { ssr: false });
const WaveControls = dynamic(() => import('@/components/supervisor/WaveControls'),  { ssr: false });
const LiveFeed     = dynamic(() => import('@/components/supervisor/LiveFeed'),       { ssr: false });

export default function SupervisorPage() {
  const [seeded,   setSeeded]   = useState(false);
  const [seeding,  setSeeding]  = useState(true);
  const [seedMsg,  setSeedMsg]  = useState('Initialising…');

  // Auto-seed dispositions and campaign waves on first load
  useEffect(() => {
    const seed = async () => {
      try {
        const res  = await fetch('/api/supervisor/seed', { method: 'POST' });
        const data = await res.json();
        setSeedMsg(data.message ?? 'Ready');
        setSeeded(true);
      } catch {
        setSeedMsg('Could not reach Firestore — check env vars');
        setSeeded(true); // show UI anyway
      } finally {
        setSeeding(false);
      }
    };
    seed();
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3 pb-2 border-b border-border">
          <Shield size={18} className="text-accent" />
          <div className="flex-1">
            <h1 className="font-rajdhani font-bold text-lg text-white tracking-[3px] uppercase">
              Supervisor Dashboard
            </h1>
            <p className="text-muted text-xs">Manage campaigns, import leads, monitor agents in real-time.</p>
          </div>
          {/* Seed status pill */}
          <div className={`flex items-center gap-1.5 text-[10px] font-rajdhani font-bold tracking-widest uppercase px-2.5 py-1 rounded border ${
            seeding
              ? 'text-amber border-amber/30 bg-amber/10'
              : 'text-neon border-neon/30 bg-neon/10'
          }`}>
            {seeding
              ? <><Loader2 size={10} className="animate-spin" /> {seedMsg}</>
              : <><CheckCircle size={10} /> {seedMsg}</>
            }
          </div>
        </div>

        {/* Live Feed — full width */}
        <LiveFeed />

        {/* Controls row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <WaveControls />
          <CsvImporter />
          <DispositionManager />
        </div>
      </div>
    </div>
  );
}
