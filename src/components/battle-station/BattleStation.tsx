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
import type { Lead, BattleCard } from '@/types';
import {
  PhoneCall, PhoneOff, Mic, MicOff, Zap, ChevronRight, 
  Loader2, Wifi, Play, Pause, Square, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BattleStationProps {
  agentId:   string;
  agentName: string;
}

type DialerMode = 'IDLE' | 'ACTIVE' | 'PAUSED';

// ── Waveform ──────────────────────────────────────────────────────────────────
function Waveform() {
  return (
    <div className="flex items-center gap-[3px] h-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="w-[3px] bg-neon rounded-sm animate-waveBar" style={{ animationDelay: `${i * 0.08}s`, height: '100%' }} />
      ))}
    </div>
  );
}

// ── BattleStation Component ───────────────────────────────────────────────────
export default function BattleStation({ agentId, agentName }: BattleStationProps) {
  const [mode, setMode] = useState<DialerMode>('IDLE');
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [callLogId, setCallLogId] = useState('');
  const [battleCard, setBattleCard] = useState<BattleCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [fetchingLead, setFetchingLead] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectionCooldown = useRef(false);

  // ── Session Sync & Heartbeat ──
  useEffect(() => {
    fetch('/api/agents/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, agentName }),
    }).then(() => setDeviceReady(true)).catch(() => toast.error('Sync Error'));

    heartbeatRef.current = setInterval(() => {
      fetch('/api/agents/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, status: mode }),
      }).catch(() => {});
    }, 30000);

    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [agentId, agentName, mode]);

  // ── Callbacks ──
  const onObjectionDetected = useCallback(async (text: string) => {
    if (objectionCooldown.current || !currentLead) return;
    objectionCooldown.current = true;
    setTimeout(() => { objectionCooldown.current = false; }, 15000);
    setCardLoading(true);
    try {
      const res = await fetch('/api/gemini/battlecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, businessType: currentLead.businessName }),
      });
      setBattleCard(await res.json());
    } finally { setCardLoading(false); }
  }, [currentLead]);

  const { isListening, transcript, start: startTranscript, stop: stopTranscript, clear: clearTranscript } = 
    useSpeechTranscription({ onObjection: onObjectionDetected, onTranscript: () => {} });

  const { state: callState, duration, makeCall, hangUp, mute } = useSignalWireDevice({
    agentId,
    onCallConnected: () => {
      startTranscript();
      toast.success('CONNECTED');
    },
    onCallDisconnected: () => {
      stopTranscript();
      // If mode is ACTIVE, wait 3 seconds then grab next lead
      if (mode === 'ACTIVE') {
        toast('Next lead in 3s...', { icon: '⏳' });
        setTimeout(fetchNextLead, 3000);
      }
    }
  });

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
        console.log('Lead fields:', JSON.stringify(data.lead));
        clearTranscript();
        setBattleCard(null);
        // AUTO-DIAL if active
        makeCall(data.lead.id);
      } else {
        setMode('IDLE');
        toast.error('Queue Finished');
      }
    } finally { setFetchingLead(false); }
  }, [agentId, makeCall, clearTranscript]);

  // ── Controls ──
  const startSession = () => { setMode('ACTIVE'); fetchNextLead(); };
  const pauseSession = () => setMode('PAUSED');
  const stopSession = () => { setMode('IDLE'); setCurrentLead(null); hangUp(); };

  const isOnCall = callState === 'in-call' || callState === 'ringing';

  return (
    <div className="h-full flex gap-4 p-4 bg-bg overflow-hidden text-white">
      
      {/* LEFT: Unlock Mirror + Session Controls */}
      <div className="w-[450px] flex flex-col gap-4 flex-shrink-0">
        <Card header={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2"><Wifi size={12} className="text-accent" /> Prospect Mirror (Unlock)</div>
            {currentLead && <a href={`/unlock?place_id=${currentLead.kgmid}&name=${encodeURIComponent(currentLead.businessName ?? '')}&address=${encodeURIComponent(currentLead.address ?? '')}`}target="_blank" className="text-white/40 hover:text-white"><ExternalLink size={12} /></a>}
          </div>
        } noPadding>
          <div className="relative bg-black aspect-[4/3] border-b border-white/5 overflow-hidden">
            {currentLead ? (
              <iframe
                src={`/unlock?place_id=${currentLead.kgmid}&name=${encodeURIComponent(currentLead.businessName ?? '')}&address=${encodeURIComponent(currentLead.address ?? '')}&sessionId=${currentLead.sessionId}&agent_preview=true`}
                className="w-full h-full border-0 pointer-events-none"
                title="Prospect Mirror"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/10 text-[10px] uppercase tracking-[4px]">
                {mode === 'ACTIVE' ? 'Dialing Next...' : 'Dialer Standby'}
              </div>
            )}
            {isOnCall && (
              <div className="absolute top-4 right-4 bg-black/80 px-4 py-2 rounded-xl border border-neon/30 flex items-center gap-3">
                <Waveform />
                <span className="font-mono text-xl text-neon font-bold">{formatDuration(duration)}</span>
              </div>
            )}
          </div>
          
          <div className="p-4 grid grid-cols-2 gap-2 bg-white/5">
            {mode === 'IDLE' ? (
              <Button variant="success" className="col-span-2 py-6 text-lg" onClick={startSession} disabled={!deviceReady}>
                <Play size={20} className="mr-2" /> Start New Session
              </Button>
            ) : (
              <>
                <Button variant={mode === 'ACTIVE' ? 'ghost' : 'success'} onClick={mode === 'ACTIVE' ? pauseSession : startSession}>
                  {mode === 'ACTIVE' ? <><Pause size={14} className="mr-2" /> Pause Session</> : <><Play size={14} className="mr-2" /> Resume Session</>}
                </Button>
                <Button variant="danger" onClick={stopSession}>
                  <Square size={14} className="mr-2" /> Stop Dialer
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* TRANSCRIPT */}
        <Card header={<div className="flex items-center gap-2"><Mic size={12} /> Live Audio Transcript</div>} className="flex-1 overflow-hidden">
           <div className="space-y-4 overflow-y-auto h-full p-4 text-[13px] leading-relaxed">
              {transcript.map((t, i) => (
                 <div key={i} className={t.speaker === 'Agent' ? 'text-accent border-l-2 border-accent/20 pl-3' : 'text-white border-l-2 border-white/10 pl-3'}>
                    <span className="font-bold uppercase text-[9px] opacity-40 mb-1 block">{t.speaker}</span>
                    {t.text}
                 </div>
              ))}
              {transcript.length === 0 && <p className="text-white/10 italic">No audio detected yet...</p>}
           </div>
        </Card>
      </div>

      {/* MIDDLE: Coaching + Disposition */}
      <div className="w-80 flex flex-col gap-4 flex-shrink-0">
        <Card header={<><Zap size={12} className="text-neon" /> AI Battle Card</>}>
          {cardLoading ? <div className="flex items-center gap-2 text-accent text-xs animate-pulse"><Loader2 size={14} className="animate-spin" /> Thinking...</div> : (
            battleCard ? (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-neon/10 border border-neon/30 rounded-lg p-3">
                  <div className="text-[10px] tracking-widest uppercase text-neon font-bold mb-1">⚡ Rebuttal</div>
                  <p className="text-white text-[13px]">{battleCard.rebuttal}</p>
                </div>
                <div className="bg-accent/10 border border-accent/30 rounded-lg p-3">
                  <div className="text-[10px] tracking-widest uppercase text-accent font-bold mb-1">🎯 Follow Up</div>
                  <p className="text-white text-[13px]">{battleCard.followUp}</p>
                </div>
              </div>
            ) : <p className="text-white/20 text-xs italic">Coaching tips will appear here.</p>
          )}
        </Card>
        <Card header={<><ChevronRight size={12} /> Disposition</>} className="flex-1">
          <DispositionSelector 
  lead={currentLead}
  agentId={agentId}
  callLogId={callLogId}
  onDisposed={(action, squareUrl) => {
    if (mode === 'ACTIVE') {
      toast('Next lead in 3s...', { icon: '⏳' });
      setTimeout(fetchNextLead, 3000);
    }
  }}
  disabled={!currentLead}
/>
        </Card>
      </div>

      {/* RIGHT: Active Prospect Data */}
      <div className="flex-1 min-w-0">
        <ProspectActivityPanel lead={currentLead} onNext={fetchNextLead} loading={fetchingLead} onSendEmail={() => {}} />
      </div>
    </div>
  );
}
