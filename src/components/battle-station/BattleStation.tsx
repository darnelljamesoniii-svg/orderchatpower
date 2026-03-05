'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSignalWireDevice } from '@/hooks/useSignalWireDevice';
import { useSpeechTranscription } from '@/hooks/useSpeechTranscription';
import { useAgentMirror } from '@/hooks/useAgentMirror';
import { DispositionSelector } from '@/components/disposition/DispositionPanel';
import ProspectActivityPanel from '@/components/battle-station/ProspectActivityPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils';
import { buildDemoLink, defaultEmailSubject, defaultEmailBody } from '@/lib/resend';
import type { Lead, BattleCard, DispositionAction } from '@/types';
import {
  PhoneCall, PhoneOff, Mic, MicOff, Video, VideoOff,
  Zap, ChevronRight, Loader2, Wifi, WifiOff, Mail, X, Link2, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BattleStationProps {
  agentId:   string;
  agentName: string;
}

// ── Waveform ──────────────────────────────────────────────────────────────────
function Waveform() {
  return (
    <div className="flex items-center gap-[3px] h-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] bg-neon rounded-sm animate-waveBar"
          style={{ animationDelay: `${i * 0.08}s`, height: '100%' }}
        />
      ))}
    </div>
  );
}

// ── Battle Card ───────────────────────────────────────────────────────────────
function BattleCardDisplay({ card, loading }: { card: BattleCard | null; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center gap-2 text-accent text-xs">
      <Loader2 size={14} className="animate-spin" /> Generating battle card…
    </div>
  );
  if (!card) return (
    <p className="text-muted text-xs">
      AI coach activates automatically when an objection keyword is detected…
    </p>
  );
  return (
    <div className="space-y-2">
      <div className="bg-neon/5 border border-neon/20 rounded-lg p-3">
        <div className="text-[10px] tracking-widest uppercase text-neon font-bold mb-1">⚡ Rebuttal</div>
        <p className="text-white text-[13px]">"{card.rebuttal}"</p>
      </div>
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
        <div className="text-[10px] tracking-widest uppercase text-accent font-bold mb-1">🎯 Follow Up</div>
        <p className="text-white text-[13px]">"{card.followUp}"</p>
      </div>
      <div className="bg-amber/5 border border-amber/20 rounded-lg p-2 flex items-center gap-2">
        <span className="text-[10px] uppercase text-amber font-bold">Tone:</span>
        <span className="text-white text-xs">{card.toneAdvice}</span>
      </div>
    </div>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────
function InlineEdit({ leadId, field, value, placeholder, icon }: {
  leadId: string; field: string; value?: string; placeholder: string; icon: string;
}) {
  const [editing, setEditing]   = useState(false);
  const [local,   setLocal]     = useState(value ?? '');
  const [saving,  setSaving]    = useState(false);

  const save = async () => {
    if (local === (value ?? '')) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [field]: local }),
      });
      toast.success(`${field} saved`);
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="bg-gray-800 border border-accent/50 rounded px-2 py-1 text-xs text-white w-full focus:outline-none"
          placeholder={placeholder}
        />
        {saving && <Loader2 size={10} className="animate-spin text-accent flex-shrink-0" />}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-left w-full truncate hover:text-white transition group"
      title={`Click to edit ${field}`}
    >
      <span className="mr-1">{icon}</span>
      {local
        ? <span className="text-gray-300">{local}</span>
        : <span className="text-gray-600 italic">{placeholder} (click to add)</span>
      }
    </button>
  );
}

// ── Email Compose Modal ───────────────────────────────────────────────────────
function EmailModal({ lead, agentName, onClose }: {
  lead: Lead; agentName: string; onClose: () => void;
}) {
  const demoLink = buildDemoLink(lead.kgmid, lead.sessionId);
  const [to, setTo] = useState(lead.email ?? '');
  const [subject, setSubject] = useState(defaultEmailSubject(lead.businessName));
  const [body, setBody] = useState(defaultEmailBody(lead.businessName, agentName));
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const insertLink = () => {
    setBody(b => b + `\n\nView your competitive zone: ${demoLink}`);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(demoLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const send = async () => {
    if (!to) { toast.error('Email address required'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to, subject, body,
          placeId: lead.kgmid,
          sessionId: lead.sessionId,
          leadId: lead.id,
        }),
      });
      if (!res.ok) throw new Error('Send failed');
      toast.success('Email sent!');
      onClose();
    } catch {
      toast.error('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-accent" />
            <span className="font-rajdhani font-bold tracking-widest uppercase text-sm text-white">
              Email Demo Link
            </span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* Demo link display */}
          <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-2">
            <Link2 size={12} className="text-accent flex-shrink-0" />
            <span className="text-accent text-xs font-mono truncate flex-1">{demoLink}</span>
            <button onClick={copyLink} className="text-gray-400 hover:text-white flex-shrink-0">
              {copied ? <Check size={12} className="text-neon" /> : <span className="text-xs">Copy</span>}
            </button>
          </div>

          {/* To */}
          <div>
            <label className="text-[10px] text-muted uppercase tracking-widest block mb-1">To</label>
            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              placeholder="prospect@email.com"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="text-[10px] text-muted uppercase tracking-widest block mb-1">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted uppercase tracking-widest">Message</label>
              <button
                onClick={insertLink}
                className="text-[10px] text-accent hover:text-white flex items-center gap-1"
              >
                <Link2 size={10} /> Insert Demo Link
              </button>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={7}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={sending} onClick={send}>
            <Mail size={12} /> Send Email
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main BattleStation ────────────────────────────────────────────────────────
export default function BattleStation({ agentId, agentName }: BattleStationProps) {
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [callLogId, setCallLogId] = useState('');
  const [battleCard, setBattleCard] = useState<BattleCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [fetchingLead, setFetchingLead] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mirrorOn, setMirrorOn] = useState(true);
  const [deviceReady, setDeviceReady] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectionCooldown = useRef(false);

  // ── Register + heartbeat ──────────────────────────────────────────────────
  // ── Register (now Sync) + heartbeat ──────────────────────────────────────────
useEffect(() => {
  // Use the new sync route instead of register
  fetch('/api/agents/sync', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      agentId, 
      agentName,
      // Optional: Add agentEmail here if you pass it in props
    }),
  })
    .then(() => setDeviceReady(true))
    .catch(() => toast.error('Failed to sync agent session'));

  // The heartbeat interval stays the same
  heartbeatRef.current = setInterval(() => {
    fetch('/api/agents/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    }).catch(() => {});
  }, 30_000);

  // ... rest of your existing cleanup code ...
}, [agentId, agentName]);

    const handleUnload = () =>
      navigator.sendBeacon('/api/agents/heartbeat', JSON.stringify({ agentId, status: 'OFFLINE' }));

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [agentId, agentName]);

  // ── Objection → battle card ────────────────────────────────────────────────
  const onObjectionDetected = useCallback(async (text: string) => {
    if (objectionCooldown.current || !currentLead) return;
    objectionCooldown.current = true;
    setTimeout(() => { objectionCooldown.current = false; }, 15_000);
    setCardLoading(true);
    try {
      const res = await fetch('/api/gemini/battlecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: `Lead: "${text}"`, businessType: currentLead.businessName }),
      });
      const card = await res.json();
      setBattleCard(card);
      toast('⚡ Battle card ready', { icon: '🧠' });
    } catch {
      toast.error('AI coach unavailable');
    } finally {
      setCardLoading(false);
    }
  }, [currentLead]);

  // ── Transcript ────────────────────────────────────────────────────────────
  const onTranscriptUpdate = useCallback(async (entries: { speaker: string; text: string; timestamp: string }[]) => {
    if (!callLogId || !entries.length) return;
    const last = entries[entries.length - 1];
    fetch('/api/leads/calllog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callLogId, speaker: last.speaker, text: last.text }),
    }).catch(() => {});
  }, [callLogId]);

  const {
    isListening,
    transcript,
    start: startTranscript,
    stop: stopTranscript,
    clear: clearTranscript,
  } = useSpeechTranscription({ onObjection: onObjectionDetected, onTranscript: onTranscriptUpdate });

  const { videoRef, error: cameraError } = useAgentMirror();

  // ── SignalWire device ─────────────────────────────────────────────────────
  const { state: callState, duration, callSid, makeCall, hangUp, mute, reinit } = useSignalWireDevice({
    agentId,
    onCallConnected: async (payload: any) => {
      try {
        const sid =
          payload?.parameters?.CallSid ??
          payload?.callSid ??
          callSid ??
          null;

        const res = await fetch('/api/leads/calllog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: currentLead?.id,
            agentId,
            callSid: sid,
          }),
        });

        const data = await res.json();
        if (data.callLogId) setCallLogId(data.callLogId);
      } catch {
        console.error('Failed to create call log');
      }

      startTranscript();
      toast.success('📞 Connected');
    },

    onCallDisconnected: () => {
      stopTranscript();
      fetch('/api/agents/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, status: 'AVAILABLE' }),
      }).catch(() => {});
    },

    onError: (err: Error) => toast.error(`SignalWire: ${err.message}`),
  });

  // ── Fetch next lead ───────────────────────────────────────────────────────
  const fetchNextLead = useCallback(async () => {
    setFetchingLead(true);
    try {
      const res = await fetch('/api/leads/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (data.lead) {
        setCurrentLead(data.lead);
        setCallLogId('');
        clearTranscript();
        setBattleCard(null);
        toast.success(`🎯 ${data.lead.businessName}`);
        return data.lead;
      } else {
        toast(data.message ?? 'Queue empty — check back shortly.', { icon: '⏳' });
        return null;
      }
    } catch {
      toast.error('Failed to fetch lead');
      return null;
    } finally {
      setFetchingLead(false);
    }
  }, [agentId, clearTranscript]);

  // ── Auto-advance after disposition ───────────────────────────────────────
  const onDisposed = useCallback(async (action: DispositionAction, squareUrl?: string) => {
    if (action === 'SUCCESS' && squareUrl) {
      window.open(squareUrl, '_blank');
      toast.success('💰 Payment link opened!');
    }
    setCurrentLead(null);
    setBattleCard(null);
    setCallLogId('');
    clearTranscript();

    const onCall = callState === 'in-call' || callState === 'ringing' || callState === 'connecting';
    if (!onCall) {
      setTimeout(async () => {
        const next = await fetchNextLead();
        if (!next) {
          // Queue empty — keep UI as is
        }
      }, 500);
    }
  }, [callState, fetchNextLead, clearTranscript]);

  const handleDial = () => { if (currentLead) makeCall(currentLead.phone); };
  const handleHangUp = () => { hangUp(); stopTranscript(); };
  const toggleMute = () => { mute(!isMuted); setIsMuted(m => !m); };

  const isOnCall = callState === 'in-call' || callState === 'ringing' || callState === 'connecting';

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">

      {/* Email modal */}
      {showEmail && currentLead && (
        <EmailModal lead={currentLead} agentName={agentName} onClose={() => setShowEmail(false)} />
      )}

      {/* LEFT: Mirror + Softphone */}
      <div className="w-72 flex flex-col gap-4 flex-shrink-0">
        <Card header={<><Video size={12} /> Agent Mirror</>} noPadding>
          {/* ... mirror content unchanged ... */}
          <div className="relative bg-black aspect-video overflow-hidden">
            {mirrorOn && !cameraError ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted gap-2">
                <VideoOff size={24} />
                <span className="text-[10px] uppercase tracking-widest">{cameraError ?? 'Camera off'}</span>
              </div>
            )}
            {isOnCall && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-2">
                <Waveform />
                <span className="font-mono text-2xl text-neon font-bold">{formatDuration(duration)}</span>
              </div>
            )}
            <button
              onClick={() => setMirrorOn(m => !m)}
              className="absolute top-2 right-2 bg-black/50 rounded p-1 text-muted hover:text-white"
            >
              {mirrorOn ? <Video size={12} /> : <VideoOff size={12} />}
            </button>
            <div className="absolute top-2 left-2">
              {deviceReady ? <Wifi size={12} className="text-neon" /> : <WifiOff size={12} className="text-danger" />}
            </div>
          </div>

          {/* Softphone controls – unchanged */}
          <div className="p-3 space-y-2">
            {/* ... rest unchanged ... */}
          </div>
        </Card>

        {/* Transcript – unchanged */}
        <Card
          header={
            <div className="flex items-center gap-2 w-full">
              <Mic size={12} />
              <span>{isListening ? 'Listening…' : 'Transcript'}</span>
              {isListening && (
                <div className="ml-auto flex gap-[2px] items-center h-3">
                  {[0,1,2].map(i => (
                    <div
                      key={i}
                      className="w-[2px] bg-neon rounded-full animate-waveBar"
                      style={{ animationDelay: `${i * 0.15}s`, height: '100%' }}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          className="flex-1 overflow-hidden"
        >
          {/* ... transcript content unchanged ... */}
        </Card>
      </div>

      {/* MIDDLE: Battle Cards + Disposition + Prospect Panel – unchanged */}
      <div className="w-72 flex flex-col gap-4 flex-shrink-0">
        {/* ... middle column unchanged ... */}
      </div>

      {/* RIGHT: Live Prospect View – unchanged */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ... right column unchanged ... */}
      </div>

    </div>
  );
}
