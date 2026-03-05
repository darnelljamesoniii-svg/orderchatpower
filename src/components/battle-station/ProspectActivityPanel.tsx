'use client';

import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import type { Lead, LPSession, AgentAlert } from '@/types';
import { Copy, Check, Bell, ExternalLink, Phone, MapPin, User, Clock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProspectActivityPanelProps {
  lead:        Lead | null;
  agentId:     string;
  onNext:      () => void;
  loading:     boolean;
  onSendEmail: () => void;
}

function useElapsedTime(loadedAt?: string): string {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!loadedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(loadedAt).getTime()) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
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
    ticket_selected: '💰 Selected avg ticket size',
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
  lead, agentId, onNext, loading, onSendEmail,
}: ProspectActivityPanelProps) {
  const [session,  setSession]  = useState<LPSession | null>(null);
  const [copied,   setCopied]   = useState(false);
  const [alerts,   setAlerts]   = useState<AgentAlert[]>([]);

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const demoLink = lead
    ? `${appUrl}/unlock?place_id=${encodeURIComponent(lead.kgmid ?? '')}&name=${encodeURIComponent(lead.businessName ?? '')}&address=${encodeURIComponent(lead.address ?? '')}&sessionId=${encodeURIComponent(lead.sessionId ?? '')}`
    : '';

  const elapsed = useElapsedTime(session?.loadedAt);

  // Subscribe to session doc
  useEffect(() => {
    if (!lead?.sessionId) { setSession(null); return; }
    return onSnapshot(
      doc(db, 'lp_sessions', lead.sessionId),
      snap => { if (snap.exists()) setSession(snap.data() as LPSession); },
      err  => console.error('[ProspectActivityPanel]', err),
    );
  }, [lead?.sessionId]);

  // Subscribe to agent alerts
  useEffect(() => {
    if (!agentId) return;
    const q = query(
      collection(db, 'agents', agentId, 'alerts'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(5),
    );
    return onSnapshot(q, snap => {
      const newAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentAlert));
      newAlerts.forEach(a => {
        if (a.type === 'return_visit' && !alerts.find(old => old.id === a.id)) {
          toast(a.message, { icon: '🔥', duration: 8000 });
          try {
            const ctx  = new AudioContext();
            const osc  = ctx.createOscillator();
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
  }, [agentId]);

  const copyLink = useCallback(() => {
    if (!demoLink) return;
    navigator.clipboard.writeText(demoLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Demo link copied!');
    });
  }, [demoLink]);

  const hotIndicator = session?.step === 'lock_clicked' || session?.step === 'payment_opened';

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto">

      {/* ── Lead Info Card ── */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-rajdhani font-bold tracking-widest uppercase text-muted mb-1">
          Current Lead
        </div>

        {!lead ? (
          <p className="text-muted text-xs italic">No lead loaded — start a session to begin.</p>
        ) : (
          <div className="space-y-2.5">
            {/* Business name */}
            <div>
              <div className="text-white font-bold text-base leading-tight">{lead.businessName}</div>
              <div className="text-muted text-xs">{lead.campaign} · {lead.status}</div>
            </div>

            {/* Contact */}
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <User size={11} className="text-muted flex-shrink-0" />
              <span>{lead.contactName || '—'}</span>
            </div>

            {/* Phone */}
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <Phone size={11} className="text-muted flex-shrink-0" />
              <span className="font-mono">{lead.phone}</span>
              {lead.phone2 && <span className="text-muted">· {lead.phone2}</span>}
            </div>

            {/* Address */}
            {lead.address && (
              <div className="flex items-start gap-2 text-xs text-gray-300">
                <MapPin size={11} className="text-muted flex-shrink-0 mt-0.5" />
                <span>{lead.address}</span>
              </div>
            )}

            {/* Timezone */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock size={11} className="text-muted flex-shrink-0" />
              <span>{lead.timezone} (UTC{lead.utcOffsetHours >= 0 ? '+' : ''}{lead.utcOffsetHours})</span>
            </div>

            {/* Retry count */}
            {lead.retryCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <RefreshCw size={11} className="flex-shrink-0" />
                <span>Attempt #{lead.retryCount + 1}</span>
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div className="bg-gray-900 rounded-lg px-3 py-2 text-xs text-gray-300 border border-gray-700">
                <div className="text-[10px] text-muted uppercase tracking-widest mb-1">Notes</div>
                {lead.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Prospect Activity Card ── */}
      <div className={`border rounded-xl p-4 space-y-2.5 ${
        hotIndicator
          ? 'border-neon/50 bg-neon/5 animate-pulse'
          : 'border-border bg-surface'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${session ? 'bg-neon animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-[10px] font-rajdhani font-bold tracking-widest uppercase text-muted">
              Prospect Activity
            </span>
          </div>
          {alerts.length > 0 && (
            <div className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
              <Bell size={10} className="animate-bounce" />
              {alerts.length} alert{alerts.length > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {!session ? (
          <p className="text-muted text-xs">Waiting for prospect to open the demo link…</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px] uppercase tracking-widest">Status</span>
              <span className="text-white text-xs font-medium">{stepLabel(session.step)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px] uppercase tracking-widest">Time on page</span>
              <span className="text-accent font-mono text-xs">{elapsed || '—'}</span>
            </div>
            {session.selectedAvgTicket && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-[10px] uppercase tracking-widest">Avg ticket</span>
                <span className="text-white text-xs">${session.selectedAvgTicket}</span>
              </div>
            )}
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
            {hotIndicator && (
              <div className="bg-neon/10 border border-neon/30 rounded-lg px-3 py-2 text-center">
                <span className="text-neon text-xs font-bold">
                  {session.step === 'payment_opened' ? '💳 Payment open — call now!' : '🔒 About to lock — call now!'}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px] uppercase tracking-widest">Last event</span>
              <span className="text-gray-500 text-[10px]">
                {session.lastEventAt ? new Date(session.lastEventAt).toLocaleTimeString() : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Demo link */}
        {lead && (
          <div className="border-t border-border pt-2 space-y-1.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Demo Link</div>
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5">
              <span className="text-accent text-[10px] font-mono truncate flex-1">{demoLink}</span>
              <button onClick={copyLink} className="flex-shrink-0 text-gray-400 hover:text-white transition p-0.5">
                {copied ? <Check size={12} className="text-neon" /> : <Copy size={12} />}
              </button>
              <a href={demoLink} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 text-gray-400 hover:text-white transition p-0.5">
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
