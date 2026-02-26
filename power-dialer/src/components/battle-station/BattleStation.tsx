'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSignalWireDevice } from '@/hooks/useSignalWireDevice';
import { useSpeechTranscription } from '@/hooks/useSpeechTranscription';
import { useAgentMirror } from '@/hooks/useAgentMirror';
import { DispositionSelector } from '@/components/disposition/DispositionPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils';
import type { Lead, BattleCard, DispositionAction } from '@/types';
import {
  PhoneCall, PhoneOff, Mic, MicOff, VideoOff, Video,
  Zap, ChevronRight, Loader2, Wifi, WifiOff
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BattleStationProps {
  agentId:   string;
  agentName: string;
}

// ── Waveform animation ────────────────────────────────────────────────────────
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

// ── Battle Card display ───────────────────────────────────────────────────────
function BattleCardDisplay({ card, loading }: { card: BattleCard | null; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center gap-2 text-accent text-xs">
      <Loader2 size={14} className="animate-spin" /> Generating battle card…
    </div>
  );
  if (!card) return (
    <p className="text-muted text-xs">
      AI coach activates automatically when an objection keyword is detected in the transcript…
    </p>
  );
  return (
    <div className="space-y-2 animate-slideUp">
      <div className="bg-neon/5 border border-neon/20 rounded-lg p-3">
        <div className="text-[10px] tracking-widest uppercase text-neon font-rajdhani font-bold mb-1">⚡ Rebuttal</div>
        <p className="text-white text-[13px] leading-snug">"{card.rebuttal}"</p>
      </div>
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
        <div className="text-[10px] tracking-widest uppercase text-accent font-rajdhani font-bold mb-1">🎯 Follow Up</div>
        <p className="text-white text-[13px] leading-snug">"{card.followUp}"</p>
      </div>
      <div className="bg-amber/5 border border-amber/20 rounded-lg p-2 flex items-center gap-2">
        <span className="text-[10px] tracking-widest uppercase text-amber font-rajdhani font-bold">Tone:</span>
        <span className="text-white text-xs">{card.toneAdvice}</span>
      </div>
    </div>
  );
}

// ── Main BattleStation ────────────────────────────────────────────────────────
export default function BattleStation({ agentId, agentName }: BattleStationProps) {
  const [currentLead,   setCurrentLead]   = useState<Lead | null>(null);
  const [callLogId,     setCallLogId]     = useState<string>('');
  const [battleCard,    setBattleCard]    = useState<BattleCard | null>(null);
  const [cardLoading,   setCardLoading]   = useState(false);
  const [fetchingLead,  setFetchingLead]  = useState(false);
  const [isMuted,       setIsMuted]       = useState(false);
  const [mirrorOn,      setMirrorOn]      = useState(true);
  const [deviceReady,   setDeviceReady]   = useState(false);
  const heartbeatRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectionCooldown = useRef(false);

  // ── Register agent & start heartbeat ──────────────────────────────────────
  useEffect(() => {
    const register = async () => {
      try {
        await fetch('/api/agents/register', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ agentId, agentName }),
        });
        setDeviceReady(true);
      } catch {
        toast.error('Failed to register agent. Check Firebase connection.');
      }
    };
    register();

    // Heartbeat every 30 seconds
    heartbeatRef.current = setInterval(() => {
      fetch('/api/agents/heartbeat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId }),
      }).catch(() => {});
    }, 30_000);

    // Mark offline on tab close
    const handleUnload = () => {
      navigator.sendBeacon(`/api/agents/heartbeat?agentId=${agentId}`, '');
      // sendBeacon doesn't support DELETE, so we use a POST with a status flag
      navigator.sendBeacon('/api/agents/heartbeat', JSON.stringify({ agentId, status: 'OFFLINE' }));
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [agentId, agentName]);

  // ── Objection detected → Gemini battle card ───────────────────────────────
  const onObjectionDetected = useCallback(async (text: string) => {
    if (objectionCooldown.current || !currentLead) return;
    objectionCooldown.current = true;
    setTimeout(() => { objectionCooldown.current = false; }, 15_000);

    setCardLoading(true);
    try {
      const res = await fetch('/api/gemini/battlecard', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript:   `Lead: "${text}"`,
          businessType: currentLead.businessName,
        }),
      });
      if (!res.ok) throw new Error('Gemini error');
      const card = await res.json();
      setBattleCard(card);
      toast('⚡ Battle card ready', { icon: '🧠' });
    } catch {
      toast.error('AI coach unavailable');
    } finally {
      setCardLoading(false);
    }
  }, [currentLead]);

  // ── Speech transcription ──────────────────────────────────────────────────
  const onTranscriptUpdate = useCallback(async (entries: { speaker: string; text: string; timestamp: string }[]) => {
    if (!callLogId || entries.length === 0) return;
    const last = entries[entries.length - 1];
    // Async fire-and-forget transcript append
    fetch('/api/leads/calllog', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ callLogId, speaker: last.speaker, text: last.text }),
    }).catch(() => {});
  }, [callLogId]);

  const {
    isListening, transcript, start: startTranscript, stop: stopTranscript, clear: clearTranscript,
  } = useSpeechTranscription({ onObjection: onObjectionDetected, onTranscript: onTranscriptUpdate });

  const { videoRef, error: cameraError } = useAgentMirror();

  // ── SignalWire device ─────────────────────────────────────────────────────────
  const { state: callState, duration, callSid, makeCall, hangUp, mute, reinit } = useSignalWireDevice({
    agentId,
    onCallConnected: async (call) => {
      // Create the Firestore call log now that we have a real SignalWire CallSid
      try {
        const res = await fetch('/api/leads/calllog', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            leadId:       currentLead?.id,
            agentId,
            callSid: call.parameters?.CallSid ?? callSid ?? null,
          }),
        });
        const data = await res.json();
        if (data.callLogId) setCallLogId(data.callLogId);
      } catch {
        console.error('Failed to create call log');
      }
      startTranscript();
      toast.success('📞 Call connected');
    },
    onCallDisconnected: () => {
      stopTranscript();
      // Update agent status back to AVAILABLE
      fetch('/api/agents/heartbeat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId, status: 'AVAILABLE' }),
      }).catch(() => {});
    },
    onError: (err) => {
      toast.error(`SignalWire: ${err.message}`);
    },
  });

  // ── Fetch next lead from queue ─────────────────────────────────────────────
  const fetchNextLead = async () => {
    setFetchingLead(true);
    try {
      const res = await fetch('/api/leads/next', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (data.lead) {
        setCurrentLead(data.lead);
        setCallLogId(''); // reset — will be created on call connect
        clearTranscript();
        setBattleCard(null);
        toast.success(`🎯 ${data.lead.businessName} loaded`);
      } else {
        toast(data.message ?? 'Queue empty', { icon: '⏳' });
      }
    } catch {
      toast.error('Failed to fetch lead');
    } finally {
      setFetchingLead(false);
    }
  };

  const handleDial = () => {
    if (!currentLead) return;
    makeCall(currentLead.phone);
  };

  const handleHangUp = () => {
    hangUp();
    stopTranscript();
  };

  const toggleMute = () => {
    mute(!isMuted);
    setIsMuted(m => !m);
  };

  const onDisposed = (action: DispositionAction, squareUrl?: string) => {
    if (action === 'SUCCESS' && squareUrl) {
      window.open(squareUrl, '_blank');
      toast.success('💰 Payment link opened!');
    }
    setCurrentLead(null);
    setBattleCard(null);
    setCallLogId('');
    clearTranscript();
  };

  const isOnCall = callState === 'in-call' || callState === 'ringing' || callState === 'connecting';

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">

      {/* ── LEFT COLUMN: Mirror + Softphone ────────────────────────────────── */}
      <div className="w-72 flex flex-col gap-4 flex-shrink-0">

        {/* Agent Mirror */}
        <Card header={<><Video size={12} /> Agent Mirror</>} noPadding>
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
                <span className="text-[10px] tracking-widest uppercase">{cameraError ?? 'Camera off'}</span>
              </div>
            )}

            {/* Call overlay */}
            {isOnCall && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-2">
                <Waveform />
                <span className="font-mono text-2xl text-neon font-bold">{formatDuration(duration)}</span>
                <span className="text-[10px] text-neon/60 tracking-widest uppercase">
                  {callState === 'ringing' ? 'Ringing…' : callState === 'connecting' ? 'Connecting…' : 'Live'}
                </span>
              </div>
            )}

            {/* Mirror toggle */}
            <button
              onClick={() => setMirrorOn(m => !m)}
              className="absolute top-2 right-2 bg-black/50 rounded p-1 text-muted hover:text-white"
            >
              {mirrorOn ? <Video size={12} /> : <VideoOff size={12} />}
            </button>

            {/* Device status dot */}
            <div className="absolute top-2 left-2">
              {deviceReady
                ? <Wifi size={12} className="text-neon" />
                : <WifiOff size={12} className="text-danger" />}
            </div>
          </div>

          {/* Softphone controls */}
          <div className="p-3 space-y-2">
            {currentLead ? (
              <div className="text-center mb-2">
                <div className="text-white font-rajdhani font-bold text-sm truncate">{currentLead.businessName}</div>
                <div className="text-muted text-xs font-mono tracking-wider">{currentLead.phone}</div>
                <div className="text-muted text-[10px] mt-0.5">
                  {currentLead.timezone} · Attempt #{currentLead.retryCount + 1}
                </div>
                <div className="text-[10px] mt-0.5 capitalize text-amber">
                  {currentLead.status.replace('_', ' ').toLowerCase()}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted text-xs py-1">No lead loaded</div>
            )}

            <div className="flex gap-2">
              {!isOnCall ? (
                <Button
                  variant="success"
                  size="md"
                  className="flex-1"
                  onClick={handleDial}
                  disabled={!currentLead || callState === 'error' || !deviceReady}
                >
                  <PhoneCall size={14} /> Dial
                </Button>
              ) : (
                <Button variant="danger" size="md" className="flex-1" onClick={handleHangUp}>
                  <PhoneOff size={14} /> Hang Up
                </Button>
              )}
              <Button
                variant={isMuted ? 'danger' : 'ghost'}
                size="md"
                onClick={toggleMute}
                disabled={!isOnCall}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              loading={fetchingLead}
              onClick={fetchNextLead}
              disabled={isOnCall}
            >
              <ChevronRight size={12} /> Next Lead from Queue
            </Button>

            {callState === 'error' && (
              <Button variant="amber" size="sm" className="w-full" onClick={reinit}>
                Reconnect SignalWire Device
              </Button>
            )}
          </div>
        </Card>

        {/* Live Transcript */}
        <Card
          header={
            <div className="flex items-center gap-2 w-full">
              <Mic size={12} />
              <span>{isListening ? 'Listening…' : 'Transcript'}</span>
              {isListening && (
                <div className="ml-auto flex gap-[2px] items-center h-3">
                  {[0, 1, 2].map(i => (
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
              <p className="text-muted text-xs">Transcript appears here during a live call…</p>
            ) : (
              transcript.slice(-25).map((e, i) => (
                <div key={i} className={`text-xs rounded px-2 py-1 leading-snug ${
                  e.speaker === 'agent'
                    ? 'bg-accent/10 text-accent/90 ml-6'
                    : 'bg-white/5 text-white/80 mr-6'
                }`}>
                  <span className="font-bold font-rajdhani uppercase tracking-wide text-[9px] mr-1.5 opacity-60">
                    {e.speaker === 'agent' ? agentName : 'Lead'}:
                  </span>
                  {e.text}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ── MIDDLE COLUMN: AI Battle Cards + Disposition ─────────────────────── */}
      <div className="w-72 flex flex-col gap-4 flex-shrink-0">
        <Card header={<><Zap size={12} /> AI Battle Cards</>} className="flex-1 overflow-y-auto">
          <BattleCardDisplay card={battleCard} loading={cardLoading} />
        </Card>

        {currentLead && (
          <Card header="📋 Disposition" noPadding>
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
      </div>

      {/* ── RIGHT COLUMN: Concierge iFrame ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card header="🔍 Concierge Preview" noPadding className="flex-1 overflow-hidden">
          {currentLead ? (
            <iframe
              key={currentLead.kgmid}
              src={`https://agenticlife.com/concierge?place_id=${encodeURIComponent(currentLead.kgmid)}&demo=true`}
              className="w-full h-full border-0"
              title={`Concierge — ${currentLead.businessName}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted gap-4 p-8">
              <div className="text-6xl opacity-10">🔍</div>
              <div className="text-center">
                <div className="text-sm text-white/50 font-rajdhani font-bold tracking-widest uppercase">
                  No Lead Loaded
                </div>
                <div className="text-xs text-muted mt-1">
                  The Concierge preview will appear here once you load a lead from the queue.
                </div>
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
