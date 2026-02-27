'use client';

// SignalWire SDK cannot be SSR'd — must be client-only
import dynamic from 'next/dynamic';
import { useState } from 'react';
import NavBar from '@/components/ui/NavBar';
const BattleStation = dynamic(
  () => import('@/components/battle-station/BattleStation'),
  { ssr: false, 
   loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-muted text-sm animate-pulse">Loading Battle Station…</div>
    </div>
  )},
);

export default function SalesPage() {
  const [agentId]   = useState(() => `agent_${Math.random().toString(36).slice(2, 8)}`);
  const [agentName] = useState('Agent');

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      <NavBar />
      <div className="flex-1 overflow-hidden">
        <BattleStation agentId={agentId} agentName={agentName} />
      </div>
    </div>
  );
}
