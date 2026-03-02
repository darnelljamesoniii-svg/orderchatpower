'use client';

import { useEffect, useRef, useState } from 'react';
import type { NearbyPlace } from '@/lib/google-places';

interface ActivityPulseProps {
  business:    { name: string };
  competitors: { tier1: NearbyPlace[]; tier2: NearbyPlace[]; tier3: NearbyPlace[] };
  stopped:     boolean; // true after lock clicked or payment opened
}

interface Pulse {
  id:      string;
  message: string;
}

const TIER_LABELS: Record<string, string> = {
  tier1: '5-minute zone',
  tier2: '10-minute zone',
  tier3: '20-minute zone',
};

function metresToMiles(m?: number): string {
  if (!m) return '?';
  return (m / 1609.34).toFixed(1);
}

function buildCompetitorPulse(
  competitors: ActivityPulseProps['competitors'],
): string | null {
  // Flatten all competitors with their tier label
  const pool: { place: NearbyPlace; tier: string }[] = [
    ...competitors.tier1.map(p => ({ place: p, tier: 'tier1' })),
    ...competitors.tier2.map(p => ({ place: p, tier: 'tier2' })),
    ...competitors.tier3.map(p => ({ place: p, tier: 'tier3' })),
  ];

  if (!pool.length) return null;

  const { place, tier } = pool[Math.floor(Math.random() * pool.length)];
  const dist   = metresToMiles(place.distanceMetres);
  const label  = TIER_LABELS[tier];

  const templates = [
    `Recommendation generated: ${place.name} (${dist} mi).`,
    `Competitive match executed in your ${label}.`,
    `${place.name} matched for a nearby customer search.`,
    `Engine routed a local search to ${place.name} (${dist} mi away).`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

function buildNeutralPulse(business: { name: string }): string {
  const templates = [
    `Your business qualified for a local match in this zone.`,
    `A nearby customer match resulted in a competitor recommendation.`,
    `Competitive match executed. ${business.name} not selected.`,
    `Zone activity detected. Recommendation engine active.`,
    `Local search executed in your area.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

export default function ActivityPulse({ business, competitors, stopped }: ActivityPulseProps) {
  const [pulses,    setPulses]    = useState<Pulse[]>([]);
  const pulseCount  = useRef(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCompetitors = (
    competitors.tier1.length +
    competitors.tier2.length +
    competitors.tier3.length
  ) > 0;

  const fire = () => {
    if (pulseCount.current >= 8) return;

    // 75% competitor, 25% neutral
    const useCompetitor = hasCompetitors && Math.random() < 0.75;
    const message = useCompetitor
      ? buildCompetitorPulse(competitors) ?? buildNeutralPulse(business)
      : buildNeutralPulse(business);

    const id = `pulse_${Date.now()}`;
    setPulses(prev => [...prev, { id, message }]);
    pulseCount.current++;

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      setPulses(prev => prev.filter(p => p.id !== id));
    }, 6000);
  };

  const scheduleNext = () => {
    if (stopped || pulseCount.current >= 8) return;
    // 35–85 second random interval
    const delay = (35 + Math.random() * 50) * 1000;
    timerRef.current = setTimeout(() => {
      fire();
      scheduleNext();
    }, delay);
  };

  useEffect(() => {
    if (stopped) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    scheduleNext();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [stopped]);

  if (!pulses.length) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 space-y-2 pointer-events-none">
      {pulses.map(pulse => (
        <div
          key={pulse.id}
          className="bg-gray-900/95 border border-gray-700 rounded-xl px-4 py-2.5 shadow-xl max-w-xs animate-slideUp"
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0 animate-pulse" />
            <p className="text-gray-300 text-xs leading-relaxed">{pulse.message}</p>
          </div>
          <div className="text-gray-600 text-[10px] mt-1 font-mono">
            {new Date().toLocaleTimeString()} · engine activity
          </div>
        </div>
      ))}
    </div>
  );
}
