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

// â”€â”€ Waveform â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Waveform() {
  return (
    <div className="flex items-center gap-[3px] h-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="w-[3px] bg-neon rounded-sm animate-waveBar"
          style={{ animationDelay: `${i * 0.08}s`, height: '100%' }} />
      ))}
    </div>
  );
}

// â”€â”€ Battle Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BattleCardDisplay({ card, loading }: { card: BattleCard | null; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center gap-2 text-accent text-xs">
      <Loader2 size={14} className="animate-spin" /> Generating battle cardâ€¦
    </div>
  );
  if (!card) return (
    <p className="text-muted text-xs">
      AI coach activates automatically when an objection keyword is detectedâ€¦
    </p>
  );
  return (
    <div className="space-y-2">
      <div className="bg-neon/5 border border-neon/20 rounded-lg p-3">
        <div className="text-[10px] tracking-widest uppercase text-neon font-bold mb-1">âš¡ Rebuttal</div>
        <p className="text-white text-[13px]">"{card.rebuttal}"</p>
      </div>
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
        <div className="text-[10px] tracking-widest uppercase text-accent font-bold mb-1">ðŸŽ¯ Follow Up</div>
        <p className="text-white text-[13px]">"{card.followUp}"</p>
      </div>
      <div className="bg-amber/5 border border-amber/20 rounded-lg p-2 flex items-center gap-2">
        <span className="text-[10px] uppercase text-amber font-bold">Tone:</span>
        <span className="text-white text-xs">{card.toneAdvice}</span>
      </div>
    </div>
  );
}

// â”€â”€ Inline editable field â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    <button onClick={() => setEditing(true)}
      className="text-xs text-left w-full truncate hover:text-white transition group"
      title={`Click to edit ${field}`}>
      <span className="mr-1">{icon}</span>
      {local
        ? <span className="text-gray-300">{local}</span>
        : <span className="text-gray-600 italic">{placeholder} (click to add)</span>
      }
    </button>
  );
}

// â”€â”€ Email Compose Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EmailModal({ lead, agentName, onClose }: {
  lead: Lead; agentName: string; onClose: () => void;
}) {
  const demoLink = buildDemoLink(lead.kgmid, lead.sessionId);
  const [to,      setTo]      = useState(lead.email ?? '');
  const [subject, setSubject] = useState(defaultEmailSubject(lead.businessName));
  const [body,    setBody]    = useState(defaultEmailBody(lead.businessName, agentName));
  const [sending, setSending] = useState(false);
  const [copied,  setCopied]  = useState(false);

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
      const res  = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          to, subject, body,
          placeId:   lead.kgmid,
          sessionId: lead.sessionId,
          leadId:    lead.id,
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
            <input value={to} onChange={e => setTo(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              placeholder="prospect@email.com" />
          </div>

          {/* Subject */}
          <div>
            <label className="text-[10px] text-muted uppercase tracking-widest block mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted uppercase tracking-widest">Message</label>
              <button onClick={insertLink}
                className="text-[10px] text-accent hover:text-white flex items-center gap-1">
                <Link2 size={10} /> Insert Demo Link
              </button>
            </div>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={7}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent resize-none" />
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

// â”€â”€ Main BattleStation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function BattleStation({ agentId, agentName }: BattleStationProps) {
  const [currentLead,   setCurrentLead]   = useState<Lead | null>(null);
  const [callLogId,     setCallLogId]     = useState('');
  const [battleCard,    setBattleCard]    = useState<BattleCard | null>(null);
  const [cardLoading,   setCardLoading]   = useState(false);
  const [fetchingLead,  setFetchingLead]  = useState(false);
  const [isMuted,       setIsMuted]       = useState(false);
  const [mirrorOn,      setMirrorOn]      = useState(true);
  const [deviceReady,   setDeviceReady]   = useState(false);
  const [showEmail,     setShowEmail]     = useState(false);
  const heartbeatRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectionCooldown = useRef(false);

  // â”€â”€ Register + heartbeat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    fetch('/api/agents/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, agentName }),
    }).then(() => setDeviceReady(true)).catch(() => toast.error('Failed to register agent'));

    heartbeatRef.current = setInterval(() => {
      fetch('/api/agents/heartbeat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      }).catch(() => {});
    }, 30_000);

    const handleUnload = () =>
      navigator.sendBeacon('/api/agents/heartbeat', JSON.stringify({ agentId, status: 'OFFLINE' }));
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [agentId, agentName]);

  // â”€â”€ Objection â†’ battle card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const onObjectionDetected = useCallback(async (text: string) => {
    if (objectionCooldown.current || !currentLead) return;
    objectionCooldown.current = true;
    setTimeout(() => { objectionCooldown.current = false; }, 15_000);
    setCardLoading(true);
    try {
      const res = await fetch('/api/gemini/battlecard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: `Lead: "${text}"`, businessType: currentLead.businessName }),
      });
      const card = await res.json();
      setBattleCard(card);
      toast('âš¡ Battle card ready', { icon: 'ðŸ§ ' });
    } catch { toast.error('AI coach unavailable'); }
    finally { setCardLoading(false); }
  }, [currentLead]);

  // â”€â”€ Transcript â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const onTranscriptUpdate = useCallback(async (entries: { speaker: string; text: string; timestamp: string }[]) => {
    if (!callLogId || !entries.length) return;
    const last = entries[entries.length - 1];
    fetch('/api/leads/calllog', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callLogId, speaker: last.speaker, text: last.text }),
    }).catch(() => {});
  }, [callLogId]);

  const {
    isListening, transcript, start: startTranscript, stop: stopTranscript, clear: clearTranscript,
  } = useSpeechTranscription({ onObjection: onObjectionDetected, onTranscript: onTranscriptUpdate });

  const { videoRef, error: cameraError } = useAgentMirror();

  // â”€â”€ SignalWire device â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { state: callState, duration, callSid, makeCall, hangUp, mute, reinit } = useSignalWireDevice({
  agentId,

  onCallConnected: async (payload: any) => {
    try {
      // support both shapes:
      // - browser SDK: payload.parameters.CallSid
      // - server-call: payload.callSid
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
    toast.success('ðŸ“ž Connected');
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

  // â”€â”€ Fetch next lead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchNextLead = useCallback(async () => {
    setFetchingLead(true);
    try {
      const res  = await fetch('/api/leads/next', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (data.lead) {
        setCurrentLead(data.lead);
        setCallLogId('');
        clearTranscript();
        setBattleCard(null);
        toast.success(`ðŸŽ¯ ${data.lead.businessName}`);
        return data.lead;
      } else {
        toast(data.message ?? 'Queue empty â€” check back shortly.', { icon: 'â³' });
        return null;
      }
    } catch {
      toast.error('Failed to fetch lead');
      return null;
    } finally {
      setFetchingLead(false);
    }
  }, [agentId, clearTranscript]);

  // â”€â”€ Auto-advance after disposition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const onDisposed = useCallback(async (action: DispositionAction, squareUrl?: string) => {
    if (action === 'SUCCESS' && squareUrl) {
      window.open(squareUrl, '_blank');
      toast.success('ðŸ’° Payment link opened!');
    }
    setCurrentLead(null);
    setBattleCard(null);
    setCallLogId('');
    clearTranscript();

    // Auto-advance â€” only if not on call
    const onCall = callState === 'in-call' || callState === 'ringing' || callState === 'connecting';
    if (!onCall) {
      setTimeout(async () => {
        const next = await fetchNextLead();
        if (!next) {
          // Queue empty â€” keep UI as is, don't blank
        }
      }, 500);
    }
  }, [callState, fetchNextLead, clearTranscript]);

  const handleDial  = () => { if (currentLead) makeCall(currentLead.phone); };
  const handleHangUp = () => { hangUp(); stopTranscript(); };
  const toggleMute  = () => { mute(!isMuted); setIsMuted(m => !m); };

  const isOnCall = callState === 'in-call' || callState === 'ringing' || callState === 'connecting';

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">

      {/* Email modal */}
      {showEmail && currentLead && (
        <EmailModal lead={currentLead} agentName={agentName} onClose={() => setShowEmail(false)} />
      )}

      {/* â”€â”€ LEFT: Mirror + Softphone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="w-72 flex flex-col gap-4 flex-shrink-0">
        <Card header={<><Video size={12} /> Agent Mirror</>} noPadding>
          <div className="relative bg-black aspect-video overflow-hidden">
            {mirrorOn && !cameraError ? (
              <video ref={videoRef} autoPlay muted playsInline
                className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
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
            <button onClick={() => setMirrorOn(m => !m)}
              className="absolute top-2 right-2 bg-black/50 rounded p-1 text-muted hover:text-white">
              {mirrorOn ? <Video size={12} /> : <VideoOff size={12} />}
            </button>
            <div className="absolute top-2 left-2">
              {deviceReady ? <Wifi size={12} className="text-neon" /> : <WifiOff size={12} className="text-danger" />}
            </div>
          </div>

          {/* Softphone controls */}
          <div className="p-3 space-y-2">
            {currentLead ? (
              <div className="space-y-1.5">
                {/* Attempt + timezone badge */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-muted text-[10px]">{currentLead.timezone}</span>
                  <span className="text-[10px] font-bold text-amber">Attempt #{(currentLead.retryCount ?? 0) + 1}</span>
                </div>

                {/* All editable lead fields */}
                <div className="space-y-1 bg-gray-900 rounded-lg p-2">
                  <InlineEdit leadId={currentLead.id} field="businessName" value={currentLead.businessName}
                    placeholder="Business name" icon="ðŸ¢" />
                  <InlineEdit leadId={currentLead.id} field="contactName" value={currentLead.contactName}
                    placeholder="Contact name" icon="ðŸ‘¤" />
                  <InlineEdit leadId={currentLead.id} field="phone" value={currentLead.phone}
                    placeholder="Primary phone" icon="ðŸ“ž" />
                  <InlineEdit leadId={currentLead.id} field="phone2" value={currentLead.phone2}
                    placeholder="Add 2nd phone" icon="ðŸ“±" />
                  <InlineEdit leadId={currentLead.id} field="email" value={currentLead.email}
                    placeholder="Add email" icon="âœ‰ï¸" />
                  <InlineEdit leadId={currentLead.id} field="address" value={(currentLead as Lead & { address?: string }).address}
                    placeholder="Add address" icon="ðŸ“" />
                </div>

                {/* Email demo link button */}
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowEmail(true)}>
                  <Mail size={12} /> Email Demo Link
                </Button>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                <div className="text-center text-muted text-xs">No lead loaded</div>
                <div className="bg-gray-900 rounded-lg p-2.5 space-y-1.5 text-[10px] text-gray-600">
                  <div className="text-gray-500 font-bold uppercase tracking-widest mb-1">Queue is empty if:</div>
                  <div>â€¢ No campaign is Active in /supervisor</div>
                  <div>â€¢ No leads imported yet (CSV import)</div>
                  <div>â€¢ Outside campaign calling hours</div>
                  <div>â€¢ All leads exhausted or closed</div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!isOnCall ? (
                <Button variant="success" size="md" className="flex-1" onClick={handleDial}
                  disabled={!currentLead || !deviceReady}>
                  <PhoneCall size={14} /> Dial
                </Button>
              ) : (
                <Button variant="danger" size="md" className="flex-1" onClick={handleHangUp}>
                  <PhoneOff size={14} /> Hang Up
                </Button>
              )}
              <Button variant={isMuted ? 'danger' : 'ghost'} size="md"
                onClick={toggleMute} disabled={!isOnCall}>
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </Button>
            </div>

            <Button variant="ghost" size="sm" className="w-full"
              loading={fetchingLead} onClick={fetchNextLead} disabled={isOnCall}>
              <ChevronRight size={12} /> Next Lead
            </Button>

            {callState === 'error' && (
              <Button variant="amber" size="sm" className="w-full" onClick={reinit}>
                Reconnect SignalWire Device
              </Button>
            )}
          </div>
        </Card>

        {/* Transcript */}
        <Card
          header={
            <div className="flex items-center gap-2 w-full">
              <Mic size={12} />
              <span>{isListening ? 'Listeningâ€¦' : 'Transcript'}</span>
              {isListening && (
                <div className="ml-auto flex gap-[2px] items-center h-3">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-[2px] bg-neon rounded-full animate-waveBar"
                      style={{ animationDelay: `${i * 0.15}s`, height: '100%' }} />
                  ))}
                </div>
              )}
            </div>
          }
          className="flex-1 overflow-hidden"
        >
          <div className="h-36 overflow-y-auto space-y-1.5 pr-1">
            {transcript.length === 0 ? (
              <p className="text-muted text-xs">Transcript appears here during a live callâ€¦</p>
            ) : transcript.slice(-25).map((e, i) => (
              <div key={i} className={`text-xs rounded px-2 py-1 leading-snug ${
                e.speaker === 'agent' ? 'bg-accent/10 text-accent/90 ml-6' : 'bg-white/5 text-white/80 mr-6'
              }`}>
                <span className="font-bold font-rajdhani uppercase tracking-wide text-[9px] mr-1.5 opacity-60">
                  {e.speaker === 'agent' ? agentName : 'Lead'}:
                </span>
                {e.text}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* â”€â”€ MIDDLE: Battle Cards + Disposition + Prospect Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="w-72 flex flex-col gap-4 flex-shrink-0">
        <Card header={<><Zap size={12} /> AI Battle Cards</>} className="flex-1 overflow-y-auto">
          <BattleCardDisplay card={battleCard} loading={cardLoading} />
        </Card>

        {currentLead && (
          <Card header="ðŸ“‹ Disposition" noPadding>
            <div className="p-3">
              <DispositionSelector
                lead={currentLead}
                agentId={agentId}
                callLogId={callLogId}
                onDisposed={onDisposed}
                disabled={isOnCall}
              />
              {isOnCall && (
                <p className="text-muted text-[10px] mt-2 text-center">Hang up first to disposition</p>
              )}
            </div>
          </Card>
        )}

        {/* Prospect Activity Panel */}
        {currentLead?.sessionId && (
          <ProspectActivityPanel
            sessionId={currentLead.sessionId}
            placeId={currentLead.kgmid}
            agentId={agentId}
            businessName={currentLead.businessName}
          />
        )}
      </div>

      {/* â”€â”€ RIGHT: Live Prospect View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card
          header={
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-1.5">
                {currentLead?.sessionId
                  ? <><div className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" /> Live Prospect View</>
                  : <>ðŸ‘ Prospect View</>
                }
              </span>
              {currentLead?.sessionId && (
                <a
                  href={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/unlock?place_id=${encodeURIComponent(currentLead.kgmid)}&sessionId=${encodeURIComponent(currentLead.sessionId)}&agent_preview=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-accent hover:text-white uppercase tracking-widest font-bold transition"
                >
                  Open in tab â†—
                </a>
              )}
            </div>
          }
          noPadding
          className="flex-1 overflow-hidden"
        >
          {currentLead ? (
            <iframe
              key={currentLead.sessionId ?? currentLead.kgmid}
              src={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/unlock?place_id=${encodeURIComponent(currentLead.kgmid)}${currentLead.sessionId ? `&sessionId=${encodeURIComponent(currentLead.sessionId)}` : ''}&agent_preview=true`}
              className="w-full h-full border-0"
              title={`${currentLead.businessName} â€” Prospect View`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted gap-5 p-8">
              <div className="text-6xl opacity-10">ðŸ“‹</div>
              <div className="text-center space-y-1">
                <div className="text-sm text-white/50 font-rajdhani font-bold tracking-widest uppercase">
                  Ready to Dial
                </div>
                <div className="text-xs text-muted">
                  Load a lead to preview their unlock page.
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 w-full max-w-xs space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">
                  If queue stays empty:
                </div>
                {[
                  { icon: 'ðŸ“¢', text: 'Go to /supervisor â†’ activate a campaign' },
                  { icon: 'ðŸ“¥', text: 'Import a CSV with leads' },
                  { icon: 'ðŸ•', text: 'Check calling hours match lead timezones' },
                  { icon: 'âœ…', text: 'Verify leads are status: NEW in Firestore' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className="text-base leading-none">{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>

              <Button variant="primary" onClick={fetchNextLead} loading={fetchingLead}>
                <ChevronRight size={14} /> Get Next Lead
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

