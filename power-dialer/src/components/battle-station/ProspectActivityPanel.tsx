'use client';

import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, orderBy, limit, onSnapshot as onSnap } from 'firebase/firestore';
import type { LPSession, AgentAlert } from '@/types';
import { Copy, Check, Bell, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProspectActivityPanelProps {
  sessionId:    string;
  placeId:      string;
  agentId:      string;
  businessName: string;
}

function useElapsedTime(loadedAt?: string): string {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!loadedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(loadedAt).getTime()) / 1000);
      const m    = Math.floor(secs / 60);
      const s    = secs % 60;
      setElapsed(`${m}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [loadedAt]);
  return elapsed;
}

function stepLabel(step?: string): string {
  const map: Record<string, string> = {
    loaded:          '📄 Opened the page',
    sting_done:      '😮 Watched competitor demo',
    exploring_zones: '🔍 Exploring competitor zones',
    ticket_selected: '💰 Selected average ticket size',
    pricing_opened:  '📊 Viewing pricing tiers',
    lock_clicked:    '🔒 Clicked Lock Zone',
    payment_opened:  '💳 Opened payment',
    return_visit:    '🔄 Returned to page',
  };
  return map[step ?? ''] ?? step ?? 'Viewing page';
}

function tierLabel(tierId?: string): string {
  const map: Record<string, string> = {
    tier1: 'Local Lock',
    tier2: 'Neighborhood Control',
    tier3: 'Area Ownership',
  };
  return tierId ? (map[tierId] ?? tierId) : '—';
}

export default function ProspectActivityPanel({
  sessionId, placeId, agentId, businessName,
}: ProspectActivityPanelProps) {
  const [session,  setSession]  = useState<LPSession | null>(null);
  const [copied,   setCopied]   = useState(false);
  const [alerts,   setAlerts]   = useState<AgentAlert[]>([]);
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const demoLink = `${appUrl}/unlock?place_id=${encodeURIComponent(placeId)}&sessionId=${encodeURIComponent(sessionId)}`;
  const elapsed = useElapsedTime(session?.loadedAt);

  // Subscribe to session doc
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(
      doc(db, 'lp_sessions', sessionId),
      snap => { if (snap.exists()) setSession(snap.data() as LPSession); },
      err  => console.error('[ProspectActivityPanel]', err),
    );
    return unsub;
  }, [sessionId]);

  // Subscribe to agent alerts
  useEffect(() => {
    if (!agentId) return;
    const q    = query(
      collection(db, 'agents', agentId, 'alerts'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(5),
    );
    const unsub = onSnap(q, snap => {
      const newAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentAlert));
      // Toast any new return visit alerts
      newAlerts.forEach(a => {
        if (a.type === 'return_visit' && !alerts.find(old => old.id === a.id)) {
          toast(a.message, { icon: '🔥', duration: 8000 });
          // Play alert sound
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
          } catch {}
        }
      });
      setAlerts(newAlerts);
    });
    return unsub;
  }, [agentId, alerts]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(demoLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Demo link copied!');
    });
  }, [demoLink]);

  const hotIndicator = session?.step === 'lock_clicked' || session?.step === 'payment_opened';

  return (
    <div className={`rounded-xl border p-3 space-y-3 ${
      hotIndicator
        ? 'border-neon/50 bg-neon/5 animate-pulse'
        : 'border-border bg-surface'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${session ? 'bg-neon animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-[10px] font-rajdhani font-bold tracking-widest uppercase text-muted">
            Prospect Activity
          </span>
        </div>
        {alerts.length > 0 && (
          <div className="flex items-center gap-1 text-amber text-[10px] font-bold">
            <Bell size={10} className="animate-bounce" />
            {alerts.length} alert{alerts.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {!session ? (
        <p className="text-muted text-xs">Waiting for prospect to open the demo link…</p>
      ) : (
        <div className="space-y-2">
          {/* Current step */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px] uppercase tracking-widest">Status</span>
            <span className="text-white text-xs font-medium">{stepLabel(session.step)}</span>
          </div>

          {/* Time on page */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px] uppercase tracking-widest">Time on page</span>
            <span className="text-accent font-mono text-xs">{elapsed || '—'}</span>
          </div>

          {/* Avg ticket */}
          {session.selectedAvgTicket && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px] uppercase tracking-widest">Avg ticket</span>
              <span className="text-white text-xs">${session.selectedAvgTicket}</span>
            </div>
          )}

          {/* Tier interest */}
          {(session.tierHovered || session.selectedTierId) && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px] uppercase tracking-widest">
                {session.selectedTierId ? 'Selected tier' : 'Viewing tier'}
              </span>
              <span className={`text-xs font-bold ${session.selectedTierId ? 'text-neon' : 'text-accent'}`}>
                {tierLabel(session.selectedTierId ?? session.tierHovered)}
              </span>
            </div>
          )}

          {/* Hot signal */}
          {hotIndicator && (
            <div className="bg-neon/10 border border-neon/30 rounded-lg px-3 py-2 text-center">
              <span className="text-neon text-xs font-bold">
                {session.step === 'payment_opened' ? '💳 Payment window open — call now!' : '🔒 About to lock — call now!'}
              </span>
            </div>
          )}

          {/* Last event */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px] uppercase tracking-widest">Last event</span>
            <span className="text-gray-500 text-[10px]">
              {session.lastEventAt ? new Date(session.lastEventAt).toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Demo link — always visible */}
      <div className="border-t border-border pt-2 space-y-1.5">
        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Demo Link</div>
        <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5">
          <span className="text-accent text-[10px] font-mono truncate flex-1">{demoLink}</span>
          <button onClick={copyLink}
            className="flex-shrink-0 text-gray-400 hover:text-white transition p-0.5">
            {copied ? <Check size={12} className="text-neon" /> : <Copy size={12} />}
          </button>
          <a href={demoLink} target="_blank" rel="noopener noreferrer"
            className="flex-shrink-0 text-gray-400 hover:text-white transition p-0.5">
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
